import { App, TFile } from "obsidian";
import { isExampleNote } from "./example";

/**
 * Marks a row that belongs to the example story, so learning pages are never
 * mistaken for the author's own (user decision: shown, but labelled).
 */
export function addExampleBadge(parent: HTMLElement, app: App, file: TFile, label: string): void {
	if (!isExampleNote(app.metadataCache.getFileCache(file)?.frontmatter)) return;
	parent.createSpan({ cls: "plc-badge plc-badge-example", text: label });
}
