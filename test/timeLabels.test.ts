import { describe, expect, it } from "vitest";
import { findAutoLabels, relabelNotes } from "../src/timeLabels";
import { en, tr } from "../src/i18n";
import { DEFAULT_TIME, Time } from "../src/universe";
import { rescaleTime } from "../src/time";
import { makeApp } from "./fakeApp";

const TEMPLATES = [en["time.dayLabel"], tr["time.dayLabel"]];
const before: Time = { ...DEFAULT_TIME, timeName: "Xen", timeUnit: "cycle", timeDays: 360 };
const renamed: Time = { ...before, timeName: "Isles", timeUnit: "year" };

describe("findAutoLabels", () => {
	const notes = (): Record<string, Record<string, unknown>> => ({
		// Labels the plugin wrote: in English, in Turkish, at year precision.
		"Auto.md": { time: 3 + 4 / 360, "time-precision": "date", "time-label": "Xen cycle 3, day 5" },
		"Oto.md": { time: 3 + 4 / 360, "time-precision": "date", "time-label": "Xen cycle 3, 5. gün" },
		"Year.md": { time: 7, "time-label": "Xen cycle 7" },
		// The author's own wording, and a note without a label.
		"Own.md": { time: 3, "time-precision": "date", "time-label": "The long winter" },
		"Bare.md": { time: 3, "time-precision": "date" },
	});

	it("finds only labels that are exactly what the plugin writes, in either language", () => {
		const { app } = makeApp(notes());
		expect(findAutoLabels(app, before, TEMPLATES).map((entry) => entry.file.path).sort()).toEqual([
			"Auto.md",
			"Oto.md",
			"Year.md",
		]);
	});

	it("rewrites them for the new system in the language they were written in, leaving the rest", async () => {
		const data = notes();
		const { app } = makeApp(data);
		const found = findAutoLabels(app, before, TEMPLATES);

		const result = await relabelNotes(app, found, renamed);

		expect(result).toMatchObject({ updated: 3, failed: null });
		expect(data["Auto.md"]["time-label"]).toBe("Isles year 3, day 5");
		expect(data["Oto.md"]["time-label"]).toBe("Isles year 3, 5. gün");
		expect(data["Year.md"]["time-label"]).toBe("Isles year 7");
		expect(data["Own.md"]["time-label"]).toBe("The long winter");
		expect(data["Bare.md"]["time-label"]).toBeUndefined();
	});

	it("reads the time as it is now, so a rescaled note gets the label for its new value", async () => {
		const data = notes();
		const { app } = makeApp(data);
		const found = findAutoLabels(app, before, TEMPLATES);
		// Rescaled to 400 days a unit while keeping day 5.
		data["Auto.md"].time = 3 + 4 / 400;
		data["Oto.md"].time = 3 + 4 / 400;

		await relabelNotes(app, found, { ...before, timeDays: 400 });

		expect(data["Auto.md"]["time-label"]).toBe("Xen cycle 3, day 5");
		expect(data["Oto.md"]["time-label"]).toBe("Xen cycle 3, 5. gün");
	});

	it("leaves a label the author changed in the meantime", async () => {
		const data = notes();
		const { app } = makeApp(data);
		const found = findAutoLabels(app, before, TEMPLATES);
		data["Auto.md"]["time-label"] = "Edited meanwhile";

		const result = await relabelNotes(app, found, renamed);

		expect(data["Auto.md"]["time-label"]).toBe("Edited meanwhile");
		expect(result.updated).toBe(2);
	});

	it("counts only labels the new system would actually change", () => {
		const { app } = makeApp(notes());
		const found = findAutoLabels(app, before, TEMPLATES);
		expect(found.filter((entry) => entry.label !== entry.nextLabel(renamed)).length).toBe(3);
		expect(found.filter((entry) => entry.label !== entry.nextLabel({ ...before, earthEpoch: 1850 })).length).toBe(0);
	});
});

describe("time labels (review)", () => {
	it("leaves a note whose precision changed after it was found", async () => {
		const data: Record<string, Record<string, unknown>> = {
			"Year.md": { time: 7, "time-label": "Xen cycle 7" },
		};
		const { app } = makeApp(data);
		const found = findAutoLabels(app, before, TEMPLATES);
		data["Year.md"]["time-precision"] = "date";

		const result = await relabelNotes(app, found, renamed);

		expect(result.updated).toBe(0);
		expect(data["Year.md"]["time-label"]).toBe("Xen cycle 7");
	});

	it("handles date-and-time labels in both languages", async () => {
		const value = 2 + (9 * 1440 + 8 * 60 + 5) / (360 * 1440);
		const data: Record<string, Record<string, unknown>> = {
			"En.md": { time: value, "time-precision": "datetime", "time-label": "Xen cycle 2, day 10 08:05" },
			"Tr.md": { time: value, "time-precision": "datetime", "time-label": "Xen cycle 2, 10. gün 08:05" },
		};
		const { app } = makeApp(data);
		const found = findAutoLabels(app, before, TEMPLATES);
		expect(found).toHaveLength(2);

		await relabelNotes(app, found, renamed);

		expect(data["En.md"]["time-label"]).toBe("Isles year 2, day 10 08:05");
		expect(data["Tr.md"]["time-label"]).toBe("Isles year 2, 10. gün 08:05");
	});

	it("predicts exactly what a rescale-then-relabel writes, the last day clamped", async () => {
		const days365: Time = { ...before, timeDays: 365 };
		const days360: Time = { ...before, timeDays: 360 };
		const data: Record<string, Record<string, unknown>> = {
			"Last.md": { time: 4 + 364 / 365, "time-precision": "date", "time-label": "Xen cycle 4, day 365" },
			"Mid.md": { time: 4 + 99 / 365, "time-precision": "date", "time-label": "Xen cycle 4, day 100" },
		};
		const { app } = makeApp(data);
		const found = findAutoLabels(app, days365, TEMPLATES);
		const predicted = found.map((entry) =>
			entry.nextLabel(days360, rescaleTime(entry.value, 365, 360, entry.precision)),
		);

		for (const entry of found) {
			const note = data[entry.file.path];
			note.time = rescaleTime(note.time as number, 365, 360, entry.precision);
		}
		await relabelNotes(app, found, days360);

		expect(found.map((entry) => data[entry.file.path]["time-label"])).toEqual(predicted);
		expect(data["Last.md"]["time-label"]).toBe("Xen cycle 4, day 360");
		expect(data["Mid.md"]["time-label"]).toBe("Xen cycle 4, day 100");
	});

	it("puts every rewritten label back when a later write fails", async () => {
		const data = {
			"A.md": { time: 1, "time-label": "Xen cycle 1" },
			"B.md": { time: 2, "time-label": "Xen cycle 2" },
		} as Record<string, Record<string, unknown>>;
		const { app } = makeApp(data, {}, { failWrites: ["B.md"] });
		const found = findAutoLabels(app, before, TEMPLATES);

		const result = await relabelNotes(app, found, renamed);

		expect(result.failed?.path).toBe("B.md");
		expect(result.updated).toBe(0);
		expect(data["A.md"]["time-label"]).toBe("Xen cycle 1");
		expect(data["B.md"]["time-label"]).toBe("Xen cycle 2");
	});
});

describe("dayLabelTemplates (review)", () => {
	it("holds the day wording of every interface language", async () => {
		const { dayLabelTemplates, LANGUAGES } = await import("../src/i18n");
		expect(dayLabelTemplates()).toHaveLength(LANGUAGES.filter((language) => language !== "auto").length);
		expect(dayLabelTemplates()).toEqual(expect.arrayContaining(TEMPLATES));
	});
});
