/**
 * The guide's structure as data. All wording lives in the guide string
 * tables (`strings.en.ts`, `strings.tr.ts`); this file only says what goes
 * where, so both languages always share one layout.
 */

export type ChapterId =
	| "intro"
	| "setup"
	| "time"
	| "firstNote"
	| "timeline"
	| "flows"
	| "links"
	| "dashboard"
	| "versions"
	| "lawsDrafts"
	| "faq";

export type ChapterGroup = "start" | "writing" | "tracking" | "help";

export type GuideAction =
	| "setup"
	| "timeSystem"
	| "newNote"
	| "openTimeline"
	| "openDashboard"
	| "createExample"
	| "removeExample";

export type GuideDiagram = "universeTree" | "timelineLanes" | "nextPrev" | "versionDrawer";

export type GuideCondition = "universeExists" | "exampleExists";

export type GuideBlock =
	| { kind: "text"; key: string }
	| { kind: "tip"; key: string }
	| { kind: "diagram"; diagram: GuideDiagram }
	| { kind: "action"; action: GuideAction; key: string }
	/** A green box, shown only while its condition holds. */
	| { kind: "state"; when: GuideCondition; key: string }
	/** Collapsed "For the curious": the only place field names may appear. */
	| { kind: "curious"; key: string };

export interface Chapter {
	id: ChapterId;
	group: ChapterGroup;
	minutes: number;
	blocks: GuideBlock[];
}

export const GROUPS: ChapterGroup[] = ["start", "writing", "tracking", "help"];

const text = (key: string): GuideBlock => ({ kind: "text", key });
const tip = (key: string): GuideBlock => ({ kind: "tip", key });
const curious = (key: string): GuideBlock => ({ kind: "curious", key });

export const CHAPTERS: Chapter[] = [
	{
		id: "intro",
		group: "start",
		minutes: 1,
		blocks: [
			text("guide.intro.1"),
			text("guide.intro.2"),
			text("guide.intro.3"),
			tip("guide.intro.tip"),
			text("guide.intro.example"),
			{ kind: "state", when: "exampleExists", key: "guide.intro.exampleThere" },
			{ kind: "action", action: "createExample", key: "guide.action.createExample" },
			{ kind: "action", action: "removeExample", key: "guide.action.removeExample" },
		],
	},
	{
		id: "setup",
		group: "start",
		minutes: 1,
		blocks: [
			text("guide.setup.1"),
			{ kind: "diagram", diagram: "universeTree" },
			text("guide.setup.2"),
			{ kind: "state", when: "universeExists", key: "guide.setup.done" },
			{ kind: "action", action: "setup", key: "guide.action.setup" },
			tip("guide.setup.tip"),
		],
	},
	{
		id: "time",
		group: "start",
		minutes: 2,
		blocks: [
			text("guide.time.1"),
			text("guide.time.2"),
			text("guide.time.3"),
			{ kind: "action", action: "timeSystem", key: "guide.action.timeSystem" },
			tip("guide.time.tip"),
			curious("guide.time.curious"),
		],
	},
	{
		id: "firstNote",
		group: "writing",
		minutes: 1,
		blocks: [
			text("guide.firstNote.1"),
			text("guide.firstNote.2"),
			{ kind: "action", action: "newNote", key: "guide.action.newNote" },
			text("guide.firstNote.3"),
			tip("guide.firstNote.tip"),
			curious("guide.firstNote.curious"),
		],
	},
	{
		id: "timeline",
		group: "writing",
		minutes: 2,
		blocks: [
			text("guide.timeline.1"),
			{ kind: "diagram", diagram: "timelineLanes" },
			text("guide.timeline.2"),
			text("guide.timeline.3"),
			{ kind: "action", action: "openTimeline", key: "guide.action.openTimeline" },
			tip("guide.timeline.tip"),
			curious("guide.timeline.curious"),
		],
	},
	{
		id: "flows",
		group: "writing",
		minutes: 1,
		blocks: [
			text("guide.flows.1"),
			text("guide.flows.2"),
			text("guide.flows.3"),
			tip("guide.flows.tip"),
			curious("guide.flows.curious"),
		],
	},
	{
		id: "links",
		group: "writing",
		minutes: 1,
		blocks: [
			text("guide.links.1"),
			{ kind: "diagram", diagram: "nextPrev" },
			text("guide.links.2"),
			text("guide.links.3"),
			tip("guide.links.tip"),
			curious("guide.links.curious"),
		],
	},
	{
		id: "dashboard",
		group: "tracking",
		minutes: 1,
		blocks: [
			text("guide.dashboard.1"),
			text("guide.dashboard.2"),
			text("guide.dashboard.3"),
			{ kind: "action", action: "openDashboard", key: "guide.action.openDashboard" },
			tip("guide.dashboard.tip"),
		],
	},
	{
		id: "versions",
		group: "tracking",
		minutes: 2,
		blocks: [
			text("guide.versions.1"),
			{ kind: "diagram", diagram: "versionDrawer" },
			text("guide.versions.2"),
			text("guide.versions.3"),
			tip("guide.versions.tip"),
		],
	},
	{
		id: "lawsDrafts",
		group: "tracking",
		minutes: 1,
		blocks: [
			text("guide.lawsDrafts.1"),
			text("guide.lawsDrafts.2"),
			text("guide.lawsDrafts.3"),
			tip("guide.lawsDrafts.tip"),
			curious("guide.lawsDrafts.curious"),
		],
	},
	{
		id: "faq",
		group: "help",
		minutes: 1,
		blocks: [],
	},
];

export interface FaqEntry {
	q: string;
	a: string;
}

/** Questions are i18n keys; `guide.faq.<n>.q` / `.a`. */
export const FAQ: FaqEntry[] = Array.from({ length: 14 }, (_, i) => ({
	q: `guide.faq.${i + 1}.q`,
	a: `guide.faq.${i + 1}.a`,
}));

/** Keys the view itself uses, outside any chapter. */
export const UI_KEYS = [
	"guide.back",
	"guide.next",
	"guide.progress",
	"guide.curious",
	"guide.faq.search",
	"guide.faq.empty",
	"guide.badge.example",
	"guide.group.start",
	"guide.group.writing",
	"guide.group.tracking",
	"guide.group.help",
	...CHAPTERS.map((chapter) => `guide.${chapter.id}.title`),
];
