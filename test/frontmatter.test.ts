import { describe, expect, it } from "vitest";
import { asNumber, asNumberOrNull, asString } from "../src/frontmatter";

describe("frontmatter readers", () => {
	it("asString keeps text and drops everything else", () => {
		expect(asString("a")).toBe("a");
		for (const value of [1, true, null, undefined, ["a"], { a: 1 }]) expect(asString(value)).toBe("");
	});

	it("asNumberOrNull reads numbers written either way", () => {
		expect(asNumberOrNull(1420)).toBe(1420);
		expect(asNumberOrNull("1420")).toBe(1420);
		expect(asNumberOrNull("12.5")).toBe(12.5);
	});

	it("asNumberOrNull treats anything else as absent", () => {
		for (const value of ["", "abc", Number.NaN, Number.POSITIVE_INFINITY, null, undefined, [], {}, true]) {
			expect(asNumberOrNull(value), String(value)).toBeNull();
		}
	});

	it("asNumber falls back only when there is no number", () => {
		expect(asNumber("7", 1)).toBe(7);
		expect(asNumber(0, 1)).toBe(0);
		expect(asNumber("x", 1)).toBe(1);
	});
});
