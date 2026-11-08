import type { App, TFile } from "obsidian";
import { TFile as StubFile } from "./obsidian-stub";
import { linkTargets } from "../src/links";

export type Frontmatter = Record<string, unknown>;

/**
 * The slice of `App` the audit and the views read. Notes are keyed by vault
 * path; `body` lists the `[[links]]` a note's text contains, which Obsidian
 * exposes through `metadataCache.resolvedLinks` together with frontmatter links.
 */
export function makeApp(notes: Record<string, Frontmatter>, body: Record<string, string[]> = {}) {
	const files = new Map<string, TFile>();
	for (const path of Object.keys(notes)) {
		const file = new StubFile();
		file.path = path;
		file.basename = path.split("/").pop()!.replace(/\.md$/, "");
		files.set(path, file as unknown as TFile);
	}

	const resolve = (link: string): TFile | null => {
		const wanted = link.replace(/\.md$/, "").toLowerCase();
		for (const file of files.values()) {
			if (file.path.replace(/\.md$/, "").toLowerCase() === wanted) return file;
		}
		for (const file of files.values()) {
			if (file.basename.toLowerCase() === wanted) return file;
		}
		return null;
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

	const app = {
		vault: {
			getMarkdownFiles: () => [...files.values()],
			getFileByPath: (path: string) => files.get(path) ?? null,
		},
		metadataCache: {
			getFileCache: (file: TFile) => ({ frontmatter: notes[file.path] }),
			getFirstLinkpathDest: (link: string, _source: string) => resolve(link),
			// Shortest text that names only this file: the name, or the path when shared.
			fileToLinktext: (file: TFile, _source: string, _omitMd?: boolean) => {
				const shared = [...files.values()].filter((other) => other.basename === file.basename).length > 1;
				return shared ? file.path.replace(/\.md$/, "") : file.basename;
			},
			resolvedLinks,
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
