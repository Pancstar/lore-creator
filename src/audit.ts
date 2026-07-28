import { App, TFile } from "obsidian";
import { linkTargets } from "./links";
import { TimelineModel } from "./timeline/model";
import { asNumberOrNull, asString } from "./frontmatter";

export type IssueKind =
	| "broken-link"
	| "one-sided"
	| "backwards"
	| "no-time"
	| "unknown-timeline"
	| "unknown-flow";

export interface Issue {
	kind: IssueKind;
	file: TFile;
	/** Filled in when the issue concerns a second note or a named target. */
	detail: string;
}

/**
 * Mechanical checks over the vault's own declarations. Everything here is
 * advisory: nothing is corrected, nothing is blocked, and a finding is often
 * just work in progress rather than a mistake — half-written is a normal state
 * in this vault, so the report is a prompt to look, never a demand to fix.
 */
export class Audit {
	private model: TimelineModel;

	constructor(private app: App) {
		this.model = new TimelineModel(this.app);
	}

	run(): Issue[] {
		const issues: Issue[] = [];
		const definitions = this.model.definitions();
		const timelineIds = new Set(definitions.map((definition) => definition.id));
		const flowsByTimeline = new Map(
			definitions.map((definition) => [
				definition.id,
				new Set(definition.flows.map((flow) => flow.id)),
			]),
		);

		for (const file of this.app.vault.getMarkdownFiles()) {
			const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
			if (!frontmatter) continue;
			if (frontmatter["version-of"]) continue;

			const timeline = asString(frontmatter.timeline).trim();
			if (!timeline) continue;

			this.checkTimeline(issues, file, timeline, timelineIds);
			this.checkFlow(issues, file, frontmatter, timeline, flowsByTimeline);
			this.checkTime(issues, file, frontmatter);
			this.checkLinks(issues, file, frontmatter);
		}

		return issues;
	}

	private checkTimeline(issues: Issue[], file: TFile, timeline: string, known: Set<string>) {
		// Notes can name a timeline before its note exists, which is a reasonable
		// order to work in — worth surfacing, not worth calling an error.
		if (known.size > 0 && !known.has(timeline)) {
			issues.push({ kind: "unknown-timeline", file, detail: timeline });
		}
	}

	private checkFlow(
		issues: Issue[],
		file: TFile,
		frontmatter: Record<string, unknown>,
		timeline: string,
		flowsByTimeline: Map<string, Set<string>>,
	) {
		const flow = asString(frontmatter.flow).trim();
		if (!flow) return;

		const declared = flowsByTimeline.get(timeline);
		if (declared && declared.size > 0 && !declared.has(flow)) {
			issues.push({ kind: "unknown-flow", file, detail: flow });
		}
	}

	private checkTime(issues: Issue[], file: TFile, frontmatter: Record<string, unknown>) {
		if (asNumberOrNull(frontmatter.time) === null) {
			issues.push({ kind: "no-time", file, detail: "" });
		}
	}

	private checkLinks(issues: Issue[], file: TFile, frontmatter: Record<string, unknown>) {
		const time = asNumberOrNull(frontmatter.time);

		for (const link of linkTargets(frontmatter.next)) {
			const target = this.app.metadataCache.getFirstLinkpathDest(link, file.path);
			if (!target) {
				issues.push({ kind: "broken-link", file, detail: link });
				continue;
			}

			const targetFrontmatter = this.app.metadataCache.getFileCache(target)?.frontmatter;

			// `next` and `prev` should mirror each other; a one-sided declaration
			// still draws on the timeline, but usually means one side was forgotten.
			const mirrored = linkTargets(targetFrontmatter?.prev).some(
				(back) => this.app.metadataCache.getFirstLinkpathDest(back, target.path)?.path === file.path,
			);
			if (!mirrored) {
				issues.push({ kind: "one-sided", file, detail: target.basename });
			}

			const targetTime = asNumberOrNull(targetFrontmatter?.time);
			if (time !== null && targetTime !== null && targetTime < time) {
				issues.push({ kind: "backwards", file, detail: target.basename });
			}
		}

		for (const link of linkTargets(frontmatter.prev)) {
			if (!this.app.metadataCache.getFirstLinkpathDest(link, file.path)) {
				issues.push({ kind: "broken-link", file, detail: link });
			}
		}
	}
}
