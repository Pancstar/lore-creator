import { App, TFile } from "obsidian";

/**
 * Frontmatter link fields arrive as `[[Target]]` or `[[Target|Alias]]` strings.
 * Bare text is accepted too, since hand-edited notes do not always use brackets.
 */
export function linkTarget(value: unknown): string {
	const text = typeof value === "string" ? value.trim() : "";
	if (!text) return "";
	const match = text.match(/^\[\[([^\]|]+)(?:\|[^\]]*)?\]\]$/);
	return linkPath(match ? match[1] : text);
}

/**
 * The note part of a link text: `Scene#Part 2`, `Scene^abc` and `Scene|alias`
 * all point at `Scene`. Resolving the whole text would report a perfectly
 * good link as broken, since no file is called `Scene#Part 2`. The alias cut
 * matters for unquoted YAML, where the brackets are gone by the time we read it.
 */
export function linkPath(text: string): string {
	const cut = text.search(/[#^|]/);
	return (cut === -1 ? text : text.slice(0, cut)).trim();
}

/**
 * Reads a field that may hold a single link or a list of them. An unquoted
 * `[[X]]` in YAML parses as nested lists (`[["X"]]` for a scalar, `[[["X"]]]`
 * for a list item), so arrays are flattened all the way down rather than read
 * as broken entries.
 */
export function linkTargets(value: unknown): string[] {
	if (value === undefined || value === null) return [];
	const flat: unknown[] = [];
	const visit = (entry: unknown) => {
		if (Array.isArray(entry)) (entry as unknown[]).forEach(visit);
		else flat.push(entry);
	};
	visit(value);
	return flat.map(linkTarget).filter((target) => target.length > 0);
}

/**
 * A `[[link]]` the plugin writes into a record (`version-of`, `promoted-to`…).
 * Obsidian picks the link text that names only this file (by default the
 * shortest one; the vault's link format setting may make it relative or
 * absolute), so two notes sharing a name cannot be mixed up later.
 */
export function linkTo(app: App, file: TFile, sourcePath: string): string {
	return `[[${app.metadataCache.fileToLinktext(file, sourcePath, true)}]]`;
}

export function resolveLink(app: App, linkpath: string, sourcePath: string): TFile | null {
	return app.metadataCache.getFirstLinkpathDest(linkpath, sourcePath);
}

/** Resolves a link field to the files it points at, dropping anything missing. */
export function resolveTargets(app: App, value: unknown, sourcePath: string): TFile[] {
	const files: TFile[] = [];
	for (const target of linkTargets(value)) {
		const file = resolveLink(app, target, sourcePath);
		if (file) files.push(file);
	}
	return files;
}
