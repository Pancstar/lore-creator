import { describe, expect, it } from "vitest";
import { collectRelations, layoutRings, neighbourhood } from "../src/relations";
import { TypeRegistry } from "../src/types";
import { makeApp, registryNote } from "./fakeApp";

const REGISTRY = "System/Types.md";

const vault = () =>
	makeApp({
		[REGISTRY]: registryNote({ character: [{ name: "home", kind: "link" }, { name: "nickname", kind: "text" }] }),
		"Mira.md": { type: "character", home: "[[Harbour]]", related: ["[[Tobin]]", "[[Lantern]]"], nickname: "[[Not a link field]]" },
		"Tobin.md": { type: "character", "breaks-law": "[[The lantern never goes out]]", related: "[[Mira]]" },
		"Harbour.md": { type: "place" },
		"Lantern.md": { type: "event", related: "[[Harbour]]", next: "[[Tobin]]" },
		"The lantern never goes out.md": { type: "law" },
		"Old Mira.md": { type: "character", "version-of": "[[Mira]]", related: "[[Harbour]]" },
		"Far.md": { type: "place", related: "[[Harbour]]" },
	});

const relations = () => {
	const { app, file } = vault();
	const types = new TypeRegistry(app, REGISTRY);
	const edges = collectRelations(app, types, (field) => field.name, { laws: "bound by", breaks: "breaks" });
	return { app, file, edges };
};

describe("collectRelations", () => {
	it("draws link fields from the type registry and the law fields, labelled", () => {
		const { edges } = relations();
		const text = edges.map((edge) => `${edge.from} -${edge.label}-> ${edge.to}`).sort();
		expect(text).toEqual([
			"Far.md -related-> Harbour.md",
			"Lantern.md -related-> Harbour.md",
			"Mira.md -home-> Harbour.md",
			"Mira.md -related-> Lantern.md",
			"Mira.md -related-> Tobin.md",
			"Tobin.md -breaks-> The lantern never goes out.md",
			"Tobin.md -related-> Mira.md",
		]);
	});

	it("leaves out text fields, next/prev and archived versions", () => {
		const { edges } = relations();
		expect(edges.some((edge) => edge.label === "nickname" || edge.label === "next")).toBe(false);
		expect(edges.some((edge) => edge.from === "Old Mira.md")).toBe(false);
	});
});

describe("neighbourhood", () => {
	it("takes notes one step away in both directions", () => {
		const { app, file, edges } = relations();
		const near = neighbourhood(edges, file("Mira.md"), 1, 60, (path) => app.vault.getFileByPath(path));
		expect(near.nodes.map((node) => `${node.file.path}@${node.depth}`)).toEqual([
			"Mira.md@0",
			"Harbour.md@1",
			"Lantern.md@1",
			"Tobin.md@1",
		]);
		// Only edges between shown notes.
		expect(near.edges.every((edge) => edge.to !== "The lantern never goes out.md")).toBe(true);
		expect(near.hidden).toBe(0);
	});

	it("goes a second step and remembers which first-step note led there", () => {
		const { app, file, edges } = relations();
		const far = neighbourhood(edges, file("Mira.md"), 2, 60, (path) => app.vault.getFileByPath(path));
		const second = far.nodes.filter((node) => node.depth === 2);
		expect(second.map((node) => `${node.file.path}<${node.parent}`)).toEqual([
			"Far.md<Harbour.md",
			"The lantern never goes out.md<Tobin.md",
		]);
	});

	it("keeps at most the limit and counts the rest", () => {
		const { app, file, edges } = relations();
		const few = neighbourhood(edges, file("Mira.md"), 2, 2, (path) => app.vault.getFileByPath(path));
		expect(few.nodes).toHaveLength(3);
		expect(few.hidden).toBe(3);
		expect(few.nodes.filter((node) => node.depth === 1)).toHaveLength(2);
	});

	it("is just the note when nothing is connected", () => {
		const { app, file, edges } = relations();
		const alone = neighbourhood(edges, file("Old Mira.md"), 2, 60, (path) => app.vault.getFileByPath(path));
		expect(alone.nodes.map((node) => node.file.path)).toEqual(["Old Mira.md"]);
		expect(alone.edges).toEqual([]);
	});
});

describe("layoutRings", () => {
	it("puts the centre in the middle and each step on its own ring, children near their parent", () => {
		const positions = layoutRings([
			{ id: "c", depth: 0 },
			{ id: "a", depth: 1 },
			{ id: "b", depth: 1 },
			{ id: "a1", depth: 2, parent: "a" },
			{ id: "b1", depth: 2, parent: "b" },
		]);
		expect(positions.get("c")).toEqual({ x: 0, y: 0 });
		const r = (id: string) => Math.hypot(positions.get(id)!.x, positions.get(id)!.y);
		expect(r("a")).toBeCloseTo(r("b"));
		expect(r("a1")).toBeGreaterThan(r("a"));
		const angle = (id: string) => Math.atan2(positions.get(id)!.y, positions.get(id)!.x);
		const gap = (x: number, y: number) => Math.abs(Math.atan2(Math.sin(x - y), Math.cos(x - y)));
		expect(gap(angle("a1"), angle("a"))).toBeLessThan(gap(angle("a1"), angle("b")));
	});

	it("widens a ring so many notes do not overlap", () => {
		const many = [{ id: "c", depth: 0 }, ...Array.from({ length: 40 }, (_, i) => ({ id: `n${i}`, depth: 1 }))];
		const positions = layoutRings(many);
		const first = positions.get("n0")!;
		const second = positions.get("n1")!;
		expect(Math.hypot(first.x - second.x, first.y - second.y)).toBeGreaterThanOrEqual(60);
	});
});

describe("curveAround", () => {
	it("bends a line between two outer notes away from the middle, even when they face each other", async () => {
		const { curveAround } = await import("../src/relations");
		const across = curveAround({ x: -200, y: 0 }, { x: 200, y: 0 }, 150);
		expect(Math.hypot(across.x, across.y)).toBeGreaterThanOrEqual(150);
		const side = curveAround({ x: 100, y: 200 }, { x: 200, y: 100 }, 150);
		expect(Math.hypot(side.x, side.y)).toBeGreaterThan(Math.hypot(150, 150));
	});
});

describe("relations (review)", () => {
	it("draws no line to archives, templates or files that are not notes", async () => {
		const { setTemplatesFolder } = await import("../src/scope");
		setTemplatesFolder("Templates");
		const { app } = makeApp({
			[REGISTRY]: registryNote({ character: [{ name: "portrait", kind: "link" }] }),
			"Mira.md": {
				type: "character",
				related: ["[[Mira — v1]]", "[[Templates/Character]]", "[[Tobin]]"],
				portrait: "[[mira.png]]",
			},
			"Mira — v1.md": { type: "character", "version-of": "[[Mira]]" },
			"Templates/Character.md": { type: "character" },
			"Tobin.md": { type: "character" },
			"mira.png": {},
		});
		(app.vault.getFileByPath("mira.png") as unknown as { extension: string }).extension = "png";
		const edges = collectRelations(app, new TypeRegistry(app, REGISTRY), (field) => field.name, {
			laws: "bound by",
			breaks: "breaks",
		});
		setTemplatesFolder("");
		expect(edges.map((edge) => edge.to)).toEqual(["Tobin.md"]);
	});

	it("merges the lines between one pair of notes, keeping every label and both directions", async () => {
		const { mergePairs } = await import("../src/relations");
		const lines = mergePairs([
			{ from: "Law.md", to: "Mira.md", label: "applies to" },
			{ from: "Mira.md", to: "Law.md", label: "bound by" },
			{ from: "Mira.md", to: "Home.md", label: "home" },
			{ from: "Mira.md", to: "Home.md", label: "location" },
		]);
		expect(lines).toEqual([
			{ from: "Law.md", to: "Mira.md", labels: ["applies to", "bound by"], both: true },
			{ from: "Mira.md", to: "Home.md", labels: ["home", "location"], both: false },
		]);
	});

	it("keeps exactly the limit when the first step alone is larger", () => {
		const { app, file, edges } = relations();
		const one = neighbourhood(edges, file("Mira.md"), 1, 1, (path) => app.vault.getFileByPath(path));
		expect(one.nodes).toHaveLength(2);
		expect(one.hidden).toBe(2);
	});

	it("never lets two boxes on a ring overlap", async () => {
		const box = { width: 150, height: 32, gap: 16 };
		for (const count of [3, 10, 20, 60]) {
			const items = [{ id: "c", depth: 0 }, ...Array.from({ length: count }, (_, i) => ({ id: `n${i}`, depth: 1 }))];
			const positions = [...layoutRings(items, box).entries()].filter(([id]) => id !== "c").map(([, at]) => at);
			for (let i = 0; i < positions.length; i++) {
				for (let j = i + 1; j < positions.length; j++) {
					const apart =
						Math.abs(positions[i].x - positions[j].x) >= box.width ||
						Math.abs(positions[i].y - positions[j].y) >= box.height;
					expect(apart, `${count} notes: ${i} and ${j}`).toBe(true);
				}
			}
		}
	});

	it("knows how far a bent line reaches, so the drawing can make room for it", async () => {
		const { curvePeak } = await import("../src/relations");
		expect(curvePeak({ x: 0, y: 0 }, { x: 0, y: 100 }, { x: 100, y: 0 })).toEqual({ x: 25, y: 50 });
	});
});
