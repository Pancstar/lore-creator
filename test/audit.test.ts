import { describe, expect, it } from "vitest";
import { Audit, Issue, IssueKind } from "../src/audit";
import { TypeRegistry } from "../src/types";
import { TimelineModel } from "../src/timeline/model";
import { Frontmatter, makeApp, registryNote } from "./fakeApp";

const REGISTRY = "System/Types.md";

function run(notes: Record<string, Frontmatter>, body: Record<string, string[]> = {}): Issue[] {
	TimelineModel.invalidate();
	const { app } = makeApp({ [REGISTRY]: registryNote(), ...notes }, body);
	return new Audit(app, new TypeRegistry(app, REGISTRY)).run();
}

function kinds(issues: Issue[], path: string): IssueKind[] {
	return issues.filter((issue) => issue.file.path === path).map((issue) => issue.kind);
}

function find(issues: Issue[], kind: IssueKind, path?: string): Issue[] {
	return issues.filter((issue) => issue.kind === kind && (!path || issue.file.path === path));
}

const TIMELINE: Frontmatter = { type: "timeline", "timeline-id": "main", flows: ["kai", "village"] };

describe("audit: notes outside any timeline", () => {
	it("reports a broken link in a registry link field", () => {
		const issues = run({
			"Kai.md": { type: "character", related: "[[Missing]]" },
		});
		expect(find(issues, "broken-field-link", "Kai.md")).toHaveLength(1);
		expect(find(issues, "broken-field-link")[0].detail).toBe("related → Missing");
	});

	it("reports an unregistered type, but not a missing one", () => {
		const issues = run({
			"Smaug.md": { type: "dragon" },
			"Universe.md": { "time-name": "Year" },
		});
		expect(find(issues, "unknown-type")).toHaveLength(1);
		expect(find(issues, "unknown-type")[0].detail).toBe("dragon");
		expect(kinds(issues, "Universe.md")).toEqual([]);
	});

	it("skips archived versions entirely", () => {
		const issues = run({
			"Versions/Scene — v1.md": { type: "event", "version-of": "[[Scene]]", related: "[[Missing]]", next: "[[Nope]]" },
			"Scene.md": { type: "event" },
		});
		expect(kinds(issues, "Versions/Scene — v1.md")).toEqual([]);
	});
});

describe("audit: next and prev", () => {
	it("reports a self link once and nothing else for that note", () => {
		const issues = run({
			"Timeline.md": TIMELINE,
			"Self.md": { type: "event", timeline: "main", flow: "kai", time: 1, next: "[[Self]]" },
		});
		// Nothing else reaches Self, so it is also an orphan — a separate finding.
		expect(kinds(issues, "Self.md")).toEqual(["self-link", "orphan"]);
	});

	it("reports a prev that the other side does not answer", () => {
		const issues = run({
			"Timeline.md": TIMELINE,
			"A.md": { type: "event", timeline: "main", flow: "kai", time: 1 },
			"B.md": { type: "event", timeline: "main", flow: "kai", time: 2, prev: "[[A]]" },
		});
		expect(find(issues, "one-sided", "B.md").map((issue) => issue.detail)).toEqual(["A"]);
	});

	it("is quiet when next and prev mirror each other", () => {
		const issues = run({
			"Timeline.md": TIMELINE,
			"A.md": { type: "event", timeline: "main", flow: "kai", time: 1, next: "[[B]]" },
			"B.md": { type: "event", timeline: "main", flow: "kai", time: 2, prev: "[[A]]" },
		});
		expect(find(issues, "one-sided")).toEqual([]);
	});
});

describe("audit: laws", () => {
	it("reports a laws / breaks-law target that is not a law", () => {
		const issues = run({
			"Mira.md": { type: "character" },
			"Tobin.md": { type: "character", "breaks-law": "[[Mira]]", laws: "[[Mira]]" },
		});
		expect(find(issues, "law-not-law", "Tobin.md").map((issue) => issue.detail)).toEqual(["Mira", "Mira"]);
	});

	it("reports breaking a law outside the timelines it holds in", () => {
		const notes = {
			"Alt line.md": { type: "timeline", "timeline-id": "alt" },
			"Timeline.md": TIMELINE,
			"Law.md": { type: "law", "timeline-scope": "[[Alt line]]" },
		};
		const onMain = run({
			...notes,
			"Tobin.md": { type: "event", timeline: "main", flow: "kai", time: 1, "breaks-law": "[[Law]]" },
		});
		expect(find(onMain, "law-out-of-scope", "Tobin.md").map((issue) => issue.detail)).toEqual(["Law (alt)"]);

		const onAlt = run({
			...notes,
			"Tobin.md": { type: "event", timeline: "alt", flow: "kai", time: 1, "breaks-law": "[[Law]]" },
		});
		expect(find(onAlt, "law-out-of-scope")).toEqual([]);
	});

	it("does not flag a law with no scope", () => {
		const issues = run({
			"Timeline.md": TIMELINE,
			"Law.md": { type: "law" },
			"Tobin.md": { type: "event", timeline: "main", flow: "kai", time: 1, "breaks-law": "[[Law]]" },
		});
		expect(find(issues, "law-out-of-scope")).toEqual([]);
		expect(find(issues, "law-not-law")).toEqual([]);
	});
});

describe("audit: cycles", () => {
	const ev = (time: number, next?: string, prev?: string): Frontmatter => ({
		type: "event",
		timeline: "main",
		flow: "kai",
		time,
		...(next ? { next } : {}),
		...(prev ? { prev } : {}),
	});

	it("reports a loop once, on the first path, naming every member", () => {
		const issues = run({
			"Timeline.md": TIMELINE,
			"C.md": ev(3, "[[A]]", "[[B]]"),
			"A.md": ev(1, "[[B]]", "[[C]]"),
			"B.md": ev(2, "[[C]]", "[[A]]"),
		});
		const cycles = find(issues, "cycle");
		expect(cycles).toHaveLength(1);
		expect(cycles[0].file.path).toBe("A.md");
		expect(cycles[0].detail).toBe("A → B → C → A");
	});

	it("does not call a convergence a loop", () => {
		const issues = run({
			"Timeline.md": TIMELINE,
			"A.md": ev(1, "[[C]]"),
			"B.md": ev(1, "[[C]]"),
			"C.md": ev(2, undefined, ["[[A]]", "[[B]]"] as unknown as string),
		});
		expect(find(issues, "cycle")).toEqual([]);
	});

	it("does not count a self link as a loop", () => {
		const issues = run({
			"Timeline.md": TIMELINE,
			"Self.md": ev(1, "[[Self]]"),
		});
		expect(find(issues, "cycle")).toEqual([]);
	});
});

describe("audit: overlapping periods", () => {
	const period = (time: number, end: number | undefined, flow = "kai"): Frontmatter => ({
		type: "event",
		timeline: "main",
		flow,
		time,
		...(end === undefined ? {} : { "time-end": end }),
	});

	it("reports two periods in one flow that intersect, on the earlier note", () => {
		const issues = run({ "Timeline.md": TIMELINE, "X.md": period(10, 20), "Y.md": period(15, 30) });
		const overlaps = find(issues, "overlap");
		expect(overlaps).toHaveLength(1);
		expect(overlaps[0].file.path).toBe("X.md");
		expect(overlaps[0].detail).toBe("Y");
	});

	it("is quiet when periods only touch, when one is a moment, or in another flow", () => {
		expect(find(run({ "Timeline.md": TIMELINE, "X.md": period(10, 20), "Y.md": period(20, 30) }), "overlap")).toEqual([]);
		expect(find(run({ "Timeline.md": TIMELINE, "X.md": period(10, 20), "Y.md": period(15, undefined) }), "overlap")).toEqual([]);
		expect(find(run({ "Timeline.md": TIMELINE, "X.md": period(10, 20), "Y.md": period(15, 30, "village") }), "overlap")).toEqual([]);
	});
});

describe("audit: orphans", () => {
	it("reports a typed note nothing links to", () => {
		const issues = run({ "Kai.md": { type: "character" } });
		expect(find(issues, "orphan").map((issue) => issue.file.path)).toEqual(["Kai.md"]);
	});

	it("is satisfied by a body link or a frontmatter link", () => {
		const viaBody = run({ "Kai.md": { type: "character" }, "Scene.md": { type: "event" } }, { "Scene.md": ["Kai"] });
		expect(find(viaBody, "orphan", "Kai.md")).toEqual([]);

		const viaField = run({ "Kai.md": { type: "character" }, "Scene.md": { type: "event", related: "[[Kai]]" } });
		expect(find(viaField, "orphan", "Kai.md")).toEqual([]);
	});

	it("ignores links that only come from an archived version", () => {
		const issues = run({
			"Kai.md": { type: "character" },
			"Versions/Scene — v1.md": { type: "event", "version-of": "[[Scene]]", related: "[[Kai]]" },
			"Scene.md": { type: "event" },
		});
		expect(find(issues, "orphan", "Kai.md")).toHaveLength(1);
	});

	it("never calls a law, a draft, a timeline or an untyped note an orphan", () => {
		const issues = run({
			"Law.md": { type: "law" },
			"Idea.md": { type: "draft" },
			"Timeline.md": TIMELINE,
			"Universe.md": { "time-name": "Year" },
		});
		expect(find(issues, "orphan")).toEqual([]);
	});
});

describe("audit: system notes", () => {
	it("knows the system type and never calls a system note an orphan", () => {
		const issues = run({ "Universe.md": { type: "system" } });
		expect(kinds(issues, "Universe.md")).toEqual([]);
	});
});

describe("audit: review fixes", () => {
	it("still calls a note that only links to itself an orphan", () => {
		const issues = run({ "Self.md": { type: "character", related: "[[Self]]" } });
		expect(find(issues, "orphan", "Self.md")).toHaveLength(1);
	});

	it("lets a body link from a note without frontmatter save an orphan", () => {
		TimelineModel.invalidate();
		const { app } = makeApp(
			{ [REGISTRY]: registryNote(), "Kai.md": { type: "character" }, "Index.md": undefined as unknown as Frontmatter },
			{ "Index.md": ["Kai"] },
		);
		const issues = new Audit(app, new TypeRegistry(app, REGISTRY)).run();
		expect(find(issues, "orphan", "Kai.md")).toEqual([]);
	});

	it("reads idea-for as text unless it is written as a link", () => {
		const text = run({ "Idea.md": { type: "draft", "idea-for": "Chapter 3" } });
		expect(find(text, "broken-field-link")).toEqual([]);
		const link = run({ "Idea.md": { type: "draft", "idea-for": "[[Missing]]" } });
		expect(find(link, "broken-field-link", "Idea.md").map((issue) => issue.detail)).toEqual(["idea-for → Missing"]);
	});

	it("checks next and prev on notes with no timeline", () => {
		const issues = run({
			"A.md": { type: "event", next: "[[Missing]]" },
			"Self.md": { type: "event", next: "[[Self]]" },
		});
		expect(find(issues, "broken-link", "A.md").map((issue) => issue.detail)).toEqual(["Missing"]);
		expect(find(issues, "self-link", "Self.md")).toHaveLength(1);
	});

	it("reports a self link once even when next and prev both point home", () => {
		const issues = run({ "Self.md": { type: "event", next: "[[Self]]", prev: "[[Self]]" } });
		expect(find(issues, "self-link", "Self.md")).toHaveLength(1);
	});

	it("finds a loop that shares a node with another path", () => {
		const ev = (next: string[]): Frontmatter => ({ type: "event", next });
		const issues = run({
			"A.md": ev(["[[B]]", "[[C]]"]),
			"B.md": ev(["[[D]]"]),
			"C.md": ev(["[[D]]"]),
			"D.md": ev(["[[A]]"]),
		});
		const cycles = find(issues, "cycle");
		expect(cycles).toHaveLength(1);
		expect(cycles[0].file.path).toBe("A.md");
		for (const name of ["A", "B", "C", "D"]) expect(cycles[0].detail).toContain(name);
	});
});

describe("audit: ambiguous records", () => {
	const SETS = "System/Version sets.md";
	const runWith = (notes: Record<string, Frontmatter>) => {
		TimelineModel.invalidate();
		const { app } = makeApp({ [REGISTRY]: registryNote(), ...notes });
		return new Audit(app, new TypeRegistry(app, REGISTRY), SETS).run();
	};

	it("flags an archive whose version-of names a note several notes share", () => {
		const issues = runWith({
			"Act 1/Scene.md": { type: "event" },
			"Act 2/Scene.md": { type: "event" },
			"Versions/Scene — v1.md": { type: "event", "version-of": "[[Scene]]" },
		});
		expect(find(issues, "ambiguous-link").map((issue) => [issue.file.path, issue.detail])).toEqual([
			["Versions/Scene — v1.md", "Scene"],
		]);
	});

	it("is quiet for a unique name or a path link", () => {
		const issues = runWith({
			"Act 1/Scene.md": { type: "event" },
			"Act 2/Scene.md": { type: "event" },
			"Act 1/Solo.md": { type: "event" },
			"Versions/Scene — v1.md": { type: "event", "version-of": "[[Act 1/Scene]]" },
			"Versions/Solo — v1.md": { type: "event", "version-of": "[[Solo]]" },
		});
		expect(find(issues, "ambiguous-link")).toEqual([]);
	});

	it("flags a version set entry that names a shared note", () => {
		const issues = runWith({
			"Act 1/Scene.md": { type: "event" },
			"Act 2/Scene.md": { type: "event" },
			[SETS]: { type: "system", sets: [{ id: "a", name: "A", entries: [{ note: "Scene", version: "v2" }] }] },
		});
		expect(find(issues, "ambiguous-link", SETS).map((issue) => issue.detail)).toEqual(["Scene"]);
	});
});

describe("audit: ambiguous records (review fixes)", () => {
	const runWith = (notes: Record<string, Frontmatter>) => {
		TimelineModel.invalidate();
		const { app } = makeApp({ [REGISTRY]: registryNote(), ...notes });
		return new Audit(app, new TypeRegistry(app, REGISTRY), "/System/Version sets.md/").run();
	};

	it("flags a bare name even when a root-level note carries it (v0.9.6): it may mean either", () => {
		const issues = runWith({
			"Scene.md": { type: "event" },
			"Act 2/Scene.md": { type: "event" },
			"Versions/Scene — v1.md": { type: "event", "version-of": "[[Scene]]" },
		});
		expect(find(issues, "ambiguous-link")).toHaveLength(1);
	});

	it("does not flag a root-level note named with its extension", () => {
		const issues = runWith({
			"Scene.md": { type: "event" },
			"Act 2/Scene.md": { type: "event" },
			"Versions/Scene — v1.md": { type: "event", "version-of": "[[Scene.md]]" },
		});
		expect(find(issues, "ambiguous-link")).toEqual([]);
	});

	it("counts names without regard to case", () => {
		const issues = runWith({
			"Act 1/scene.md": { type: "event" },
			"Act 2/Scene.md": { type: "event" },
			"Versions/Scene — v1.md": { type: "event", "version-of": "[[Scene]]" },
		});
		expect(find(issues, "ambiguous-link")).toHaveLength(1);
	});

	it("finds the sets note even when its path setting has stray slashes", () => {
		const issues = runWith({
			"Act 1/Scene.md": { type: "event" },
			"Act 2/Scene.md": { type: "event" },
			"System/Version sets.md": { type: "system", sets: [{ id: "a", entries: [{ note: "Scene", version: "v1" }] }] },
		});
		expect(find(issues, "ambiguous-link", "System/Version sets.md")).toHaveLength(1);
	});
});

describe("audit: law targets (v0.9.1)", () => {
	it("calls a note without frontmatter, named as a law, not a law", () => {
		const issues = run({ "Kai.md": { type: "character", laws: "[[Plain]]" }, "Plain.md": undefined as unknown as Frontmatter });
		expect(find(issues, "law-not-law", "Kai.md").map((issue) => issue.detail)).toEqual(["Plain"]);
	});

	it("reports the same wrong target once per field", () => {
		const issues = run({
			"Mira.md": { type: "character" },
			"Kai.md": { type: "character", "breaks-law": ["[[Mira]]", "[[Mira]]"] },
		});
		expect(find(issues, "law-not-law", "Kai.md")).toHaveLength(1);
	});
});

describe("audit: law target in templates (v0.9.1)", () => {
	it("calls a template, named as a law, not a law", async () => {
		const { setTemplatesFolder } = await import("../src/scope");
		setTemplatesFolder("Templates");
		try {
			const issues = run({ "Kai.md": { type: "character", laws: "[[Law tpl]]" }, "Templates/Law tpl.md": { type: "law" } });
			expect(find(issues, "law-not-law", "Kai.md").map((issue) => issue.detail)).toEqual(["Law tpl"]);
		} finally {
			setTemplatesFolder("");
		}
	});
});

describe("audit: waits for the link index (v0.9.3)", () => {
	it("skips orphans and says so while some notes are not indexed yet", () => {
		TimelineModel.invalidate();
		const { app } = makeApp({ [REGISTRY]: registryNote(), "Kai.md": { type: "character" } });
		delete (app.metadataCache.resolvedLinks as Record<string, unknown>)["Kai.md"];
		const audit = new Audit(app, new TypeRegistry(app, REGISTRY));
		expect(find(audit.run(), "orphan")).toEqual([]);
		expect(audit.indexing).toBe(true);
	});

	it("checks orphans once every note is indexed", () => {
		TimelineModel.invalidate();
		const { app } = makeApp({ [REGISTRY]: registryNote(), "Kai.md": { type: "character" } });
		const audit = new Audit(app, new TypeRegistry(app, REGISTRY));
		expect(find(audit.run(), "orphan")).toHaveLength(1);
		expect(audit.indexing).toBe(false);
	});
});

describe("audit: resolves each link once (v0.9.3)", () => {
	it("asks Obsidian at most once per note and link", () => {
		TimelineModel.invalidate();
		const notes: Record<string, Frontmatter> = { [REGISTRY]: registryNote(), "Timeline.md": TIMELINE, "Law.md": { type: "law" } };
		for (let i = 0; i < 50; i++) {
			notes[`N${i}.md`] = {
				type: "event",
				timeline: "main",
				flow: "kai",
				time: i,
				next: `[[N${i + 1}]]`,
				prev: i ? `[[N${i - 1}]]` : [],
				related: `[[N${(i * 7) % 50}]]`,
				"breaks-law": "[[Law]]",
			};
		}
		const { app } = makeApp(notes);
		const cache = app.metadataCache as unknown as { getFirstLinkpathDest: (link: string, source: string) => unknown };
		const original = cache.getFirstLinkpathDest;
		const asked = new Map<string, number>();
		cache.getFirstLinkpathDest = (link: string, source: string) => {
			const key = `${source}|${link}`;
			asked.set(key, (asked.get(key) ?? 0) + 1);
			return original(link, source);
		};
		new Audit(app, new TypeRegistry(app, REGISTRY)).run();
		expect(Math.max(...asked.values())).toBe(1);
	});
});

describe("audit: index wait and reuse (v0.9.3 review)", () => {
	it("trusts a completed first index even if one file has no entry", () => {
		TimelineModel.invalidate();
		const { app } = makeApp({ [REGISTRY]: registryNote(), "Kai.md": { type: "character" } });
		delete (app.metadataCache.resolvedLinks as Record<string, unknown>)["Kai.md"];
		const audit = new Audit(app, new TypeRegistry(app, REGISTRY), "", () => true);
		expect(find(audit.run(), "orphan")).toHaveLength(1);
		expect(audit.indexing).toBe(false);
	});

	it("a reused audit reports orphans again once the index is back", () => {
		TimelineModel.invalidate();
		const { app } = makeApp({ [REGISTRY]: registryNote(), "Kai.md": { type: "character" } });
		const links = app.metadataCache.resolvedLinks as Record<string, Record<string, number>>;
		const saved = links["Kai.md"];
		delete links["Kai.md"];
		const audit = new Audit(app, new TypeRegistry(app, REGISTRY));
		expect(find(audit.run(), "orphan")).toEqual([]);
		links["Kai.md"] = saved;
		expect(find(audit.run(), "orphan")).toHaveLength(1);
		expect(audit.indexing).toBe(false);
	});

	it("a reused audit sees a link that started resolving since its last run", () => {
		TimelineModel.invalidate();
		const { app } = makeApp({ [REGISTRY]: registryNote(), "Kai.md": { type: "character", related: "[[Later]]" } });
		const audit = new Audit(app, new TypeRegistry(app, REGISTRY));
		expect(find(audit.run(), "broken-field-link")).toHaveLength(1);
		const cache = app.metadataCache as unknown as { getFirstLinkpathDest: (link: string, source: string) => unknown };
		const original = cache.getFirstLinkpathDest;
		cache.getFirstLinkpathDest = (link, source) => (link === "Later" ? { path: "Later.md", basename: "Later" } : original(link, source));
		expect(find(audit.run(), "broken-field-link")).toEqual([]);
	});
});
