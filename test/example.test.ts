import { describe, expect, it } from "vitest";
import { buildExampleNotes, foldersToTidy } from "../src/guide/exampleContent";

describe("foldersToTidy", () => {
	const roots = ["Lore Creator Example", "Lore Creator Örnek"];

	it("lists only folders that held a removed example page, deepest first", () => {
		const removed = ["Lore Creator Example/Mira.md", "Lore Creator Example/Versions/Relight — v1.md", "Mira.md"];
		expect(foldersToTidy(removed, roots)).toEqual(["Lore Creator Example/Versions", "Lore Creator Example"]);
	});

	it("never lists an example-named folder nothing was removed from", () => {
		expect(foldersToTidy(["Elsewhere/Mira.md"], roots)).toEqual([]);
	});
});

describe("example story relations (v0.10.0)", () => {
	it("says who takes part and where, so the relations view has something to show", () => {
		for (const lang of ["en", "tr"] as const) {
			const notes = buildExampleNotes(lang);
			const withField = (field: string) => notes.filter((entry) => entry.content.includes(`\n${field}:`)).length;
			expect(withField("participants"), lang).toBeGreaterThanOrEqual(4);
			expect(withField("location"), lang).toBeGreaterThanOrEqual(4);
			expect(withField("inhabitants"), lang).toBe(1);
		}
	});
});
