import { App, TFile } from "obsidian";
import { linkTargets } from "./links";
import { TimelineModel } from "./timeline/model";
import { asNumberOrNull, asString } from "./frontmatter";
import { loreFiles } from "./scope";
import { TypeRegistry } from "./types";

export type IssueKind =
	| "broken-link"
	| "broken-field-link"
	| "one-sided"
	| "self-link"
	| "backwards"
	| "no-time"
	| "unknown-timeline"
	| "unknown-flow"
	| "unknown-type"
	| "law-not-law"
	| "law-out-of-scope"
	| "cycle"
	| "overlap"
	| "orphan";

/** Display order in the report and in the filter chips. */
export const ISSUE_KINDS: IssueKind[] = [
	"broken-link",
	"broken-field-link",
	"one-sided",
	"self-link",
	"backwards",
	"no-time",
	"unknown-timeline",
	"unknown-flow",
	"unknown-type",
	"law-not-law",
	"law-out-of-scope",
	"cycle",
	"overlap",
	"orphan",
];

/** Types that exist to be referred *from*, not linked *to*. */
const NEVER_ORPHAN = new Set(["timeline", "law", "draft", "system"]);

/** The plugin's own notes (universe, registry, version sets) carry this type without being in the registry. */
const SYSTEM_TYPE = "system";

export interface Issue {
	kind: IssueKind;
	file: TFile;
	/** Filled in when the issue concerns a second note or a named target. */
	detail: string;
}

/** One note as the pass sees it; resolved once, read by every check. */
interface Note {
	file: TFile;
	frontmatter: Record<string, unknown>;
	type: string;
	timeline: string;
	flow: string;
	time: number | null;
	timeEnd: number | null;
}

/**
 * Link fields every type shares, whatever the registry says. Registry fields
 * of kind `link` / `links` are added per type; `next` and `prev` are checked
 * separately because they carry structure, not just a reference.
 */
const STANDARD_LINK_FIELDS = ["related", "laws", "breaks-law", "applies-to", "promoted-to", "promoted-from"];

/**
 * `idea-for` is free text ("Chapter 3") that *may* be a link; only a value
 * written with brackets is checked as one.
 */
const OPTIONAL_LINK_FIELDS = ["idea-for"];

/**
 * Mechanical checks over the vault's own declarations. Everything here is
 * advisory: nothing is corrected, nothing is blocked, and a finding is often
 * just work in progress rather than a mistake — half-written is a normal state
 * in this vault, so the report is a prompt to look, never a demand to fix.
 */
export class Audit {
	private model: TimelineModel;

	constructor(
		private app: App,
		private types: TypeRegistry,
	) {
		this.model = new TimelineModel(this.app);
	}

	run(): Issue[] {
		const issues: Issue[] = [];
		const notes = this.collect();
		const definitions = this.model.definitions();
		const timelineIds = new Set(definitions.map((definition) => definition.id));
		const flowsByTimeline = new Map(
			definitions.map((definition) => [definition.id, new Set(definition.flows.map((flow) => flow.id))]),
		);

		for (const note of notes.values()) {
			this.checkType(issues, note);
			this.checkFieldLinks(issues, note);
			this.checkLaws(issues, note, notes);
			// `next`/`prev` carry the story whether or not the note sits on a
			// timeline: the navigator follows them either way.
			this.checkLinks(issues, note, notes);

			if (!note.timeline) continue;
			this.checkTimeline(issues, note, timelineIds);
			this.checkFlow(issues, note, flowsByTimeline);
			this.checkTime(issues, note);
		}

		this.checkCycles(issues, notes);
		this.checkOverlaps(issues, notes);
		this.checkOrphans(issues, notes);

		return issues;
	}

	/**
	 * A typed note no other live note reaches, by a link in its text or in a
	 * field. Archived versions do not count as readers: they are the past.
	 */
	private checkOrphans(issues: Issue[], notes: Map<string, Note>) {
		const incoming = new Set<string>();
		// Body links count from every live note, including ones with no
		// frontmatter at all — an index or a session note is a reader too.
		for (const file of loreFiles(this.app)) {
			if (this.app.metadataCache.getFileCache(file)?.frontmatter?.["version-of"]) continue;
			for (const path of Object.keys(this.app.metadataCache.resolvedLinks[file.path] ?? {})) {
				if (path !== file.path) incoming.add(path);
			}
		}
		// Field links again, in case a field holds bare text without brackets,
		// which Obsidian's own index does not count as a link. A note does not
		// reach itself.
		for (const note of notes.values()) {
			for (const field of [...this.linkFields(note), ...OPTIONAL_LINK_FIELDS, "next", "prev"]) {
				for (const link of linkTargets(note.frontmatter[field])) {
					const target = this.resolve(link, note);
					if (target && target.path !== note.file.path) incoming.add(target.path);
				}
			}
		}

		for (const note of notes.values()) {
			if (!note.type || NEVER_ORPHAN.has(note.type) || !this.types.byId(note.type)) continue;
			if (!incoming.has(note.file.path)) {
				issues.push({ kind: "orphan", file: note.file, detail: "" });
			}
		}
	}

	/**
	 * A `next` chain that comes back to where it started. Every strongly
	 * connected group of notes with more than one member is one loop (Tarjan,
	 * iterative so a long chain cannot overflow the stack). Reported once, on
	 * the alphabetically first member, listing every member; a chain that
	 * merely converges is not one.
	 */
	private checkCycles(issues: Issue[], notes: Map<string, Note>) {
		const nextOf = new Map<string, string[]>();
		for (const note of notes.values()) {
			const targets: string[] = [];
			for (const link of linkTargets(note.frontmatter.next)) {
				const target = this.resolve(link, note);
				if (target && target.path !== note.file.path && notes.has(target.path)) targets.push(target.path);
			}
			nextOf.set(note.file.path, targets);
		}

		const index = new Map<string, number>();
		const low = new Map<string, number>();
		const onStack = new Set<string>();
		const stack: string[] = [];
		let counter = 0;

		const enter = (path: string) => {
			index.set(path, counter);
			low.set(path, counter);
			counter++;
			stack.push(path);
			onStack.add(path);
		};

		for (const root of [...notes.keys()].sort()) {
			if (index.has(root)) continue;
			enter(root);
			const frames = [{ node: root, next: 0 }];

			while (frames.length > 0) {
				const frame = frames[frames.length - 1];
				const targets = nextOf.get(frame.node) ?? [];

				if (frame.next < targets.length) {
					const target = targets[frame.next++];
					if (!index.has(target)) {
						enter(target);
						frames.push({ node: target, next: 0 });
					} else if (onStack.has(target)) {
						low.set(frame.node, Math.min(low.get(frame.node)!, index.get(target)!));
					}
					continue;
				}

				frames.pop();
				const parent = frames[frames.length - 1];
				if (parent) low.set(parent.node, Math.min(low.get(parent.node)!, low.get(frame.node)!));

				if (low.get(frame.node) === index.get(frame.node)) {
					const members: string[] = [];
					let member: string;
					do {
						member = stack.pop()!;
						onStack.delete(member);
						members.push(member);
					} while (member !== frame.node);
					if (members.length > 1) this.recordCycle(issues, notes, members, nextOf);
				}
			}
		}
	}

	private recordCycle(issues: Issue[], notes: Map<string, Note>, members: string[], nextOf: Map<string, string[]>) {
		const inside = new Set(members);
		const start = [...members].sort()[0];

		// Tell the loop as a walk from its first member; members the walk does
		// not pass through (a second path round the loop) are listed after it.
		const walk = [start];
		const visited = new Set(walk);
		let current = start;
		for (;;) {
			const step = (nextOf.get(current) ?? []).find((path) => inside.has(path) && !visited.has(path));
			if (!step) break;
			walk.push(step);
			visited.add(step);
			current = step;
		}
		const name = (path: string) => notes.get(path)?.file.basename ?? path;
		const rest = members.filter((path) => !visited.has(path)).sort();
		const detail =
			[...walk, start].map(name).join(" → ") + (rest.length > 0 ? ` (+ ${rest.map(name).join(", ")})` : "");

		issues.push({ kind: "cycle", file: notes.get(start)!.file, detail });
	}

	/**
	 * Two periods in the same flow that run at the same time. Moments without
	 * `time-end` never collide, and touching ends are not an overlap.
	 */
	private checkOverlaps(issues: Issue[], notes: Map<string, Note>) {
		const lanes = new Map<string, Note[]>();
		for (const note of notes.values()) {
			if (!note.timeline || note.time === null || note.timeEnd === null) continue;
			const key = `${note.timeline}\n${note.flow}`;
			const lane = lanes.get(key);
			if (lane) lane.push(note);
			else lanes.set(key, [note]);
		}

		for (const lane of lanes.values()) {
			lane.sort((a, b) => a.time! - b.time! || a.file.path.localeCompare(b.file.path));
			for (let i = 0; i < lane.length; i++) {
				const a = lane[i];
				const end = Math.max(a.time!, a.timeEnd!);
				for (let j = i + 1; j < lane.length && lane[j].time! < end; j++) {
					issues.push({ kind: "overlap", file: a.file, detail: lane[j].file.basename });
				}
			}
		}
	}

	/** Every lore note that is not an archived version, keyed by path. */
	private collect(): Map<string, Note> {
		const notes = new Map<string, Note>();
		for (const file of loreFiles(this.app)) {
			const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
			if (!frontmatter || frontmatter["version-of"]) continue;
			notes.set(file.path, {
				file,
				frontmatter,
				type: asString(frontmatter.type).trim(),
				timeline: asString(frontmatter.timeline).trim(),
				flow: asString(frontmatter.flow).trim(),
				time: asNumberOrNull(frontmatter.time),
				timeEnd: asNumberOrNull(frontmatter["time-end"]),
			});
		}
		return notes;
	}

	private resolve(link: string, from: Note): TFile | null {
		return this.app.metadataCache.getFirstLinkpathDest(link, from.file.path);
	}

	/** Link fields this note may carry: the shared ones plus its type's own. */
	private linkFields(note: Note): string[] {
		const own = (this.types.byId(note.type)?.fields ?? [])
			.filter((field) => field.kind === "link" || field.kind === "links")
			.map((field) => field.name);
		return [...new Set([...STANDARD_LINK_FIELDS, ...own])].filter((field) => field !== "next" && field !== "prev");
	}

	private checkType(issues: Issue[], note: Note) {
		// A missing type is a plain note, not a mistake; a type nobody declared
		// means the banner and the dashboard cannot say what this is.
		if (note.type && note.type !== SYSTEM_TYPE && !this.types.byId(note.type)) {
			issues.push({ kind: "unknown-type", file: note.file, detail: note.type });
		}
	}

	private checkFieldLinks(issues: Issue[], note: Note) {
		const check = (field: string, value: unknown) => {
			for (const link of linkTargets(value)) {
				if (!this.resolve(link, note)) {
					issues.push({ kind: "broken-field-link", file: note.file, detail: `${field} → ${link}` });
				}
			}
		};
		for (const field of this.linkFields(note)) check(field, note.frontmatter[field]);
		for (const field of OPTIONAL_LINK_FIELDS) {
			const value = note.frontmatter[field];
			if (typeof value === "string" && value.trim().startsWith("[[")) check(field, value);
		}
	}

	private checkLaws(issues: Issue[], note: Note, notes: Map<string, Note>) {
		for (const field of ["laws", "breaks-law"] as const) {
			for (const link of linkTargets(note.frontmatter[field])) {
				const target = this.resolve(link, note);
				const law = target ? notes.get(target.path) : undefined;
				if (!target || !law) continue; // missing targets are already broken-field-link
				if (law.type !== "law") {
					issues.push({ kind: "law-not-law", file: note.file, detail: target.basename });
					continue;
				}
				// A law scoped to other realities cannot be broken in this one.
				if (field !== "breaks-law" || !note.timeline) continue;
				const scope = linkTargets(law.frontmatter["timeline-scope"]).map((entry) =>
					this.model.resolveTimelineId(entry, law.file.path),
				);
				if (scope.length > 0 && !scope.includes(note.timeline)) {
					issues.push({
						kind: "law-out-of-scope",
						file: note.file,
						detail: `${target.basename} (${scope.join(", ")})`,
					});
				}
			}
		}
	}

	private checkTimeline(issues: Issue[], note: Note, known: Set<string>) {
		// Notes can name a timeline before its note exists, which is a reasonable
		// order to work in — worth surfacing, not worth calling an error.
		if (known.size > 0 && !known.has(note.timeline)) {
			issues.push({ kind: "unknown-timeline", file: note.file, detail: note.timeline });
		}
	}

	private checkFlow(issues: Issue[], note: Note, flowsByTimeline: Map<string, Set<string>>) {
		if (!note.flow) return;
		const declared = flowsByTimeline.get(note.timeline);
		if (declared && declared.size > 0 && !declared.has(note.flow)) {
			issues.push({ kind: "unknown-flow", file: note.file, detail: note.flow });
		}
	}

	private checkTime(issues: Issue[], note: Note) {
		if (note.time === null) {
			issues.push({ kind: "no-time", file: note.file, detail: "" });
		}
	}

	private checkLinks(issues: Issue[], note: Note, notes: Map<string, Note>) {
		// A note that leads to itself is one finding, not a one-sided link plus
		// a backwards step plus a loop — and one finding even if both fields do it.
		let selfReported = false;
		const reportSelf = () => {
			if (selfReported) return;
			selfReported = true;
			issues.push({ kind: "self-link", file: note.file, detail: "" });
		};

		for (const link of linkTargets(note.frontmatter.next)) {
			const target = this.resolve(link, note);
			if (!target) {
				issues.push({ kind: "broken-link", file: note.file, detail: link });
				continue;
			}
			if (target.path === note.file.path) {
				reportSelf();
				continue;
			}

			const other = notes.get(target.path);

			// `next` and `prev` should mirror each other; a one-sided declaration
			// still draws on the timeline, but usually means one side was forgotten.
			if (!this.pointsBack(other, "prev", note)) {
				issues.push({ kind: "one-sided", file: note.file, detail: target.basename });
			}

			const targetTime = other?.time ?? null;
			if (note.time !== null && targetTime !== null && targetTime < note.time) {
				issues.push({ kind: "backwards", file: note.file, detail: target.basename });
			}
		}

		for (const link of linkTargets(note.frontmatter.prev)) {
			const target = this.resolve(link, note);
			if (!target) {
				issues.push({ kind: "broken-link", file: note.file, detail: link });
				continue;
			}
			if (target.path === note.file.path) {
				reportSelf();
				continue;
			}
			if (!this.pointsBack(notes.get(target.path), "next", note)) {
				issues.push({ kind: "one-sided", file: note.file, detail: target.basename });
			}
		}
	}

	/** True when `other` names `note` in the given field. */
	private pointsBack(other: Note | undefined, field: "next" | "prev", note: Note): boolean {
		if (!other) return false;
		return linkTargets(other.frontmatter[field]).some((back) => this.resolve(back, other)?.path === note.file.path);
	}
}
