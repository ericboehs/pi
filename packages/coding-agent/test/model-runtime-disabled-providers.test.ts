import { InMemoryCredentialStore } from "@earendil-works/pi-ai";
import { describe, expect, it } from "vitest";
import { ModelRuntime } from "../src/core/model-runtime.ts";

describe("ModelRuntime disabled providers", () => {
	it("hides disabled providers from availability reads but keeps them in the catalog", async () => {
		const credentials = new InMemoryCredentialStore();
		await credentials.modify("anthropic", async () => ({ type: "api_key", key: "a" }));
		await credentials.modify("openai", async () => ({ type: "api_key", key: "o" }));
		const runtime = await ModelRuntime.create({ credentials, modelsPath: null, allowModelNetwork: false });
		await runtime.getAvailable();
		const providers = () => new Set(runtime.getAvailableSnapshot().map((model) => model.provider));
		expect(providers().has("openai")).toBe(true);

		runtime.setDisabledProviders(["openai"]);
		expect(providers().has("openai")).toBe(false);
		expect(providers().has("anthropic")).toBe(true);
		expect((await runtime.getAvailable()).some((model) => model.provider === "openai")).toBe(false);
		expect(await runtime.getAvailable("openai")).toEqual([]);
		expect(runtime.getModels().some((model) => model.provider === "openai")).toBe(true);
		expect(runtime.hasConfiguredAuth("openai")).toBe(true);

		runtime.setDisabledProviders(undefined);
		expect(providers().has("openai")).toBe(true);
	});
});
