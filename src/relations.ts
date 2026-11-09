import { App, TFile } from "obsidian";
import type { FieldDefinition, TypeRegistry } from "./types";
import { resolveTargets } from "./links";
import { isTemplate, loreFiles } from "./scope";

/** One relation between two notes, by path, with the words shown on its line. */
export interface RelationEdge {
	from: string;
	to: string;
	label: string;
}

export interface RelationNode {
	file: TFile;
	/** 0 for the centre, then steps away from it. */
	depth: number;
	/** Path of the first-step note a second-step note was reached through. */
	parent?: string;
}

export interface Neighbourhood {
	nodes: RelationNode[];
	edges: RelationEdge[];
	/** Notes in reach that were left out to keep the picture readable. */
	hidden: number;
}

/**
 * Every relation in the vault: the link fields each type declares in the
 * registry (members, location, enemies…) and the law fields. `next`/`prev`
 * are the timeline's business and stay out. Only notes take part, at either
 * end: no archived version (a copy of its note), no template, no image.
 */
export function collectRelations(
	app: App,
	types: TypeRegistry,
	fieldLabel: (field: FieldDefinition) => string,
	lawLabels: { laws: string; breaks: string },
): RelationEdge[] {
	const edges: RelationEdge[] = [];
	const seen = new Set<string>();
	const isNote = (file: TFile) =>
		file.extension === "md" &&
		!isTemplate(file) &&
		!app.metadataCache.getFileCache(file)?.frontmatter?.["version-of"];
	const add = (from: TFile, value: unknown, label: string) => {
		for (const target of resolveTargets(app, value, from.path)) {
			if (target.path === from.path || !isNote(target)) continue;
			const key = `${from.path}\n${target.path}\n${label}`;
			if (seen.has(key)) continue;
			seen.add(key);
			edges.push({ from: from.path, to: target.path, label });
		}
	};

	for (const file of loreFiles(app)) {
		const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
		if (!frontmatter || frontmatter["version-of"]) continue;
		const type = types.byId(typeof frontmatter.type === "string" ? frontmatter.type : undefined);
		for (const field of type?.fields ?? []) {
			if (field.kind === "link" || field.kind === "links") add(file, frontmatter[field.name], fieldLabel(field));
		}
		add(file, frontmatter.laws, lawLabels.laws);
		add(file, frontmatter["breaks-law"], lawLabels.breaks);
	}
	return edges;
}

/** The vault's relations, kept until something changes (`invalidateRelations`). */
let cached: RelationEdge[] | null = null;

/** Like `collectRelations`, but scans the vault only once per change. */
export function relationIndex(...args: Parameters<typeof collectRelations>): RelationEdge[] {
	cached ??= collectRelations(...args);
	return cached;
}

/** Forgets the cached relations; called on every metadata change, rename, delete and settings save. */
export function invalidateRelations(): void {
	cached = null;
}

/** One drawn line: every relation between a pair of notes, whichever way it points. */
export interface RelationLine {
	from: string;
	to: string;
	labels: string[];
	/** Relations point both ways, so the line carries an arrow at each end. */
	both: boolean;
}

/**
 * Folds the relations between each pair of notes into one line, so two-way
 * or multi-field pairs do not draw over each other and their words stay
 * readable. The first relation seen sets the line's direction.
 */
export function mergePairs(edges: RelationEdge[]): RelationLine[] {
	const lines = new Map<string, RelationLine>();
	for (const edge of edges) {
		const key = [edge.from, edge.to].sort().join(String.fromCharCode(10));
		const line = lines.get(key);
		if (!line) {
			lines.set(key, { from: edge.from, to: edge.to, labels: [edge.label], both: false });
			continue;
		}
		if (!line.labels.includes(edge.label)) line.labels.push(edge.label);
		if (edge.from !== line.from) line.both = true;
	}
	return [...lines.values()];
}

const byPath = (a: string, b: string) => a.localeCompare(b);

/**
 * The notes around `center`, up to `depth` steps away along relations in
 * either direction, and the relations between them. At most `limit` notes
 * besides the centre are kept, nearest first; the rest are counted.
 */
export function neighbourhood(
	edges: RelationEdge[],
	center: TFile,
	depth: 1 | 2,
	limit: number,
	fileOf: (path: string) => TFile | null,
): Neighbourhood {
	const around = new Map<string, Set<string>>();
	const link = (a: string, b: string) => {
		if (!around.has(a)) around.set(a, new Set());
		around.get(a)!.add(b);
	};
	for (const edge of edges) {
		link(edge.from, edge.to);
		link(edge.to, edge.from);
	}

	const reached: { path: string; depth: number; parent?: string }[] = [];
	const seen = new Set([center.path]);
	const first = [...(around.get(center.path) ?? [])].sort(byPath);
	for (const path of first) {
		seen.add(path);
		reached.push({ path, depth: 1 });
	}
	if (depth === 2) {
		for (const parent of first) {
			for (const path of [...(around.get(parent) ?? [])].sort(byPath)) {
				if (seen.has(path)) continue;
				seen.add(path);
				reached.push({ path, depth: 2, parent });
			}
		}
	}

	const nodes: RelationNode[] = [{ file: center, depth: 0 }];
	let hidden = 0;
	for (const entry of reached) {
		const file = fileOf(entry.path);
		if (!file) continue;
		if (nodes.length > limit) {
			hidden += 1;
			continue;
		}
		nodes.push({ file, depth: entry.depth, parent: entry.parent });
	}

	const shown = new Set(nodes.map((node) => node.file.path));
	return { nodes, edges: edges.filter((edge) => shown.has(edge.from) && shown.has(edge.to)), hidden };
}

/** A note's box in drawing units, and the least room between two boxes. */
export interface BoxSize {
	width: number;
	height: number;
	gap: number;
}

export const DEFAULT_BOX: BoxSize = { width: 150, height: 32, gap: 16 };

export interface RingItem {
	id: string;
	depth: number;
	parent?: string;
}

const RING_GAP = 150;

/**
 * Places the centre in the middle and each step on a ring around it. A ring
 * grows with its notes so they never crowd; second-step notes sit in the
 * order of the first-step notes that led to them, so each group stays near
 * its parent.
 */
export function layoutRings(items: RingItem[], box: BoxSize = DEFAULT_BOX): Map<string, { x: number; y: number }> {
	const positions = new Map<string, { x: number; y: number }>();
	// Neighbours are a chord apart; a chord at least a box wide keeps boxes
	// clear of each other wherever they sit on the ring.
	const ring = (count: number, inner: number) =>
		Math.max(inner + RING_GAP, count > 1 ? (box.width + box.gap) / (2 * Math.sin(Math.PI / count)) : 0);
	const place = (list: RingItem[], radius: number, start: number) => {
		list.forEach((item, index) => {
			const angle = start + (2 * Math.PI * index) / list.length;
			positions.set(item.id, { x: radius * Math.cos(angle), y: radius * Math.sin(angle) });
		});
	};

	for (const item of items) if (item.depth === 0) positions.set(item.id, { x: 0, y: 0 });

	const firstRing = items.filter((item) => item.depth === 1);
	const r1 = ring(firstRing.length, 0);
	place(firstRing, r1, -Math.PI / 2);

	const angleOf = (id: string | undefined) => {
		const at = id ? positions.get(id) : undefined;
		return at ? Math.atan2(at.y, at.x) : 0;
	};
	const order = new Map(firstRing.map((item, index) => [item.id, index]));
	const secondRing = items
		.filter((item) => item.depth === 2)
		.sort((a, b) => (order.get(a.parent ?? "") ?? 0) - (order.get(b.parent ?? "") ?? 0));
	if (secondRing.length > 0) place(secondRing, ring(secondRing.length, r1), angleOf(secondRing[0].parent));

	return positions;
}

/**
 * Control point for a line between two notes away from the middle: the line
 * bends outward so it never runs under the centre note and hides there.
 * `clearance` is how far from the middle the bend must at least reach.
 */
export function curveAround(
	from: { x: number; y: number },
	to: { x: number; y: number },
	clearance: number,
): { x: number; y: number } {
	const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
	const away = Math.hypot(mid.x, mid.y);
	if (away >= clearance / 2) {
		const reach = Math.max(away * 1.35, clearance);
		return { x: (mid.x / away) * reach, y: (mid.y / away) * reach };
	}
	// The two notes face each other across the middle: bend to one side, far
	// enough that the line's peak (halfway to this point) clears the centre box.
	const dx = to.x - from.x;
	const dy = to.y - from.y;
	const length = Math.hypot(dx, dy) || 1;
	return { x: mid.x + (-dy / length) * clearance * 2, y: mid.y + (dx / length) * clearance * 2 };
}

/** The point a bent line reaches furthest towards its bend (halfway along it). */
export function curvePeak(
	from: { x: number; y: number },
	bend: { x: number; y: number },
	to: { x: number; y: number },
): { x: number; y: number } {
	return { x: 0.25 * from.x + 0.5 * bend.x + 0.25 * to.x, y: 0.25 * from.y + 0.5 * bend.y + 0.25 * to.y };
}
