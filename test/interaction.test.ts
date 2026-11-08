import { describe, expect, it } from "vitest";
import {
	EMPTY_FILTER,
	divergenceMoment,
	isFiltering,
	neighbour,
	nodeMatches,
	pruneFilter,
	searchMatches,
	visibleEdges,
} from "../src/timeline/interaction";
import type { TimelineNode } from "../src/timeline/model";
import { TimelineModel } from "../src/timeline/model";
import type { Layout, PlacedNode } from "../src/timeline/layout";
import { makeApp } from "./fakeApp";

function node(path: string, extra: Partial<TimelineNode> = {}): TimelineNode {
	return {
		path,
		file: { path } as TimelineNode["file"],
		title: path.replace(/\.md$/, ""),
		icon: "",
		iconType: "emoji",
		type: "event",
		status: "draft",
		timeline: "main",
		flow: "",
		time: 0,
		timeEnd: null,
		timeLabel: "",
		precision: "year",
		uncertain: false,
		next: [],
		prev: [],
		...extra,
	};
}

function place(n: TimelineNode, x: number, y: number): PlacedNode {
	return { node: n, x, y, width: 100, height: 36 };
}

describe("nodeMatches", () => {
	const kai = node("Kai.md", { status: "partial", flow: "kai", type: "character", timeLabel: "Year of Ice" });

	it("matches everything with no filter and no query", () => {
		expect(nodeMatches(kai, EMPTY_FILTER, "")).toBe(true);
		expect(isFiltering(EMPTY_FILTER, "  ")).toBe(false);
	});

	it("applies each non-empty list", () => {
		expect(nodeMatches(kai, { ...EMPTY_FILTER, statuses: ["partial"] }, "")).toBe(true);
		expect(nodeMatches(kai, { ...EMPTY_FILTER, statuses: ["done"] }, "")).toBe(false);
		expect(nodeMatches(kai, { ...EMPTY_FILTER, flows: ["village"] }, "")).toBe(false);
		expect(nodeMatches(kai, { ...EMPTY_FILTER, types: ["character", "event"] }, "")).toBe(true);
		expect(isFiltering({ ...EMPTY_FILTER, types: ["event"] }, "")).toBe(true);
	});

	it("filters the unnamed flow by its empty id", () => {
		const loose = node("Loose.md", { flow: "" });
		expect(nodeMatches(loose, { ...EMPTY_FILTER, flows: [""] }, "")).toBe(true);
		expect(nodeMatches(kai, { ...EMPTY_FILTER, flows: [""] }, "")).toBe(false);
	});

	it("searches title and time label, ignoring case the Turkish way", () => {
		expect(nodeMatches(kai, EMPTY_FILTER, "KA")).toBe(true);
		expect(nodeMatches(kai, EMPTY_FILTER, "ice")).toBe(true);
		const istanbul = node("İstanbul.md");
		expect(nodeMatches(istanbul, EMPTY_FILTER, "istan")).toBe(true);
		expect(nodeMatches(istanbul, EMPTY_FILTER, "İSTAN")).toBe(true);
		const kirik = node("Kırık kule.md");
		expect(nodeMatches(kirik, EMPTY_FILTER, "KIRIK")).toBe(true);
		expect(nodeMatches(kai, EMPTY_FILTER, "zzz")).toBe(false);
	});
});

describe("searchMatches", () => {
	it("orders hits left to right, then top to bottom", () => {
		const placed = [
			place(node("B fire.md"), 300, 50),
			place(node("A fire.md"), 100, 200),
			place(node("C fire.md"), 100, 80),
			place(node("Water.md"), 50, 50),
		];
		expect(searchMatches(placed, "fire")).toEqual(["C fire.md", "A fire.md", "B fire.md"]);
		expect(searchMatches(placed, "")).toEqual([]);
	});
});

describe("neighbour", () => {
	const a = node("A.md", { flow: "one" });
	const b = node("B.md", { flow: "one" });
	const c = node("C.md", { flow: "two" });
	const d = node("D.md", { flow: "two" });
	const u = node("U.md", { time: null });
	const layout = {
		placed: [place(a, 100, 70), place(b, 400, 70), place(c, 120, 170), place(d, 600, 170), place(u, 100, 270)],
		lanes: [
			{ id: "one", name: "one", y: 70, height: 36, untimed: false },
			{ id: "two", name: "two", y: 170, height: 36, untimed: false },
			{ id: "__untimed", name: "", y: 270, height: 36, untimed: true },
		],
	} as unknown as Layout;

	it("moves along the lane", () => {
		expect(neighbour(layout, "A.md", "right")).toBe("B.md");
		expect(neighbour(layout, "B.md", "left")).toBe("A.md");
		expect(neighbour(layout, "A.md", "left")).toBeNull();
	});

	it("moves between lanes to the closest x", () => {
		expect(neighbour(layout, "B.md", "down")).toBe("D.md");
		expect(neighbour(layout, "A.md", "down")).toBe("C.md");
		expect(neighbour(layout, "C.md", "down")).toBe("U.md");
		expect(neighbour(layout, "A.md", "up")).toBeNull();
	});
});

describe("divergenceMoment", () => {
	it("is the point note's time, or nothing", () => {
		expect(divergenceMoment(node("P.md", { time: 12 }))).toBe(12);
		expect(divergenceMoment(node("P.md", { time: null }))).toBeNull();
		expect(divergenceMoment(undefined)).toBeNull();
	});
});

describe("visibleEdges", () => {
	it("keeps edges whose both ends are drawn", () => {
		const edges = [
			{ from: "A.md", to: "B.md" },
			{ from: "B.md", to: "Gone.md" },
		];
		expect(visibleEdges(edges, new Set(["A.md", "B.md"]))).toEqual([{ from: "A.md", to: "B.md" }]);
	});
});

describe("model: divergence point", () => {
	it("reads divergence-point from the timeline note", () => {
		TimelineModel.invalidate();
		const { app } = makeApp({
			"Alt.md": { type: "timeline", "timeline-id": "alt", "diverges-from": "[[Main]]", "divergence-point": "[[Fork]]" },
		});
		const [definition] = new TimelineModel(app).definitions();
		expect(definition.divergesFrom).toBe("Main");
		expect(definition.divergencePoint).toBe("Fork");
	});
});

describe("review fixes", () => {
	it("searches only what the filter keeps", () => {
		const placed = [
			place(node("Fire done.md", { status: "done" }), 100, 50),
			place(node("Fire draft.md", { status: "draft" }), 200, 50),
		];
		expect(searchMatches(placed, "fire", { ...EMPTY_FILTER, statuses: ["done"] })).toEqual(["Fire done.md"]);
	});

	it("drops flows the shown timeline does not have", () => {
		const filter = { statuses: ["done" as const], flows: ["a", "gone"], types: ["event"] };
		expect(pruneFilter(filter, ["a", "b"])).toEqual({ statuses: ["done"], flows: ["a"], types: ["event"] });
		expect(pruneFilter(filter, ["a", "gone"])).toBe(filter);
	});
});

describe("emoji search (v0.9.2)", () => {
	it("matches Turkish keywords regardless of case and dotted/dotless i", async () => {
		const { searchEmoji } = await import("../src/emoji");
		expect(searchEmoji("KILIÇ").map((entry) => entry.char)).toContain("⚔️");
		expect(searchEmoji("isik").map((entry) => entry.char)).toContain("🕯️");
		expect(searchEmoji("SWORDS").map((entry) => entry.char)).toContain("⚔️");
	});
});

describe("accent-aware search (v0.9.2 review)", () => {
	it("an accented query matches only accented words; a plain one matches both", async () => {
		const { searchEmoji } = await import("../src/emoji");
		const hits = searchEmoji("ölü");
		expect(hits.length).toBeGreaterThan(0);
		for (const entry of hits) expect(`${entry.en} ${entry.tr}`.toLowerCase(), entry.char).toContain("ölü");
		expect(searchEmoji("isik").map((entry) => entry.char)).toContain("🕯️");
		expect(searchEmoji("KILIÇ").map((entry) => entry.char)).toContain("⚔️");
	});

	it("timeline search follows the same rule", () => {
		const gun = node("Gun.md");
		const gunTr = node("Gün doğumu.md");
		expect(nodeMatches(gun, EMPTY_FILTER, "Gün")).toBe(false);
		expect(nodeMatches(gunTr, EMPTY_FILTER, "Gün")).toBe(true);
		expect(nodeMatches(gunTr, EMPTY_FILTER, "gun")).toBe(true);
	});
});
