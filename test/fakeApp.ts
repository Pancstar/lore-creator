import type { App, TFile } from "obsidian";
import { TFile as StubFile } from "./obsidian-stub";
import { linkTargets } from "../src/links";

export type Frontmatter = Record<string, unknown>;

/**
 * The slice of `App` the audit and the views read. Notes are keyed by vault
 * path; `body` lists the `[[links]]` a note's text contains, which Obsidian
 * exposes through `metadataCache.resolvedLinks` together with frontmatter links.
 */
export function makeApp(
	notes: Record<string, Frontmatter>,
	body: Record<string, string[]> = {},
	options: { failWrites?: string[] } = {},
) {
	const files = new Map<string, TFile>();
	for (const path of Object.keys(notes)) {
		const file = new StubFile();
		file.path = path;
		file.basename = path.split("/").pop()!.replace(/\.md$/, "");
		const folder = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
		(file as unknown as { parent: unknown }).parent = {
			path: folder || "/",
			name: folder.split("/").pop() ?? "",
			isRoot: () => folder === "",
		};
		files.set(path, file as unknown as TFile);
	}

	// Looked up like Obsidian does, by map rather than by scanning every file,
	// so large synthetic vaults stay fast: an exact path first, then a name.
	const byPath = new Map<string, TFile>();
	const byName = new Map<string, TFile>();
	for (const file of files.values()) {
		byPath.set(file.path.replace(/\.md$/, "").toLowerCase(), file);
		const name = file.basename.toLowerCase();
		if (!byName.has(name)) byName.set(name, file);
	}
	const resolve = (link: string): TFile | null => {
		const wanted = link.replace(/\.md$/, "").toLowerCase();
		return byPath.get(wanted) ?? byName.get(wanted) ?? null;
	};

	/** Frontmatter values written as `[[...]]`, which is what Obsidian indexes. */
	const frontmatterLinks = (frontmatter: Frontmatter): string[] => {
		const found: string[] = [];
		const visit = (value: unknown) => {
			if (typeof value === "string") {
				if (value.trim().startsWith("[[")) found.push(...linkTargets(value));
			} else if (Array.isArray(value)) {
				value.forEach(visit);
			}
		};
		Object.values(frontmatter ?? {}).forEach(visit);
		return found;
	};

	const resolvedLinks: Record<string, Record<string, number>> = {};
	for (const [path, frontmatter] of Object.entries(notes)) {
		const targets: Record<string, number> = {};
		for (const link of [...(body[path] ?? []), ...frontmatterLinks(frontmatter)]) {
			const target = resolve(link);
			if (target) targets[target.path] = (targets[target.path] ?? 0) + 1;
		}
		resolvedLinks[path] = targets;
	}

	/** "changed" listeners, fired after a frontmatter write like Obsidian's index would. */
	const listeners = new Set<(file: TFile) => void>();

	const app = {
		fileManager: {
			processFrontMatter: async (file: TFile, edit: (frontmatter: Frontmatter) => void) => {
				if (options.failWrites?.includes(file.path)) throw new Error(`write refused: ${file.path}`);
				notes[file.path] = notes[file.path] ?? {};
				edit(notes[file.path]);
				for (const listener of [...listeners]) listener(file);
			},
		},
		vault: {
			getMarkdownFiles: () => [...files.values()],
			getFileByPath: (path: string) => files.get(path) ?? null,
		},
		metadataCache: {
			getFileCache: (file: TFile) => ({ frontmatter: notes[file.path] }),
			getFirstLinkpathDest: (link: string, _source: string) => resolve(link),
			// Shortest text that names only this file: the name, or the path when shared.
			fileToLinktext: (file: TFile, _source: string, _omitMd?: boolean) => {
				const name = file.basename.toLowerCase();
				const shared = [...files.values()].filter((other) => other.basename.toLowerCase() === name).length > 1;
				return shared ? file.path.replace(/\.md$/, "") : file.basename;
			},
			resolvedLinks,
			on: (_event: "changed", listener: (file: TFile) => void) => {
				listeners.add(listener);
				return listener;
			},
			offref: (ref: (file: TFile) => void) => listeners.delete(ref),
		},
	} as unknown as App;

	return { app, files, file: (path: string) => files.get(path)! };
}

/** A registry note with the default types plus the fields a test needs. */
export function registryNote(extraFields: Record<string, { name: string; kind: string }[]> = {}): Frontmatter {
	const type = (id: string, timeline: boolean) => ({
		id,
		tr: id,
		en: id,
		icon: "",
		timeline,
		fields: [{ name: "related", kind: "links" }, ...(extraFields[id] ?? [])],
	});
	return {
		registry: [
			type("story", true),
			type("character", true),
			type("place", false),
			type("event", true),
			type("law", false),
			type("draft", false),
			type("timeline", false),
		],
	};
}
