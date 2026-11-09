import { Notice } from "obsidian";
import type LorePlugin from "../main";
import { dayLabelTemplates } from "../i18n";
import { AutoLabel, findAutoLabels, relabelNotes } from "../timeLabels";
import type { Time } from "../universe";
import { askChoice } from "./choice";

/**
 * Labels the plugin wrote under `before` that would read differently under
 * `after`. `valueOf` gives a note's time after the change (a rescale may move it).
 */
export function labelsToChange(
	plugin: LorePlugin,
	before: Time,
	after: Time,
	valueOf: (entry: AutoLabel) => number = (entry) => entry.value,
): AutoLabel[] {
	return findAutoLabels(plugin.app, before, dayLabelTemplates()).filter(
		(entry) => entry.label !== entry.nextLabel(after, valueOf(entry)),
	);
}

export type RelabelAnswer = "relabel" | "leave" | "cancel";

/** Asks whether the plugin's own labels follow the new time system. */
export function askRelabel(plugin: LorePlugin, count: number, withCancel: boolean): Promise<RelabelAnswer | null> {
	const t = (key: string, ...args: string[]) => plugin.i18n.t(key, ...args);
	return askChoice<RelabelAnswer>(plugin.app, {
		title: t("time.labels.title"),
		body: t("time.labels.body", String(count)),
		buttons: [
			...(withCancel ? [{ id: "cancel" as const, label: t("common.cancel") }] : []),
			{ id: "leave", label: t("time.labels.leave") },
			{ id: "relabel", label: t("time.labels.do"), cta: true },
		],
	});
}

/** Rewrites the labels; returns how many changed, or null after reporting a failure. */
export async function runRelabel(plugin: LorePlugin, labels: AutoLabel[], after: Time): Promise<number | null> {
	const result = await relabelNotes(plugin.app, labels, after);
	if (result.failed) {
		console.error("Lore Creator: updating time labels failed", result.error);
		new Notice(plugin.i18n.t("time.labels.failed", result.failed.path), 8000);
		return null;
	}
	return result.updated;
}

/**
 * After the time system changed somewhere without its own dialog (the name
 * field in settings): offers once to bring the plugin's labels along.
 */
export async function offerRelabel(plugin: LorePlugin, before: Time, after: Time): Promise<void> {
	const labels = labelsToChange(plugin, before, after);
	if (labels.length === 0) return;
	if ((await askRelabel(plugin, labels.length, false)) !== "relabel") return;
	const updated = await runRelabel(plugin, labels, after);
	if (updated) new Notice(plugin.i18n.t("time.labels.done", String(updated)));
}
