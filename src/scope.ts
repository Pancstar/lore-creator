import { App, TFile, normalizePath } from "obsidian";

/**
 * Template notes carry a real `type`, `status` and timeline fields so new notes
 * can copy them, but they are blueprints, not part of the story. Every vault
 * scan goes through `loreFiles` so templates never show up as notes.
 */
let templatesPrefix = "";

/** Called on load and whenever settings change. */
export function setTemplatesFolder(folder: string) {
	const normalized = folder.trim() ? normalizePath(folder) : "";
	templatesPrefix = normalized && normalized !== "/" ? `${normalized}/` : "";
}

export function isTemplate(file: TFile): boolean {
	return templatesPrefix !== "" && file.path.startsWith(templatesPrefix);
}

/** Every markdown file that belongs to the story, templates left out. */
export function loreFiles(app: App): TFile[] {
	return app.vault.getMarkdownFiles().filter((file) => !isTemplate(file));
}
