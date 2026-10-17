import { describe, expect, it } from "vitest";
import {
	fitSummary,
	SUMMARY_CHAR_CEILING,
	SUMMARY_GROWTH_CHARS,
	summaryBudget,
} from "../src/core/compaction/summary-budget.ts";

function oversized(): string {
	const done = Array.from({ length: 50 }, (_, i) => `- [x] item ${i} ${"d".repeat(700)}`).join("\n");
	const main = [
		"## Goal",
		"Ship the checkpoint",
		"",
		"## Constraints & Preferences",
		"- keep paths",
		"",
		"## Progress",
		"### Done",
		done,
		"",
		"### In Progress",
		"- [ ] current work",
		"",
		"### Blocked",
		"- none",
		"",
		"## Key Decisions",
		"- **Keep paths**: the read tool needs them",
		"",
		"## Next Steps",
		"1. continue",
		"",
		"## Critical Context",
		`- ${"c".repeat(8_000)}`,
	].join("\n");
	const turn = [
		"",
		"---",
		"",
		"**Turn Context (split turn):**",
		"",
		"## Original Request",
		"Do the thing",
		"",
		"## Progress So Far",
		"- did the recent part",
		"",
		"## Context Needed to Continue",
		"- src/keep.ts",
	].join("\n");
	const lists = [
		"",
		"<read-files>",
		"src/a.ts",
		"</read-files>",
		"",
		"<modified-files>",
		"src/b.ts",
		"</modified-files>",
	].join("\n");
	return `${main}\n${turn}${lists}`;
}

describe("summaryBudget", () => {
	it("starts at the ceiling and allows 4,000 characters of growth under it", () => {
		expect(summaryBudget(0)).toBe(SUMMARY_CHAR_CEILING);
		expect(summaryBudget(Number.NaN)).toBe(SUMMARY_CHAR_CEILING);
		expect(summaryBudget(-5)).toBe(SUMMARY_CHAR_CEILING);
		expect(summaryBudget(10_000)).toBe(10_000 + SUMMARY_GROWTH_CHARS);
		expect(summaryBudget(30_000)).toBe(SUMMARY_CHAR_CEILING);
		expect(summaryBudget(52_556)).toBe(SUMMARY_CHAR_CEILING);
	});
});

describe("fitSummary", () => {
	it("leaves a short summary alone", () => {
		expect(fitSummary("## Goal\nKeep", 100)).toBe("## Goal\nKeep");
	});

	it("drops the oldest Done bullets and keeps the turn block and file lists", () => {
		const summary = oversized();
		expect(summary.length).toBeGreaterThan(SUMMARY_CHAR_CEILING);

		const fitted = fitSummary(summary, summaryBudget(summary.length));

		expect(fitted.length).toBeLessThanOrEqual(SUMMARY_CHAR_CEILING);
		expect(fitted.startsWith("## Goal")).toBe(true);
		expect(fitted).toContain("**Turn Context (split turn):**");
		expect(fitted).toContain("## Original Request");
		expect(fitted).toContain("<read-files>\nsrc/a.ts\n</read-files>");
		expect(fitted).toContain("<modified-files>\nsrc/b.ts\n</modified-files>");
		expect(fitted).toContain("item 49 ");
		expect(fitted).not.toContain("item 0 ");
		expect(fitted).toContain("Older completed detail was dropped");
	});

	it("caps growth when the previous summary is under the ceiling", () => {
		const previous = `## Goal\nKeep\n\n### Done\n${"- [x] old\n".repeat(200)}`;
		const grown = `${previous}\n- [x] brand new ${"n".repeat(8_000)}`;
		const fitted = fitSummary(grown, summaryBudget(previous.length));

		expect(previous.length).toBeLessThan(SUMMARY_CHAR_CEILING);
		expect(grown.length).toBeGreaterThan(summaryBudget(previous.length));
		expect(fitted.length).toBeLessThanOrEqual(summaryBudget(previous.length));
	});
});
