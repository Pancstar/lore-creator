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

/**
 * How many markdown files carry each name, case-folded as Obsidian matches
 * names. Every file counts, templates too: a bare name can resolve to any.
 */
export function sharedBasenames(app: App): Map<string, number> {
	const shared = new Map<string, number>();
	for (const file of app.vault.getMarkdownFiles()) {
		const key = file.basename.toLowerCase();
		shared.set(key, (shared.get(key) ?? 0) + 1);
	}
	return shared;
}

/**
 * A bare `[[Name]]` that several files answer to, so Obsidian may pick the
 * wrong one. Records written before v0.9.6 may name their note this way.
 * Obsidian would read it as a root-level note of that name, but an old record
 * could just as well mean another one, so that counts as ambiguous too; a
 * root-level note is named exactly with its extension (`Name.md`).
 * Pass `shared` when checking many links at once.
 */
export function isAmbiguousLink(app: App, link: string, shared: Map<string, number> = sharedBasenames(app)): boolean {
	return !link.includes("/") && !link.toLowerCase().endsWith(".md") && (shared.get(link.toLowerCase()) ?? 0) > 1;
}

/**
 * Link text for a record the plugin keeps (`version-of`, version sets) that
 * names `file` and nothing else, now and when read back later: its name while
 * no other note shares it, its path when one does, with the extension for a
 * root-level note (`Mira.md`) so it is never mistaken for an old bare record.
 */
export function recordLink(app: App, file: TFile): string {
	if ((sharedBasenames(app).get(file.basename.toLowerCase()) ?? 0) <= 1) return file.basename;
	return file.path.includes("/") ? file.path.replace(/\.md$/i, "") : file.path;
}

/** Every markdown file a bare name could mean. */
export function linkCandidates(app: App, link: string): TFile[] {
	const wanted = link.toLowerCase();
	return app.vault.getMarkdownFiles().filter((file) => file.basename.toLowerCase() === wanted);
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
