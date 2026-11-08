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

describe("I18n.t", () => {
	it("fills every placeholder literally, keeps unknown ones", async () => {
		const { I18n } = await import("../src/i18n");
		const i18n = new I18n() as unknown as { table: Record<string, string>; t: (k: string, ...a: string[]) => string };
		i18n.table = { x: "{0} and {0}, then {1} and {2}" };
		expect(i18n.t("x", "a$&b", "$1")).toBe("a$&b and a$&b, then $1 and {2}");
	});
});

describe("I18n.t (review)", () => {
	it("does not fill placeholders that came in through an argument", async () => {
		const { I18n } = await import("../src/i18n");
		const i18n = new I18n() as unknown as { table: Record<string, string>; t: (k: string, ...a: string[]) => string };
		i18n.table = { x: "{0} and {0}, then {1} and {2}" };
		expect(i18n.t("x", "{1}", "B")).toBe("{1} and {1}, then B and {2}");
	});
});
