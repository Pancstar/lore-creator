import { App, TFile } from "obsidian";
import { asNumberOrNull, asString } from "./frontmatter";
import { TimePrecision, formatTime, isTimePrecision } from "./time";
import { loreFiles } from "./scope";
import type { Time } from "./universe";

/** A note whose `time-label` is exactly what the plugin writes for its time. */
export interface AutoLabel {
	file: TFile;
	/** The label as found. */
	label: string;
	value: number;
	precision: TimePrecision;
	/** The day wording it was written with (`time.dayLabel` of its language). */
	template: string;
	/** The label the plugin would write for `value` (by default the current one) under `next`. */
	nextLabel(next: Time, value?: number): string;
}

function precisionOf(frontmatter: Record<string, unknown>): TimePrecision {
	const precision = frontmatter["time-precision"];
	return isTimePrecision(precision) ? precision : "year";
}

/**
 * Notes whose label the plugin generated rather than the author wrote: the
 * label equals what the plugin writes for the note's time under `time`, in
 * one of the interface languages (`templates`, each a `time.dayLabel`).
 * Only these follow the time system when it changes.
 */
export function findAutoLabels(app: App, time: Time, templates: string[]): AutoLabel[] {
	const found: AutoLabel[] = [];
	for (const file of loreFiles(app)) {
		const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
		if (!frontmatter) continue;
		const label = asString(frontmatter["time-label"]);
		const value = asNumberOrNull(frontmatter.time);
		if (!label || value === null) continue;

		const precision = precisionOf(frontmatter);
		const template = templates.find((candidate) => formatTime(value, time, precision, candidate) === label);
		if (template === undefined) continue;

		found.push({
			file,
			label,
			value,
			precision,
			template,
			nextLabel: (next, at = value) => formatTime(at, next, precision, template),
		});
	}
	return found;
}

export interface RelabelResult {
	updated: number;
	failed: TFile | null;
	error: unknown;
}

/**
 * Rewrites each found label for `next`, reading the note's time as it is now
 * (a rescale may just have moved it). A note whose label changed since it was
 * found keeps the author's edit. All or nothing: if a write fails, the labels
 * already rewritten are put back.
 */
export async function relabelNotes(app: App, labels: AutoLabel[], next: Time): Promise<RelabelResult> {
	const done: { file: TFile; label: string }[] = [];

	for (const entry of labels) {
		try {
			await app.fileManager.processFrontMatter(entry.file, (frontmatter: Record<string, unknown>) => {
				// The author may have edited the note since: then it is theirs.
				if (asString(frontmatter["time-label"]) !== entry.label) return;
				if (precisionOf(frontmatter) !== entry.precision) return;
				const value = asNumberOrNull(frontmatter.time);
				if (value === null) return;
				const label = formatTime(value, next, entry.precision, entry.template);
				if (label === entry.label) return;
				frontmatter["time-label"] = label;
				done.push({ file: entry.file, label: entry.label });
			});
		} catch (error) {
			for (const previous of done) {
				try {
					await app.fileManager.processFrontMatter(previous.file, (frontmatter: Record<string, unknown>) => {
						frontmatter["time-label"] = previous.label;
					});
				} catch (restoreError) {
					console.error("Lore Creator: could not restore a time label", previous.file.path, restoreError);
				}
			}
			return { updated: 0, failed: entry.file, error };
		}
	}
	return { updated: done.length, failed: null, error: null };
}
