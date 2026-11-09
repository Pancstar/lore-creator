/**
 * The universe as a book, without Obsidian: grouping notes into sections and
 * writing them out as Markdown, one HTML page, or an HTML wiki. Everything
 * here is plain data in, text out, so it can be tested on its own.
 */

/** One note as it goes into the book. */
export interface BookEntry {
	path: string;
	title: string;
	icon: string;
	type: string;
	typeLabel: string;
	/** Timeline id, empty for a note outside any timeline. */
	timeline: string;
	time: number | null;
	/** The note's time in words, empty when it has none. */
	when: string;
	/** The note's text, without its frontmatter. */
	body: string;
}

export interface BookSection {
	key: string;
	label: string;
	entries: BookEntry[];
}

export type SectionMode = "type" | "timeline";

/**
 * Timed notes first in story order, the rest by name. Notes at the same time
 * keep the order they came in, as the Markdown export always did.
 */
function storyOrder(a: BookEntry, b: BookEntry): number {
	if (a.time !== null && b.time !== null) return a.time - b.time;
	if (a.time !== null) return -1;
	if (b.time !== null) return 1;
	return a.title.localeCompare(b.title);
}

/**
 * Splits the notes into the book's sections: one per type (in type id order),
 * or one per timeline (in the timelines' own order, notes outside any
 * timeline last).
 */
export function groupEntries(
	entries: BookEntry[],
	mode: SectionMode,
	timelines: { id: string; name: string }[],
	noTimelineLabel: string,
): BookSection[] {
	const sections = new Map<string, BookSection>();
	for (const entry of entries) {
		const key = mode === "type" ? entry.type : entry.timeline;
		let section = sections.get(key);
		if (!section) {
			const label =
				mode === "type"
					? entry.typeLabel
					: key
						? (timelines.find((timeline) => timeline.id === key)?.name ?? key)
						: noTimelineLabel;
			section = { key, label, entries: [] };
			sections.set(key, section);
		}
		section.entries.push(entry);
	}

	const order = (section: BookSection) => {
		if (mode === "type") return 0;
		if (!section.key) return Number.MAX_SAFE_INTEGER;
		const index = timelines.findIndex((timeline) => timeline.id === section.key);
		return index === -1 ? timelines.length : index;
	};
	const list = [...sections.values()].sort((a, b) => order(a) - order(b) || a.key.localeCompare(b.key));
	for (const section of list) section.entries.sort(storyOrder);
	return list;
}

export interface BookText {
	title: string;
	summary: string;
	contentsTitle: string;
	sections: BookSection[];
}

const heading = (entry: BookEntry) => (entry.icon ? `${entry.icon} ${entry.title}` : entry.title);

/** HTML shows emoji icons only; an icon name (`sword`) would read as a stray word. */
const htmlHeading = (entry: BookEntry) =>
	entry.icon && !/^[a-z0-9-]+$/i.test(entry.icon) ? `${entry.icon} ${entry.title}` : entry.title;

/** The Markdown export: one document with contents, a section per group and a heading per note. */
export function markdownBook(book: BookText): string {
	const lines: string[] = [`# ${book.title}`, "", `*${book.summary}*`, "", `## ${book.contentsTitle}`, ""];
	for (const section of book.sections) lines.push(`- ${section.label} (${section.entries.length})`);
	lines.push("");
	for (const section of book.sections) {
		lines.push(`## ${section.label}`, "");
		for (const entry of section.entries) {
			lines.push(`### ${heading(entry)}`, "");
			if (entry.when) lines.push(`*${entry.when}*`, "");
			const body = entry.body.trim();
			if (body) lines.push(body, "");
		}
	}
	return lines.join("\n");
}

const TURKISH: Record<string, string> = { ı: "i", ş: "s", ğ: "g", ü: "u", ö: "o", ç: "c" };

/** Names Windows will not give a file, whatever its extension. */
const RESERVED = ["con", "prn", "aux", "nul", ...[1, 2, 3, 4, 5, 6, 7, 8, 9].flatMap((n) => [`com${n}`, `lpt${n}`])];

/**
 * A safe, distinct name for every note, used as an anchor in the book and as
 * a page name in the wiki. Letters of any alphabet stay readable; `index` is
 * kept free for the wiki's front page, and Windows device names are avoided.
 */
export function uniqueSlugs(paths: string[]): Map<string, string> {
	const slugs = new Map<string, string>();
	const taken = new Set(["index", ...RESERVED]);
	for (const path of paths) {
		const name = (path.split("/").pop() ?? path).replace(/\.md$/i, "");
		const base =
			name
				.toLocaleLowerCase("tr")
				.replace(/[ışğüöç]/g, (letter) => TURKISH[letter] ?? letter)
				.normalize("NFD")
				.replace(/\p{M}/gu, "")
				.replace(/[^\p{L}\p{N}]+/gu, "-")
				.replace(/^-+|-+$/g, "") || "note";
		let slug = base;
		for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
		taken.add(slug);
		slugs.set(path, slug);
	}
	return slugs;
}

export function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

/** Readable in light and dark, and printable: page breaks between notes, no navigation. */
export const BOOK_CSS = `
:root { color-scheme: light dark; --text: #1f2328; --muted: #5f6368; --bg: #ffffff; --line: #d0d7de; --accent: #7c3aed; }
@media (prefers-color-scheme: dark) { :root { --text: #e6e6e6; --muted: #a0a0a0; --bg: #1e1e1e; --line: #3a3a3a; --accent: #a78bfa; } }
* { box-sizing: border-box; }
body { margin: 0 auto; max-width: 46rem; padding: 2rem 1.25rem 4rem; background: var(--bg); color: var(--text); font: 17px/1.6 Georgia, "Times New Roman", serif; }
h1, h2, h3, nav, .meta, .back { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
h1 { font-size: 2rem; margin: 0 0 0.25rem; }
section > h2 { margin-top: 3rem; padding-bottom: 0.25rem; border-bottom: 1px solid var(--line); }
article > h3 { margin: 2rem 0 0.25rem; }
a { color: var(--accent); }
.summary, .meta { color: var(--muted); font-style: italic; }
.meta { margin: 0 0 1rem; font-size: 0.9rem; }
nav ol, nav ul { padding-left: 1.25rem; }
nav li { margin: 0.15rem 0; }
article { margin-bottom: 2rem; }
img { max-width: 100%; height: auto; }
blockquote { margin: 1rem 0; padding: 0.25rem 1rem; border-left: 3px solid var(--line); color: var(--muted); }
pre, code { font-size: 0.9em; }
.linked-from { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid var(--line); font-size: 0.95rem; }
@media print {
	body { max-width: none; padding: 0; font-size: 12pt; background: #fff; color: #000; }
	nav.contents { page-break-after: always; }
	article { page-break-inside: avoid; }
	section > h2 { page-break-before: always; }
	a { color: inherit; text-decoration: none; }
	.back { display: none; }
}
`;

function page(lang: string, title: string, body: string): string {
	return [
		"<!doctype html>",
		`<html lang="${escapeHtml(lang)}">`,
		"<head>",
		'<meta charset="utf-8">',
		'<meta name="viewport" content="width=device-width, initial-scale=1">',
		// A file meant to be shared runs no scripts, whatever a note contained.
		`<meta http-equiv="Content-Security-Policy" content="script-src 'none'; object-src 'none'">`,
		`<title>${escapeHtml(title)}</title>`,
		`<style>${BOOK_CSS}</style>`,
		"</head>",
		"<body>",
		body,
		"</body>",
		"</html>",
		"",
	].join("\n");
}

const meta = (entry: BookEntry) => [entry.typeLabel, entry.when].filter(Boolean).map(escapeHtml).join(" · ");

export interface HtmlBookText extends BookText {
	lang: string;
	/** Each note's text already turned into HTML, by path. */
	bodies: Map<string, string>;
	/** Each note's anchor, by path. */
	anchors: Map<string, string>;
}

/** The whole universe as one page: contents up front, every note an anchored article. */
export function htmlBook(book: HtmlBookText): string {
	const parts: string[] = [
		`<h1>${escapeHtml(book.title)}</h1>`,
		`<p class="summary">${escapeHtml(book.summary)}</p>`,
		`<nav class="contents"><h2>${escapeHtml(book.contentsTitle)}</h2><ol>`,
	];
	for (const section of book.sections) {
		parts.push(`<li>${escapeHtml(section.label)}<ul>`);
		for (const entry of section.entries) {
			parts.push(`<li><a href="#${book.anchors.get(entry.path) ?? ""}">${escapeHtml(htmlHeading(entry))}</a></li>`);
		}
		parts.push("</ul></li>");
	}
	parts.push("</ol></nav>");

	for (const section of book.sections) {
		parts.push(`<section><h2>${escapeHtml(section.label)}</h2>`);
		for (const entry of section.entries) {
			parts.push(`<article id="${book.anchors.get(entry.path) ?? ""}">`);
			parts.push(`<h3>${escapeHtml(htmlHeading(entry))}</h3>`);
			const line = meta(entry);
			if (line) parts.push(`<p class="meta">${line}</p>`);
			parts.push(`<div class="note-body">${book.bodies.get(entry.path) ?? ""}</div>`, "</article>");
		}
		parts.push("</section>");
	}
	return page(book.lang, book.title, parts.join("\n"));
}

export interface WikiIndexText extends BookText {
	lang: string;
	/** Each note's page name (without `.html`), by path. */
	pages: Map<string, string>;
}

/** The wiki's front page: what the universe holds, section by section. */
export function htmlWikiIndex(book: WikiIndexText): string {
	const parts: string[] = [
		`<h1>${escapeHtml(book.title)}</h1>`,
		`<p class="summary">${escapeHtml(book.summary)}</p>`,
		`<nav class="contents"><h2>${escapeHtml(book.contentsTitle)}</h2>`,
	];
	for (const section of book.sections) {
		parts.push(`<h3>${escapeHtml(section.label)}</h3><ul>`);
		for (const entry of section.entries) {
			const icon = entry.icon && !/^[a-z0-9-]+$/i.test(entry.icon) ? `${escapeHtml(entry.icon)} ` : "";
			parts.push(`<li>${icon}<a href="${book.pages.get(entry.path) ?? ""}.html">${escapeHtml(entry.title)}</a></li>`);
		}
		parts.push("</ul>");
	}
	parts.push("</nav>");
	return page(book.lang, book.title, parts.join("\n"));
}

export interface WikiPageText {
	bookTitle: string;
	lang: string;
	entry: BookEntry;
	/** The note's text as HTML, links already pointing at other pages. */
	body: string;
	/** Notes in the wiki that link here. */
	backlinks: { title: string; href: string }[];
	labels: { back: string; linkedFrom: string };
}

/** One note's page: a way back to the contents, the note, and who links to it. */
export function htmlWikiPage(text: WikiPageText): string {
	const { entry } = text;
	const parts: string[] = [
		`<p class="back"><a href="index.html">${escapeHtml(text.labels.back)}</a> · ${escapeHtml(text.bookTitle)}</p>`,
		`<h1>${escapeHtml(entry.title)}</h1>`,
	];
	const line = meta(entry);
	if (line) parts.push(`<p class="meta">${line}</p>`);
	parts.push(`<article class="note-body">${text.body}</article>`);
	if (text.backlinks.length > 0) {
		parts.push(`<div class="linked-from"><strong>${escapeHtml(text.labels.linkedFrom)}</strong><ul>`);
		for (const link of text.backlinks) parts.push(`<li><a href="${link.href}">${escapeHtml(link.title)}</a></li>`);
		parts.push("</ul></div>");
	}
	return page(text.lang, `${entry.title} · ${text.bookTitle}`, parts.join("\n"));
}
