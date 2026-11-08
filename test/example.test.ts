import { describe, expect, it } from "vitest";
import { foldersToTidy } from "../src/guide/exampleContent";

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
