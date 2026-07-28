import { App, TFile } from "obsidian";

/**
 * Frontmatter link fields arrive as `[[Target]]` or `[[Target|Alias]]` strings.
 * Bare text is accepted too, since hand-edited notes do not always use brackets.
 */
export function linkTarget(value: unknown): string {
	const text = typeof value === "string" ? value.trim() : "";
	if (!text) return "";
	const match = text.match(/^\[\[([^\]|]+)(?:\|[^\]]*)?\]\]$/);
	return (match ? match[1] : text).trim();
}

/** Reads a field that may hold a single link or a list of them. */
export function linkTargets(value: unknown): string[] {
	const raw = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
	return raw.map(linkTarget).filter((target) => target.length > 0);
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
