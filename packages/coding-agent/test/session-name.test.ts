import { describe, expect, it } from "vitest";
import { stripOuterQuotes } from "../src/core/session-name.ts";

describe("stripOuterQuotes", () => {
	it("drops one matching outer pair", () => {
		expect(stripOuterQuotes('"Chicken Door Tamer"')).toBe("Chicken Door Tamer");
		expect(stripOuterQuotes("'Flaky CI Wrangler'")).toBe("Flaky CI Wrangler");
		expect(stripOuterQuotes("\u201cCanvas Leak Plumber\u201d")).toBe("Canvas Leak Plumber");
		expect(stripOuterQuotes('  " padded "  ')).toBe("padded");
	});

	it("keeps unmatched, inner, and lone quotes", () => {
		expect(stripOuterQuotes('"half')).toBe('"half');
		expect(stripOuterQuotes("it's fine")).toBe("it's fine");
		expect(stripOuterQuotes('say "hi" now')).toBe('say "hi" now');
		expect(stripOuterQuotes('"')).toBe('"');
		expect(stripOuterQuotes("\"mixed'")).toBe("\"mixed'");
	});

	it("only strips one layer", () => {
		expect(stripOuterQuotes("\"'nested'\"")).toBe("'nested'");
	});
});
