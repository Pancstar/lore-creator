import { describe, expect, it } from "vitest";
import type { App, TFile } from "obsidian";
import { rescaleNotes } from "../src/timeRescale";

/** Just enough of `App` for rescaling: frontmatter held in memory, edited in place. */
function fakeApp(notes: Record<string, Record<string, unknown>>) {
	const files = Object.keys(notes).map((path) => ({ path, basename: path.replace(/\.md$/, "") }) as TFile);
	const app = {
		fileManager: {
			processFrontMatter: async (file: TFile, edit: (frontmatter: Record<string, unknown>) => void) => {
				edit(notes[file.path]);
			},
		},
	} as unknown as App;
	return { app, files };
}

describe("rescaleNotes", () => {
	it("counts only notes whose numbers actually changed", async () => {
		const notes = {
			"Moved.md": { time: 1 + 99 / 360, "time-precision": "date" },
			// Day 1 is day 1 whatever a year holds: nothing to change.
			"Same.md": { time: 5, "time-precision": "date" },
			"Year.md": { time: 7.5, "time-precision": "year" },
		};
		const { app, files } = fakeApp(notes);
		const result = await rescaleNotes(app, files, 360, 400);
		expect(result.updated).toBe(1);
		expect(result.originals.map((entry) => entry.file.path)).toEqual(["Moved.md"]);
		expect(notes["Same.md"].time).toBe(5);
		expect(notes["Year.md"].time).toBe(7.5);
	});
});
