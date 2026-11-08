/**
 * "The Lantern Keepers": a tiny story that exercises every view, generated as
 * plain text so it can be checked without Obsidian. Every note carries
 * `EXAMPLE_MARKER: true`, which is how removal finds them even after the
 * author moves one.
 */

export type ExampleLang = "en" | "tr";

export const EXAMPLE_MARKER = "lore-example";
export const EXAMPLE_TIMELINE_ID = "example";
export const EXAMPLE_TYPES = ["timeline", "character", "place", "law", "event", "draft"];

export interface ExampleNote {
	path: string;
	content: string;
}

export function exampleFolder(lang: ExampleLang): string {
	return lang === "tr" ? "Lore Creator Örnek" : "Lore Creator Example";
}

const NAMES = {
	en: {
		timeline: "The Lantern Keepers",
		mira: "Mira",
		tobin: "Tobin",
		vessa: "Old Vessa",
		lighthouse: "The Lighthouse",
		law: "The lantern never goes out",
		storm: "The storm arrives",
		climb: "Mira climbs the tower",
		steal: "Tobin steals the oil",
		dark: "The lantern goes dark",
		relight: "Mira lights it again",
		idea: "What if the lantern could talk",
		versions: "Versions",
		village: "Village",
		firstTry: "First try",
	},
	tr: {
		timeline: "Fener Bekçileri",
		mira: "Mira",
		tobin: "Tobin",
		vessa: "Yaşlı Vessa",
		lighthouse: "Deniz Feneri",
		law: "Fener asla sönmez",
		storm: "Fırtına geliyor",
		climb: "Mira kuleye tırmanıyor",
		steal: "Tobin yağı çalıyor",
		dark: "Fener sönüyor",
		relight: "Mira feneri yeniden yakıyor",
		idea: "Ya fener konuşabilseydi",
		versions: "Sürümler",
		village: "Köy",
		firstTry: "İlk deneme",
	},
};

const BODIES = {
	en: {
		timeline: "The whole story of the lighthouse, from the storm to the new light. Two roads: Mira's, and the village's.",
		mira: "The young lantern keeper. Brave, a little stubborn, never lets the light die.",
		tobin: "A fisher who needs oil for his family. He takes it from the lighthouse.",
		vessa: "The old keeper before Mira. She knows a secret about the lantern. (Not written yet.)",
		lighthouse: "A tall white tower on the rocks. Its lantern guides every boat home.",
		law: "As long as the lantern burns, no ship is lost. Anyone who lets it go out breaks the oldest rule of the isles.",
		storm: "Black clouds roll in from the sea. Mira runs to the lighthouse.",
		climb: "Mira climbs the 300 steps while the wind howls.",
		steal: "In the village, Tobin fills his jars with the lighthouse oil.",
		dark: "Without oil, the lantern flickers and goes dark.",
		relight: "Mira lights the lantern with the last spark she has. (Second try: she remembers Vessa's secret.)",
		relightOld: "Mira lights the lantern with a match. (First try: simpler, maybe too easy.)",
		idea: "Maybe the lantern has a voice, and only keepers can hear it?",
	},
	tr: {
		timeline: "Fırtınadan yeni ışığa, deniz fenerinin bütün hikâyesi. İki yol var: Mira'nınki ve köyünki.",
		mira: "Genç fener bekçisi. Cesur, biraz inatçı, ışığın sönmesine asla izin vermez.",
		tobin: "Ailesi için yağa ihtiyacı olan bir balıkçı. Yağı fenerden alır.",
		vessa: "Mira'dan önceki yaşlı bekçi. Fenerle ilgili bir sır biliyor. (Henüz yazılmadı.)",
		lighthouse: "Kayaların üstünde uzun, beyaz bir kule. Feneri her tekneyi eve götürür.",
		law: "Fener yandıkça hiçbir gemi kaybolmaz. Onu söndüren, adaların en eski kuralını çiğner.",
		storm: "Denizden kara bulutlar geliyor. Mira fenere koşuyor.",
		climb: "Rüzgâr uğuldarken Mira 300 basamağı tırmanıyor.",
		steal: "Köyde Tobin kavanozlarını fenerin yağıyla dolduruyor.",
		dark: "Yağ bitince fener titriyor ve sönüyor.",
		relight: "Mira feneri elindeki son kıvılcımla yakıyor. (İkinci deneme: Vessa'nın sırrını hatırlıyor.)",
		relightOld: "Mira feneri bir kibritle yakıyor. (İlk deneme: daha basit, belki fazla kolay.)",
		idea: "Belki fenerin bir sesi vardır ve onu yalnız bekçiler duyabilir?",
	},
};

/** A YAML string that is always safe, whatever the language. */
function q(value: string): string {
	return JSON.stringify(value);
}

function linkList(key: string, targets: string[]): string[] {
	if (targets.length === 0) return [`${key}: []`];
	return [`${key}:`, ...targets.map((target) => `  - ${q(`[[${target}]]`)}`)];
}

/** Fields the plugin reads as one link (`version-of`, `idea-for`) must not be lists. */
function linkOne(key: string, target: string): string {
	return `${key}: ${q(`[[${target}]]`)}`;
}

function note(path: string, fields: string[], body: string): ExampleNote {
	return {
		path,
		content: ["---", ...fields, `${EXAMPLE_MARKER}: true`, "---", "", body, ""].join("\n"),
	};
}

export function buildExampleNotes(lang: ExampleLang): ExampleNote[] {
	const n = NAMES[lang];
	const b = BODIES[lang];
	const dir = exampleFolder(lang);
	const at = (name: string) => `${dir}/${name}.md`;

	const event = (
		name: string,
		year: number,
		flow: string,
		status: string,
		prev: string[],
		next: string[],
		body: string,
		extra: string[] = [],
	) =>
		note(
			at(name),
			[
				"type: event",
				'icon: "⚡"',
				`status: ${status}`,
				`timeline: ${EXAMPLE_TIMELINE_ID}`,
				`flow: ${flow}`,
				`time: ${year}`,
				"time-precision: year",
				...linkList("prev", prev),
				...linkList("next", next),
				...extra,
			],
			body,
		);

	return [
		note(
			at(n.timeline),
			[
				"type: timeline",
				'icon: "🕯️"',
				"status: done",
				`timeline-id: ${EXAMPLE_TIMELINE_ID}`,
				"flows:",
				`  - ${q(`keeper: ${n.mira}`)}`,
				`  - ${q(`village: ${n.village}`)}`,
			],
			b.timeline,
		),
		note(at(n.mira), ["type: character", 'icon: "🧭"', "status: done"], b.mira),
		note(at(n.tobin), ["type: character", 'icon: "🎣"', "status: partial", ...linkList("breaks-law", [n.law])], b.tobin),
		note(at(n.vessa), ["type: character", 'icon: "🧓"', "status: draft"], b.vessa),
		note(at(n.lighthouse), ["type: place", 'icon: "🗼"', "status: done"], b.lighthouse),
		note(at(n.law), ["type: law", 'icon: "📜"', "status: done", "scope: universe"], b.law),
		event(n.storm, 1, "keeper", "done", [], [n.climb, n.steal], b.storm),
		event(n.climb, 2, "keeper", "done", [n.storm], [n.dark], b.climb),
		event(n.steal, 2, "village", "partial", [n.storm], [n.dark], b.steal, linkList("breaks-law", [n.law])),
		event(n.dark, 3, "village", "partial", [n.climb, n.steal], [n.relight], b.dark),
		event(n.relight, 4, "keeper", "draft", [n.dark], [], b.relight, ["version: v2"]),
		note(
			`${dir}/${n.versions}/${n.relight} — v1.md`,
			[
				"type: event",
				'icon: "⚡"',
				"status: draft",
				`timeline: ${EXAMPLE_TIMELINE_ID}`,
				"flow: keeper",
				"time: 4",
				"time-precision: year",
				linkOne("version-of", n.relight),
				"version: v1",
				`version-name: ${q(n.firstTry)}`,
			],
			b.relightOld,
		),
		note(at(n.idea), ["type: draft", 'icon: "💭"', "status: draft", linkOne("idea-for", n.relight)], b.idea),
	];
}

/**
 * Folders worth tidying after a removal: those that held a page just removed
 * and sit inside an example folder, deepest first so a sub-folder goes before
 * its parent. A folder of the same name that held nothing removed is the
 * author's and is never listed.
 */
export function foldersToTidy(removedPaths: string[], roots: string[]): string[] {
	const folders = new Set<string>();
	for (const path of removedPaths) {
		const parts = path.split("/").slice(0, -1);
		for (let depth = parts.length; depth > 0; depth--) {
			const folder = parts.slice(0, depth).join("/");
			if (roots.some((root) => folder === root || folder.startsWith(`${root}/`))) folders.add(folder);
		}
	}
	return [...folders].sort((a, b) => b.split("/").length - a.split("/").length || a.localeCompare(b));
}

/** Every basename the example writes, in both languages. */
const EXAMPLE_BASENAMES = new Set(
	(["en", "tr"] as ExampleLang[]).flatMap((lang) =>
		buildExampleNotes(lang).map((entry) => entry.path.split("/").pop()!.replace(/\.md$/, "")),
	),
);

/**
 * True only for names the example itself wrote. A copy the author made from
 * an example note keeps the marker but gets a new name, and stays theirs.
 */
export function isExampleBasename(basename: string): boolean {
	return EXAMPLE_BASENAMES.has(basename);
}
