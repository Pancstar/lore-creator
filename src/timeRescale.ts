import { App, TFile } from "obsidian";
import { asNumberOrNull } from "./frontmatter";
import { TimePrecision, isTimePrecision, rescaleTime } from "./time";
import { loreFiles } from "./scope";

/** Precisions that carry a day, and so depend on the universe's day count. */
function hasDay(precision: unknown): precision is Exclude<TimePrecision, "year"> {
	return isTimePrecision(precision) && precision !== "year";
}

/**
 * Notes whose stored time would shift if the day count changed: dated or
 * timed notes, archived versions included so switching back to one never
 * brings an old encoding with it.
 */
export function findDatedNotes(app: App): TFile[] {
	const files: TFile[] = [];
	for (const file of loreFiles(app)) {
		const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
		if (!frontmatter || !hasDay(frontmatter["time-precision"])) continue;
		const time = asNumberOrNull(frontmatter.time);
		const timeEnd = asNumberOrNull(frontmatter["time-end"]);
		if (time !== null || timeEnd !== null) files.push(file);
	}
	return files;
}

export interface RescaleResult {
	updated: number;
	failed: TFile | null;
	error: unknown;
	/** Notes that stayed rescaled because putting them back failed too. */
	unrestored: TFile[];
	/** What each rewritten note held before, for `undoRescale`. */
	originals: Original[];
}

export interface Original {
	file: TFile;
	time: unknown;
	timeEnd: unknown;
}

/**
 * Re-encodes `time` and `time-end` so every note keeps its year, day and clock
 * under the new day count. `time-label` is the author's wording and is left
 * alone.
 *
 * All or nothing: if any write fails, notes already rewritten are put back to
 * their original values, and `updated` is 0. The caller must save the new
 * day count to the universe note **only when `failed` is null**, and must
 * call `undoRescale` if that save fails, so notes and the time system never
 * disagree.
 */
export async function rescaleNotes(
	app: App,
	files: TFile[],
	oldDays: number,
	newDays: number,
): Promise<RescaleResult> {
	const originals: Original[] = [];

	for (const file of files) {
		try {
			await app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
				const precision = frontmatter["time-precision"];
				if (!hasDay(precision)) return;

				const time = asNumberOrNull(frontmatter.time);
				const timeEnd = asNumberOrNull(frontmatter["time-end"]);
				const nextTime = time === null ? null : rescaleTime(time, oldDays, newDays, precision);
				const nextEnd = timeEnd === null ? null : rescaleTime(timeEnd, oldDays, newDays, precision);
				// A note whose day lands on the same number (day 1, say) is not
				// touched and not counted: the summary says what really changed.
				if (nextTime === time && nextEnd === timeEnd) return;

				originals.push({ file, time: frontmatter.time, timeEnd: frontmatter["time-end"] });
				if (nextTime !== null) frontmatter.time = nextTime;
				if (nextEnd !== null) frontmatter["time-end"] = nextEnd;
			});
		} catch (error) {
			const earlier = originals.filter((entry) => entry.file !== file);
			const unrestored = await restore(app, earlier);
			return { updated: 0, failed: file, error, unrestored, originals: [] };
		}
	}

	return { updated: originals.length, failed: null, error: null, unrestored: [], originals };
}

/**
 * Puts every note a successful rescale touched back the way it was, for when
 * the time system itself could not be saved. Returns the notes it could not
 * restore.
 */
export async function undoRescale(app: App, result: RescaleResult): Promise<TFile[]> {
	return restore(app, result.originals);
}

/** Best-effort undo; returns the files it could not restore instead of stopping. */
async function restore(app: App, originals: Original[]): Promise<TFile[]> {
	const failed: TFile[] = [];
	for (const original of originals) {
		try {
			await app.fileManager.processFrontMatter(original.file, (frontmatter: Record<string, unknown>) => {
				if (original.time === undefined) delete frontmatter.time;
				else frontmatter.time = original.time;
				if (original.timeEnd === undefined) delete frontmatter["time-end"];
				else frontmatter["time-end"] = original.timeEnd;
			});
		} catch (error) {
			console.error("Lore Creator: could not restore", original.file.path, error);
			failed.push(original.file);
		}
	}
	return failed;
}
