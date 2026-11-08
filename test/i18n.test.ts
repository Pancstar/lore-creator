import { describe, expect, it } from "vitest";
import { en, tr } from "../src/i18n";
import { ISSUE_KINDS } from "../src/audit";

describe("i18n tables", () => {
	it("hold the same keys in English and Turkish", () => {
		const enKeys = Object.keys(en).sort();
		const trKeys = Object.keys(tr).sort();
		expect(trKeys).toEqual(enKeys);
	});

	it("name every issue kind, long and short, in both languages", () => {
		for (const kind of ISSUE_KINDS) {
			for (const table of [en, tr]) {
				expect(table[`audit.${kind}`], `audit.${kind}`).toBeTruthy();
				expect(table[`audit.chip.${kind}`], `audit.chip.${kind}`).toBeTruthy();
			}
		}
	});
});
