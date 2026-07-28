import { App, TFile, normalizePath } from "obsidian";
import type { TypeDefinition } from "./types";

export interface NoteDraft {
	type: TypeDefinition;
	title: string;
	icon: string;
	iconType: "emoji" | "lucide";
	/** Extra frontmatter written after the standard fields. */
	extra?: Record<string, string>;
	/** Body to use in place of the template's, with its leading heading removed. */
	body?: string;
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
const LEADING_HEADING = /^#\s+.*(\r?\n)+/;

export function sanitiseFileName(title: string): string {
	return title.replace(/[\\/:*?"<>|#^[\]]/g, "-").trim();
}

export async function ensureFolder(app: App, folder: string): Promise<void> {
	if (!folder) return;
	const normalized = normalizePath(folder);
	if (app.vault.getFolderByPath(normalized)) return;
	await app.vault.createFolder(normalized);
}

/** Strips frontmatter and a leading H1 so a body can be reused elsewhere. */
export function extractBody(content: string): string {
	const withoutFrontmatter = content.replace(FRONTMATTER, "");
	return withoutFrontmatter.replace(LEADING_HEADING, "").trimStart();
}

export function templateFor(app: App, templatesFolder: string, type: TypeDefinition): TFile | null {
	if (!type.template) return null;
	return app.vault.getFileByPath(normalizePath(`${templatesFolder}/${type.template}.md`));
}

/**
 * Builds note content from the type's template so the author's own headings
 * survive, then overwrites only the fields the plugin is responsible for.
 */
export async function buildNoteContent(
	app: App,
	templatesFolder: string,
	draft: NoteDraft,
): Promise<string> {
	const template = templateFor(app, templatesFolder, draft.type);
	const templateContent = template ? await app.vault.cachedRead(template) : "";

	const match = templateContent.match(FRONTMATTER);
	const templateFrontmatter = match ? match[1] : "";
	const templateBody = match ? templateContent.slice(match[0].length) : templateContent;

	const overrides: Record<string, string> = {
		type: draft.type.id,
		icon: draft.icon ? `"${draft.icon}"` : "",
		"icon-type": draft.iconType,
		status: "draft",
		...(draft.extra ?? {}),
	};

	const lines = templateFrontmatter.length > 0 ? templateFrontmatter.split(/\r?\n/) : [];
	const seen = new Set<string>();

	const merged = lines.map((line) => {
		const key = line.match(/^([A-Za-z][\w-]*):/)?.[1];
		if (!key || !(key in overrides)) return line;
		seen.add(key);
		return `${key}: ${overrides[key]}`;
	});

	for (const [key, value] of Object.entries(overrides)) {
		if (!seen.has(key)) merged.push(`${key}: ${value}`);
	}

	// A template with no timeline fields still gets them when the type belongs on
	// a timeline, so placing the note later needs no hand editing.
	if (draft.type.timeline && !merged.some((line) => line.startsWith("timeline:"))) {
		merged.push("timeline:", "flow:", "time:", "time-precision: year", "time-label:", "prev: []", "next: []");
	}

	const body = draft.body !== undefined ? draft.body : replaceHeading(templateBody, draft.title);
	const heading = draft.body !== undefined ? `# ${draft.title}\n\n` : "";

	return `---\n${merged.join("\n")}\n---\n${heading}${body}`;
}

function replaceHeading(templateBody: string, title: string): string {
	const heading = templateBody.match(/^#\s+.*$/m);
	return heading
		? templateBody.replace(heading[0], `# ${title}`)
		: `# ${title}\n${templateBody}`;
}
