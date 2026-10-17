import { zstdDecompressSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { type AnthropicOptions, stream as streamAnthropic } from "../src/api/anthropic-messages.ts";
import type { AnthropicMessagesCompat, Model } from "../src/types.ts";
import { normalizeContext } from "../src/utils/transcript.ts";

interface CapturedRequest {
	url: string;
	contentEncoding: string | null;
	contentType: string | null;
	authorization: string | null;
	body: Record<string, unknown>;
	compressed: boolean;
}

const context = normalizeContext({ messages: [{ role: "user", content: "Hello", timestamp: 1 }] });

function makeModel(provider: string, baseUrl: string, compat?: AnthropicMessagesCompat): Model<"anthropic-messages"> {
	return {
		id: "claude-sonnet-4.6",
		name: "Test Claude",
		api: "anthropic-messages",
		provider,
		baseUrl,
		reasoning: false,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 200000,
		maxTokens: 100,
		...(compat ? { compat } : {}),
	};
}

function successResponse(): Response {
	const events = [
		{
			type: "message_start",
			message: { id: "msg_test", model: "claude-sonnet-4.6", usage: { input_tokens: 10, output_tokens: 0 } },
		},
		{ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 1 } },
		{ type: "message_stop" },
	];
	return new Response(events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(""), {
		headers: { "content-type": "text/event-stream" },
	});
}

function rejectBodyResponse(status = 400): Response {
	return new Response("Failed to read request body.", { status });
}

function harness(respond: (request: CapturedRequest, attempt: number) => Response) {
	const requests: CapturedRequest[] = [];
	const fetch: NonNullable<AnthropicOptions["fetch"]> = async (input, init) => {
		const headers = new Headers(init?.headers);
		const rawBody = init?.body;
		const compressed = rawBody instanceof Uint8Array;
		const text = compressed ? Buffer.from(zstdDecompressSync(rawBody)).toString("utf8") : (rawBody as string);
		const request: CapturedRequest = {
			url: String(input),
			contentEncoding: headers.get("content-encoding"),
			contentType: headers.get("content-type"),
			authorization: headers.get("authorization"),
			body: JSON.parse(text) as Record<string, unknown>,
			compressed,
		};
		requests.push(request);
		return respond(request, requests.length);
	};
	return { requests, options: { apiKey: "test-token", fetch, maxRetries: 0 } satisfies AnthropicOptions };
}

async function run(model: Model<"anthropic-messages">, options: AnthropicOptions) {
	const s = streamAnthropic(model, context, options);
	for await (const _event of s) {
		// drain
	}
	return s.result();
}

describe("Anthropic request body compression", () => {
	it("zstd-compresses request bodies for github-copilot by default", async () => {
		const { requests, options } = harness(() => successResponse());
		const result = await run(makeModel("github-copilot", "https://copilot-default.example"), options);

		expect(result.stopReason).toBe("stop");
		expect(requests).toHaveLength(1);
		const [request] = requests;
		expect(request.compressed).toBe(true);
		expect(request.contentEncoding).toBe("zstd");
		expect(request.contentType).toBe("application/json");
		expect(request.authorization).toBe("Bearer test-token");
		expect(request.url).toBe("https://copilot-default.example/v1/messages?beta=true");
		expect(request.body).toMatchObject({ model: "claude-sonnet-4.6", stream: true, max_tokens: 100 });
		expect(request.body.messages).toMatchObject([{ role: "user", content: [{ type: "text", text: "Hello" }] }]);
	});

	it("sends uncompressed bodies when compat.requestCompression is none", async () => {
		const { requests, options } = harness(() => successResponse());
		await run(makeModel("github-copilot", "https://copilot-off.example", { requestCompression: "none" }), options);

		expect(requests).toHaveLength(1);
		expect(requests[0].compressed).toBe(false);
		expect(requests[0].contentEncoding).toBeNull();
	});

	it("sends uncompressed bodies for non-copilot providers by default", async () => {
		const { requests, options } = harness(() => successResponse());
		await run(makeModel("anthropic", "https://anthropic-default.example"), options);

		expect(requests).toHaveLength(1);
		expect(requests[0].compressed).toBe(false);
		expect(requests[0].contentEncoding).toBeNull();
	});

	it("compresses for other providers when compat.requestCompression is zstd", async () => {
		const { requests, options } = harness(() => successResponse());
		await run(makeModel("custom", "https://custom-zstd.example", { requestCompression: "zstd" }), options);

		expect(requests).toHaveLength(1);
		expect(requests[0].compressed).toBe(true);
		expect(requests[0].contentEncoding).toBe("zstd");
	});

	it.each([400, 415])("retries uncompressed after a %i and stops compressing for that base URL", async (status) => {
		const model = makeModel("github-copilot", `https://copilot-reject-${status}.example`);
		const { requests, options } = harness((request) =>
			request.compressed && request.url.startsWith(model.baseUrl) ? rejectBodyResponse(status) : successResponse(),
		);

		const first = await run(model, options);
		expect(first.stopReason).toBe("stop");
		expect(requests.map((request) => request.compressed)).toEqual([true, false]);
		expect(requests[1].contentEncoding).toBeNull();
		expect(requests[1].body).toEqual(requests[0].body);

		const second = await run(model, options);
		expect(second.stopReason).toBe("stop");
		expect(requests.map((request) => request.compressed)).toEqual([true, false, false]);

		// Other endpoints keep compressing.
		await run(makeModel("github-copilot", `https://copilot-other-${status}.example`), options);
		expect(requests.at(-1)?.compressed).toBe(true);
	});

	it("keeps compressing when the uncompressed retry is rejected too", async () => {
		const model = makeModel("github-copilot", "https://copilot-bad-request.example");
		const { requests, options } = harness((_request, attempt) =>
			attempt <= 2 ? rejectBodyResponse(400) : successResponse(),
		);

		const first = await run(model, options);
		expect(first.stopReason).toBe("error");
		expect(requests.map((request) => request.compressed)).toEqual([true, false]);

		await run(model, options);
		expect(requests.map((request) => request.compressed)).toEqual([true, false, true]);
	});
});
