import { describe, expect, it } from "vitest";
import {
	BookEntry,
	escapeHtml,
	groupEntries,
	htmlBook,
	htmlWikiIndex,
	htmlWikiPage,
	markdownBook,
	uniqueSlugs,
} from "../src/export/book";

const entry = (over: Partial<BookEntry>): BookEntry => ({
	path: "x.md",
	title: "X",
	icon: "",
	type: "event",
	typeLabel: "Event",
	timeline: "",
	time: null,
	when: "",
	body: "",
	...over,
});

const ENTRIES = [
	entry({ path: "Storm.md", title: "The storm", type: "event", typeLabel: "Event", timeline: "main", time: 1, when: "Year 1", body: "Clouds." }),
	entry({ path: "Mira.md", title: "Mira", icon: "🧭", type: "character", typeLabel: "Character", timeline: "main", body: "Keeper." }),
	entry({ path: "Climb.md", title: "The climb", type: "event", typeLabel: "Event", timeline: "main", time: 2, when: "Year 2" }),
	entry({ path: "Harbour.md", title: "Harbour", type: "place", typeLabel: "Place", body: "Boats." }),
	entry({ path: "Alt.md", title: "Another way", type: "event", typeLabel: "Event", timeline: "alt", time: 1.5 }),
];

describe("groupEntries", () => {
	it("by type: types in id order, timed notes first in story order, then by name", () => {
		const sections = groupEntries(ENTRIES, "type", [], "Outside any timeline");
		expect(sections.map((section) => [section.label, section.entries.map((e) => e.title)])).toEqual([
			["Character", ["Mira"]],
			["Event", ["The storm", "Another way", "The climb"]],
			["Place", ["Harbour"]],
		]);
	});

	it("by timeline: timelines in their own order, notes outside any timeline last", () => {
		const sections = groupEntries(
			ENTRIES,
			"timeline",
			[
				{ id: "main", name: "The Lantern Keepers" },
				{ id: "alt", name: "What if" },
			],
			"Outside any timeline",
		);
		expect(sections.map((section) => [section.label, section.entries.map((e) => e.title)])).toEqual([
			["The Lantern Keepers", ["The storm", "The climb", "Mira"]],
			["What if", ["Another way"]],
			["Outside any timeline", ["Harbour"]],
		]);
	});
});

describe("markdownBook", () => {
	it("keeps the Markdown export exactly as before", () => {
		const sections = groupEntries(ENTRIES.slice(0, 2), "type", [], "");
		expect(markdownBook({ title: "Isles", summary: "2 notes", contentsTitle: "Contents", sections })).toBe(
			[
				"# Isles",
				"",
				"*2 notes*",
				"",
				"## Contents",
				"",
				"- Character (1)",
				"- Event (1)",
				"",
				"## Character",
				"",
				"### 🧭 Mira",
				"",
				"Keeper.",
				"",
				"## Event",
				"",
				"### The storm",
				"",
				"*Year 1*",
				"",
				"Clouds.",
				"",
			].join("\n"),
		);
	});
});

describe("uniqueSlugs", () => {
	it("makes safe, distinct names, Turkish letters spelled out", () => {
		const slugs = uniqueSlugs(["A/Işık.md", "B/Işık.md", "Çağ ödülü!.md", "index.md"]);
		expect([...slugs.values()]).toEqual(["isik", "isik-2", "cag-odulu", "index-2"]);
	});
});

describe("HTML pages", () => {
	const sections = groupEntries(ENTRIES.slice(0, 2), "type", [], "");
	const bodies = new Map([
		["Storm.md", "<p>Clouds.</p>"],
		["Mira.md", "<p>Keeper.</p>"],
	]);

	it("escapes text it places in the page", () => {
		expect(escapeHtml(`<b>"Tom" & 'Jo'</b>`)).toBe("&lt;b&gt;&quot;Tom&quot; &amp; &#39;Jo&#39;&lt;/b&gt;");
	});

	it("builds one book with contents linking to each note", () => {
		const anchors = uniqueSlugs(["Storm.md", "Mira.md"]);
		const html = htmlBook({ title: "Isles <1>", summary: "2 notes", contentsTitle: "Contents", lang: "en", sections, bodies, anchors });
		expect(html.startsWith("<!doctype html>")).toBe(true);
		expect(html).toContain('<html lang="en">');
		expect(html).toContain("<title>Isles &lt;1&gt;</title>");
		expect(html).toContain('<a href="#mira">🧭 Mira</a>');
		expect(html).toContain('<article id="storm">');
		expect(html).toContain("<p>Clouds.</p>");
		expect(html).toContain("@media print");
	});

	it("builds a wiki index and pages that link back and list who links to them", () => {
		const pages = uniqueSlugs(["Storm.md", "Mira.md"]);
		const index = htmlWikiIndex({ title: "Isles", summary: "2 notes", contentsTitle: "Contents", lang: "tr", sections, pages });
		expect(index).toContain('<html lang="tr">');
		expect(index).toContain('<a href="storm.html">The storm</a>');

		const page = htmlWikiPage({
			bookTitle: "Isles",
			lang: "en",
			entry: sections[1].entries[0],
			body: "<p>Clouds.</p>",
			backlinks: [{ title: "Mira", href: "mira.html" }],
			labels: { back: "Contents", linkedFrom: "Linked from" },
		});
		expect(page).toContain('<a href="index.html">Contents</a>');
		expect(page).toContain("<h1>The storm</h1>");
		expect(page).toContain("Event · Year 1");
		expect(page).toContain('<a href="mira.html">Mira</a>');
	});
});

describe("export (review)", () => {
	it("keeps notes with the same time in the order they came, like the previous export", () => {
		const same = [
			entry({ path: "B.md", title: "B", time: 3 }),
			entry({ path: "A.md", title: "A", time: 3 }),
			entry({ path: "C.md", title: "C" }),
		];
		expect(groupEntries(same, "type", [], "")[0].entries.map((e) => e.title)).toEqual(["B", "A", "C"]);
	});

	it("never names a page after a Windows device", () => {
		expect([...uniqueSlugs(["Con.md", "nul!.md", "COM1.md", "Aux file.md"]).values()]).toEqual([
			"con-2",
			"nul-2",
			"com1-2",
			"aux-file",
		]);
	});

	it("keeps letters of other alphabets readable in page names", () => {
		expect([...uniqueSlugs(["Мира.md", "火山.md"]).values()]).toEqual(["мира", "火山"]);
	});

	it("blocks scripts in the shared file and keeps note headings out of the book's own heading styles", () => {
		const html = htmlBook({
			title: "T",
			summary: "",
			contentsTitle: "C",
			lang: "en",
			sections: groupEntries([entry({ path: "A.md", title: "A" })], "type", [], ""),
			bodies: new Map([["A.md", "<h2>Inside</h2>"]]),
			anchors: new Map([["A.md", "a"]]),
		});
		expect(html).toContain(`http-equiv="Content-Security-Policy"`);
		expect(html).toContain('<div class="note-body"><h2>Inside</h2></div>');
		expect(html).not.toMatch(/\nh2 \{/);
	});

	it("shows emoji icons in HTML but not icon names", () => {
		const html = htmlBook({
			title: "T",
			summary: "",
			contentsTitle: "C",
			lang: "en",
			sections: groupEntries([entry({ path: "A.md", title: "A", icon: "sword" }), entry({ path: "B.md", title: "B", icon: "🗡️" })], "type", [], ""),
			bodies: new Map(),
			anchors: new Map([
				["A.md", "a"],
				["B.md", "b"],
			]),
		});
		expect(html).toContain('<a href="#a">A</a>');
		expect(html).toContain('<a href="#b">🗡️ B</a>');
	});
});
