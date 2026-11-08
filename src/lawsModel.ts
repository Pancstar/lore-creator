import { App, TFile } from "obsidian";
import { linkTargets } from "./links";
import { TimelineModel } from "./timeline/model";
import { asString } from "./frontmatter";
import { loreFiles } from "./scope";

export interface Law {
	file: TFile;
	title: string;
	icon: string;
	scope: "universe" | "local";
	appliesTo: string[];
	/** Timeline ids; links to timeline notes are resolved to their id. */
	timelineScope: string[];
	/** Notes declaring they are subject to this law. */
	boundBy: TFile[];
	/** Notes declaring they break it — the reason the laws view is worth having. */
	brokenBy: TFile[];
}

/**
 * Walks every note once and inverts the `laws` and `breaks-law` fields, so a
 * law can show what obeys it and what defies it. Following those links by
 * hand across a growing vault is exactly what nobody manages to keep up.
 */
export function collectLaws(app: App, model: TimelineModel): Law[] {
	const laws = new Map<string, Law>();

	for (const file of loreFiles(app)) {
		const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
		if (frontmatter?.type !== "law") continue;
		if (frontmatter["version-of"]) continue;

		laws.set(file.path, {
			file,
			title: file.basename,
			icon: asString(frontmatter.icon) || "📜",
			scope: frontmatter.scope === "local" ? "local" : "universe",
			appliesTo: linkTargets(frontmatter["applies-to"]),
			timelineScope: linkTargets(frontmatter["timeline-scope"]).map((entry) =>
				model.resolveTimelineId(entry, file.path),
			),
			boundBy: [],
			brokenBy: [],
		});
	}

	for (const file of loreFiles(app)) {
		const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
		if (!frontmatter || frontmatter["version-of"]) continue;

		const attach = (field: string, bucket: "boundBy" | "brokenBy") => {
			// A note that names the same law twice is listed once under it.
			const seen = new Set<string>();
			for (const link of linkTargets(frontmatter[field])) {
				const target = app.metadataCache.getFirstLinkpathDest(link, file.path);
				const law = target ? laws.get(target.path) : undefined;
				if (!law || seen.has(law.file.path)) continue;
				seen.add(law.file.path);
				law[bucket].push(file);
			}
		};

		attach("laws", "boundBy");
		attach("breaks-law", "brokenBy");
	}

	return [...laws.values()].sort((a, b) => a.title.localeCompare(b.title));
}
