import { App, TFile } from "obsidian";

export type FieldKind =
	| "text"
	| "number"
	| "link"
	| "links"
	| "list"
	| "time"
	| "select"
	| "boolean"
	| "aliases";

export interface FieldDefinition {
	name: string;
	tr: string;
	en: string;
	kind: FieldKind;
	options?: string[];
}

export interface TypeDefinition {
	id: string;
	tr: string;
	en: string;
	icon: string;
	folder: string;
	template: string;
	/** Whether new notes of this type start with timeline fields filled in. */
	timeline: boolean;
	fields: FieldDefinition[];
}

/**
 * Used when the registry note is missing or unreadable, so the plugin still
 * works in a vault that has not been set up yet.
 */
export const FALLBACK_TYPES: TypeDefinition[] = [
	{ id: "story", tr: "Hikaye", en: "Story", icon: "📖", folder: "", template: "", timeline: true, fields: [] },
	{ id: "character", tr: "Karakter", en: "Character", icon: "👤", folder: "", template: "", timeline: true, fields: [] },
	{ id: "place", tr: "Mekân", en: "Place", icon: "🪐", folder: "", template: "", timeline: false, fields: [] },
	{ id: "event", tr: "Olay", en: "Event", icon: "⚡", folder: "", template: "", timeline: true, fields: [] },
	{ id: "law", tr: "Yasa", en: "Law", icon: "📜", folder: "", template: "", timeline: false, fields: [] },
	{ id: "draft", tr: "Taslak", en: "Draft", icon: "💭", folder: "", template: "", timeline: false, fields: [] },
];

const FIELD_KINDS: FieldKind[] = [
	"text",
	"number",
	"link",
	"links",
	"list",
	"time",
	"select",
	"boolean",
	"aliases",
];

function str(value: unknown, fallback = ""): string {
	return typeof value === "string" ? value : fallback;
}

function strArray(value: unknown): string[] | undefined {
	if (!Array.isArray(value)) return undefined;
	return value.map((entry) => String(entry));
}

function parseField(raw: unknown): FieldDefinition | null {
	if (typeof raw !== "object" || raw === null) return null;
	const record = raw as Record<string, unknown>;
	const name = str(record.name);
	if (!name) return null;

	const kindRaw = str(record.kind, "text") as FieldKind;
	const kind = FIELD_KINDS.includes(kindRaw) ? kindRaw : "text";

	return {
		name,
		tr: str(record.tr, name),
		en: str(record.en, name),
		kind,
		options: strArray(record.options),
	};
}

function parseType(raw: unknown): TypeDefinition | null {
	if (typeof raw !== "object" || raw === null) return null;
	const record = raw as Record<string, unknown>;
	const id = str(record.id);
	if (!id) return null;

	const fields = Array.isArray(record.fields)
		? record.fields.map(parseField).filter((field): field is FieldDefinition => field !== null)
		: [];

	return {
		id,
		tr: str(record.tr, id),
		en: str(record.en, id),
		icon: str(record.icon),
		folder: str(record.folder),
		template: str(record.template),
		timeline: record.timeline === true,
		fields,
	};
}

/**
 * Reads the type registry from the registry note's frontmatter. The note body
 * documents the same types for human readers; frontmatter is the source of truth.
 */
export class TypeRegistry {
	private cache: TypeDefinition[] | null = null;

	constructor(
		private app: App,
		private registryPath: string,
	) {}

	setPath(path: string) {
		if (path === this.registryPath) return;
		this.registryPath = path;
		this.invalidate();
	}

	invalidate() {
		this.cache = null;
	}

	get file(): TFile | null {
		return this.app.vault.getFileByPath(this.registryPath);
	}

	/** True when the path this registry watches is the file that just changed. */
	isRegistryFile(file: TFile): boolean {
		return file.path === this.registryPath;
	}

	all(): TypeDefinition[] {
		if (this.cache) return this.cache;

		const file = this.file;
		const raw = file ? this.app.metadataCache.getFileCache(file)?.frontmatter?.registry : undefined;

		const parsed = Array.isArray(raw)
			? raw.map(parseType).filter((type): type is TypeDefinition => type !== null)
			: [];

		this.cache = parsed.length > 0 ? parsed : FALLBACK_TYPES;
		return this.cache;
	}

	/** Types offered when creating a note — the system type is not one of them. */
	creatable(): TypeDefinition[] {
		return this.all().filter((type) => type.id !== "system");
	}

	byId(id: string | undefined): TypeDefinition | undefined {
		if (!id) return undefined;
		return this.all().find((type) => type.id === id);
	}

	label(type: TypeDefinition, language: "tr" | "en"): string {
		return language === "tr" ? type.tr : type.en;
	}

	fieldLabel(field: FieldDefinition, language: "tr" | "en"): string {
		return language === "tr" ? field.tr : field.en;
	}
}
