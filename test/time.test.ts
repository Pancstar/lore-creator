import { describe, expect, it } from "vitest";
import {
	daysPerYear,
	formatLabel,
	formatTime,
	parseUniverseDate,
	partsToTime,
	rescaleTime,
	timeToParts,
	validateTime,
} from "../src/time";
import { DEFAULT_TIME, Time } from "../src/universe";

const xen: Time = { ...DEFAULT_TIME, timeName: "Xen", timeUnit: "cycle", timeDays: 360 };

describe("partsToTime / timeToParts", () => {
	it("round-trips at every precision", () => {
		const parts = { year: 12, day: 165, hour: 7, minute: 30 };
		expect(timeToParts(partsToTime(parts, xen, "datetime"), xen, "datetime")).toEqual(parts);
		expect(timeToParts(partsToTime(parts, xen, "date"), xen, "date")).toEqual({ ...parts, hour: 0, minute: 0 });
		expect(partsToTime(parts, xen, "year")).toBe(12);
	});

	it("keeps a fractional year untouched at year precision", () => {
		expect(timeToParts(7.25, xen, "year").year).toBe(7.25);
	});

	it("rolls a value just below the next year into that year", () => {
		expect(timeToParts(4.99999999, xen, "date")).toEqual({ year: 5, day: 1, hour: 0, minute: 0 });
	});

	it("treats a missing or zero day count as 365", () => {
		expect(daysPerYear({ ...xen, timeDays: 0 })).toBe(365);
	});
});

describe("formatLabel / formatTime", () => {
	it("writes the label in either language", () => {
		const parts = { year: 12, day: 5, hour: 9, minute: 3 };
		expect(formatLabel(parts, xen, "year", "en")).toBe("Xen cycle 12");
		expect(formatLabel(parts, xen, "date", "en")).toBe("Xen cycle 12, day 5");
		expect(formatLabel(parts, xen, "date", "tr")).toBe("Xen cycle 12, 5. gün");
		expect(formatLabel(parts, xen, "datetime", "en")).toBe("Xen cycle 12, day 5 09:03");
	});

	it("floors a fractional year in the label", () => {
		expect(formatTime(7.9, xen, "year", "en")).toBe("Xen cycle 7");
	});
});

describe("rescaleTime", () => {
	it("keeps year, day and clock when the day count changes", () => {
		const before = partsToTime({ year: 3, day: 100, hour: 6, minute: 0 }, xen, "datetime");
		const after = rescaleTime(before, 360, 400, "datetime");
		expect(timeToParts(after, { ...xen, timeDays: 400 }, "datetime")).toEqual({ year: 3, day: 100, hour: 6, minute: 0 });
	});

	it("moves a day past the new count onto the last day, and leaves year precision alone", () => {
		const before = partsToTime({ year: 1, day: 350, hour: 0, minute: 0 }, xen, "date");
		const after = rescaleTime(before, 360, 300, "date");
		expect(timeToParts(after, { ...xen, timeDays: 300 }, "date").day).toBe(300);
		expect(rescaleTime(5.5, 360, 300, "year")).toBe(5.5);
	});
});

describe("parseUniverseDate", () => {
	it("reads a year or a year/day, and clamps the day", () => {
		expect(parseUniverseDate("12", xen)).toBe(12);
		expect(parseUniverseDate("12/1", xen)).toBe(12);
		expect(parseUniverseDate("12/999", xen)).toBe(partsToTime({ year: 12, day: 360, hour: 0, minute: 0 }, xen, "date"));
	});

	it("rejects what it cannot read", () => {
		for (const text of ["", "  ", "x", "1/2/3", "1.5/2", "1/x"]) expect(parseUniverseDate(text, xen), text).toBeNull();
	});
});

describe("validateTime", () => {
	it("accepts the default time system", () => {
		expect(validateTime(DEFAULT_TIME)).toEqual([]);
	});

	it("names every unusable value", () => {
		expect(validateTime({ ...DEFAULT_TIME, timeDays: 0 })).toContain("days");
		expect(validateTime({ ...DEFAULT_TIME, timeDays: 3.5 })).toContain("days");
		expect(validateTime({ ...DEFAULT_TIME, timeEpoch: Number.NaN })).toContain("epoch");
		expect(validateTime({ ...DEFAULT_TIME, earthEpoch: Number.NaN })).toContain("earthEpoch");
		expect(validateTime({ ...DEFAULT_TIME, earthEpoch: 2000, earthRatio: 0 })).toContain("ratio");
	});

	it("ignores the ratio when nothing converts to Earth time", () => {
		expect(validateTime({ ...DEFAULT_TIME, earthEpoch: null, earthRatio: 0 })).toEqual([]);
		expect(validateTime({ ...DEFAULT_TIME, async: true, earthEpoch: 2000, earthRatio: 0 })).toEqual([]);
	});
});
