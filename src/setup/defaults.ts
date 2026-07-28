import type { FieldDefinition, TypeDefinition } from "../types";
import type { I18n } from "../i18n";

type Lang = "tr" | "en";

/** Folder names a fresh vault gets, in the language the author picked. */
export const FOLDER_NAMES: Record<Lang, Record<string, string>> = {
	en: {
		laws: "Laws",
		timelines: "Timelines",
		stories: "Stories",
		characters: "Characters",
		species: "Species",
		places: "Places",
		factions: "Factions",
		objects: "Objects",
		events: "Events",
		drafts: "Drafts",
		versions: "Versions",
		templates: "Templates",
		system: "System",
		exports: "Exports",
	},
	tr: {
		laws: "Kurallar",
		timelines: "Zaman Çizgileri",
		stories: "Hikayeler",
		characters: "Karakterler",
		species: "Türler",
		places: "Mekânlar",
		factions: "Fraksiyonlar",
		objects: "Nesneler",
		events: "Olaylar",
		drafts: "Taslaklar",
		versions: "Sürümler",
		templates: "Şablonlar",
		system: "Sistem",
		exports: "Dışa Aktarım",
	},
};

export const TEMPLATE_NAMES: Record<Lang, Record<string, string>> = {
	en: {
		story: "Story",
		character: "Character",
		species: "Species",
		place: "Place",
		faction: "Faction",
		object: "Object",
		event: "Event",
		law: "Law",
		draft: "Draft",
		timeline: "Timeline",
	},
	tr: {
		story: "Hikaye",
		character: "Karakter",
		species: "Tür",
		place: "Mekân",
		faction: "Fraksiyon",
		object: "Nesne",
		event: "Olay",
		law: "Yasa",
		draft: "Taslak",
		timeline: "Zaman Çizgisi",
	},
};

interface TypeSeed extends Omit<TypeDefinition, "folder" | "template"> {
	folderKey: string;
}

const field = (
	name: string,
	tr: string,
	en: string,
	kind: FieldDefinition["kind"],
	options?: string[],
): FieldDefinition => ({ name, tr, en, kind, options });

/**
 * The type registry a new vault starts with. Written out as a note so it stays
 * the author's to edit; this is only the starting point.
 */
export const TYPE_SEEDS: TypeSeed[] = [
	{
		id: "story",
		tr: "Hikaye",
		en: "Story",
		icon: "📖",
		folderKey: "stories",
		timeline: true,
		fields: [],
	},
	{
		id: "character",
		tr: "Karakter",
		en: "Character",
		icon: "👤",
		folderKey: "characters",
		timeline: true,
		fields: [
			field("species", "Tür", "Species", "link"),
			field("faction", "Fraksiyon", "Faction", "link"),
			field("titles", "Unvanlar", "Titles", "list"),
			field("birth", "Doğum", "Birth", "time"),
			field("death", "Ölüm", "Death", "time"),
			field("alias-history", "Ad geçmişi", "Alias history", "aliases"),
		],
	},
	{
		id: "species",
		tr: "Tür / Yaşam Formu",
		en: "Species",
		icon: "🧬",
		folderKey: "species",
		timeline: false,
		fields: [
			field("homeworld", "Anayurt", "Homeworld", "link"),
			field("lifespan", "Ömür", "Lifespan", "text"),
			field("intelligence", "Zekâ", "Intelligence", "text"),
			field("traits", "Özellikler", "Traits", "list"),
		],
	},
	{
		id: "place",
		tr: "Mekân / Gezegen",
		en: "Place",
		icon: "🪐",
		folderKey: "places",
		timeline: false,
		fields: [
			field("place-kind", "Mekân tipi", "Place kind", "select", [
				"planet",
				"star system",
				"city",
				"station",
				"region",
				"dimension",
			]),
			field("parent-place", "Üst mekân", "Parent place", "link"),
			field("inhabitants", "Sakinleri", "Inhabitants", "links"),
			field("conditions", "Koşullar", "Conditions", "text"),
		],
	},
	{
		id: "faction",
		tr: "Fraksiyon",
		en: "Faction",
		icon: "⚔️",
		folderKey: "factions",
		timeline: false,
		fields: [
			field("founded", "Kuruluş", "Founded", "time"),
			field("dissolved", "Dağılış", "Dissolved", "time"),
			field("base", "Merkez", "Base", "link"),
			field("leaders", "Liderler", "Leaders", "links"),
			field("members", "Üyeler", "Members", "links"),
			field("allies", "Müttefikler", "Allies", "links"),
			field("enemies", "Düşmanlar", "Enemies", "links"),
		],
	},
	{
		id: "object",
		tr: "Nesne / Silah",
		en: "Object",
		icon: "🗡️",
		folderKey: "objects",
		timeline: false,
		fields: [
			field("object-kind", "Nesne tipi", "Object kind", "select", [
				"weapon",
				"artefact",
				"vehicle",
				"technology",
				"relic",
			]),
			field("owner", "Sahibi", "Owner", "link"),
			field("origin", "Kökeni", "Origin", "text"),
			field("abilities", "Yetenekler", "Abilities", "list"),
		],
	},
	{
		id: "event",
		tr: "Olay",
		en: "Event",
		icon: "⚡",
		folderKey: "events",
		timeline: true,
		fields: [
			field("participants", "Katılanlar", "Participants", "links"),
			field("location", "Yer", "Location", "link"),
			field("outcome", "Sonuç", "Outcome", "text"),
		],
	},
	{
		id: "law",
		tr: "Yasa / Kural",
		en: "Law",
		icon: "📜",
		folderKey: "laws",
		timeline: false,
		fields: [
			field("scope", "Kapsam", "Scope", "select", ["universe", "local"]),
			field("applies-to", "Geçerli olduğu", "Applies to", "links"),
			field("timeline-scope", "Geçerli çizgiler", "Timeline scope", "list"),
			field("exceptions", "İstisnalar", "Exceptions", "links"),
		],
	},
	{
		id: "draft",
		tr: "Taslak / Konsept",
		en: "Draft",
		icon: "💭",
		folderKey: "drafts",
		timeline: false,
		fields: [
			field("idea-for", "Şunun için fikir", "Idea for", "text"),
			field("promoted-to", "Terfi edildi", "Promoted to", "link"),
		],
	},
	{
		id: "timeline",
		tr: "Zaman Çizgisi",
		en: "Timeline",
		icon: "🕰️",
		folderKey: "timelines",
		timeline: false,
		fields: [
			field("timeline-kind", "Çizgi tipi", "Timeline kind", "select", ["primary", "parallel"]),
			field("timeline-id", "Çizgi kimliği", "Timeline id", "text"),
			field("diverges-from", "Ayrıldığı çizgi", "Diverges from", "link"),
			field("divergence-point", "Ayrılma noktası", "Divergence point", "link"),
			field("flows", "Akışlar", "Flows", "list"),
		],
	},
];

/** Turns a seed into the concrete definition for a vault's chosen names. */
export function resolveTypes(lang: Lang, prefixFolders: boolean): TypeDefinition[] {
	const folders = FOLDER_NAMES[lang];
	const templates = TEMPLATE_NAMES[lang];

	// Numeric prefixes fix the order in the file explorer, which otherwise sorts
	// alphabetically and scatters related folders.
	const order = [
		"laws",
		"timelines",
		"stories",
		"characters",
		"species",
		"places",
		"factions",
		"objects",
		"events",
		"drafts",
	];

	return TYPE_SEEDS.map((seed) => {
		const index = order.indexOf(seed.folderKey);
		const prefix = prefixFolders && index >= 0 ? `${String(index).padStart(2, "0")} — ` : "";

		return {
			id: seed.id,
			tr: seed.tr,
			en: seed.en,
			icon: seed.icon,
			folder: `${prefix}${folders[seed.folderKey]}`,
			template: templates[seed.id] ?? "",
			timeline: seed.timeline,
			fields: seed.fields,
		};
	});
}

function yamlValue(value: string): string {
	return /[:#{}[\],&*?|<>=!%@`"']/.test(value) ? JSON.stringify(value) : value;
}

/** Serialises the registry into the frontmatter the plugin reads back. */
export function buildRegistryNote(types: TypeDefinition[], i18n: I18n): string {
	const lines: string[] = ["---", "type: system", 'icon: "🏷️"', "registry:"];

	for (const type of types) {
		lines.push(`  - id: ${type.id}`);
		lines.push(`    tr: ${yamlValue(type.tr)}`);
		lines.push(`    en: ${yamlValue(type.en)}`);
		lines.push(`    icon: "${type.icon}"`);
		lines.push(`    folder: ${yamlValue(type.folder)}`);
		lines.push(`    template: ${yamlValue(type.template)}`);
		lines.push(`    timeline: ${type.timeline}`);

		if (type.fields.length === 0) {
			lines.push("    fields: []");
			continue;
		}

		lines.push("    fields:");
		for (const f of type.fields) {
			const parts = [
				`name: ${f.name}`,
				`tr: ${yamlValue(f.tr)}`,
				`en: ${yamlValue(f.en)}`,
				`kind: ${f.kind}`,
			];
			if (f.options?.length) parts.push(`options: [${f.options.map(yamlValue).join(", ")}]`);
			lines.push(`      - { ${parts.join(", ")} }`);
		}
	}

	lines.push("---", "", `# ${i18n.t("setup.registry.heading")}`, "", i18n.t("setup.registry.body"), "");
	return lines.join("\n");
}

/**
 * Templates are derived from the type definition rather than hand-maintained,
 * so a type and its template cannot describe different fields.
 */
export function buildTemplate(type: TypeDefinition, lang: Lang): string {
	const lines: string[] = [
		"---",
		`type: ${type.id}`,
		`icon: "${type.icon}"`,
		"icon-type: emoji",
		"status: draft",
	];

	if (type.id === "character") lines.push("aliases: []");

	for (const f of type.fields) {
		const empty = f.kind === "links" || f.kind === "list" || f.kind === "aliases" ? "[]" : "";
		lines.push(`${f.name}:${empty ? ` ${empty}` : ""}`);
	}

	if (type.timeline) {
		lines.push(
			"version: v1",
			"timeline:",
			"flow:",
			"time:",
			"time-precision: year",
			"time-label:",
			"time-end:",
			"time-uncertain: false",
			"earth-time:",
			"prev: []",
			"next: []",
		);
	}

	if (type.id !== "law" && type.id !== "timeline") lines.push("related: []");
	if (["species", "place", "object", "character"].includes(type.id)) {
		lines.push("laws: []", "breaks-law: []");
	}

	lines.push("---", "", `# ${lang === "tr" ? "Başlık" : "Title"}`, "");
	return lines.join("\n");
}

export function buildUniverseNote(name: string, i18n: I18n): string {
	return [
		"---",
		"type: system",
		'icon: "🌌"',
		`universe-name: ${yamlValue(name)}`,
		'calendar-name: ""',
		'calendar-unit: ""',
		"calendar-epoch: 0",
		"calendar-days: 365",
		"earth-epoch:",
		"earth-ratio: 1",
		"---",
		"",
		`# ${name}`,
		"",
		i18n.t("setup.universe.body"),
		"",
		`## ${i18n.t("setup.universe.calendar")}`,
		"",
		i18n.t("setup.universe.calendarBody"),
		"",
	].join("\n");
}
