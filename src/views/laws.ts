import { ItemView, TFile, WorkspaceLeaf, setIcon } from "obsidian";
import type LorePlugin from "../main";
import { linkTargets } from "../links";
import { TimelineModel } from "../timeline/model";
import { asString } from "../frontmatter";

export const VIEW_TYPE_LAWS = "plc-laws";

const ALL_TIMELINES = "__all";

interface Law {
	file: TFile;
	title: string;
	icon: string;
	scope: "universe" | "local";
	appliesTo: string[];
	timelineScope: string[];
	/** Notes declaring they are subject to this law. */
	boundBy: TFile[];
	/** Notes declaring they break it — the reason this view is worth having. */
	brokenBy: TFile[];
}

export class LawsView extends ItemView {
	private model: TimelineModel;
	private timelineFilter = ALL_TIMELINES;

	constructor(
		leaf: WorkspaceLeaf,
		private plugin: LorePlugin,
	) {
		super(leaf);
		this.model = new TimelineModel(this.app);
	}

	getViewType(): string {
		return VIEW_TYPE_LAWS;
	}

	getDisplayText(): string {
		return this.plugin.i18n.t("view.laws");
	}

	getIcon(): string {
		return "scroll";
	}

	async onOpen() {
		this.contentEl.addClass("plc-list-view");
		this.render();
	}

	/**
	 * Walks every note once and inverts the `laws` and `breaks-law` fields, so a
	 * law can show what obeys it and what defies it. Following those links by
	 * hand across a growing vault is exactly what nobody manages to keep up.
	 */
	private collect(): Law[] {
		const laws = new Map<string, Law>();

		for (const file of this.app.vault.getMarkdownFiles()) {
			const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
			if (frontmatter?.type !== "law") continue;
			if (frontmatter["version-of"]) continue;

			laws.set(file.path, {
				file,
				title: file.basename,
				icon: asString(frontmatter.icon) || "📜",
				scope: frontmatter.scope === "local" ? "local" : "universe",
				appliesTo: linkTargets(frontmatter["applies-to"]),
				timelineScope: linkTargets(frontmatter["timeline-scope"]),
				boundBy: [],
				brokenBy: [],
			});
		}

		for (const file of this.app.vault.getMarkdownFiles()) {
			const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
			if (!frontmatter || frontmatter["version-of"]) continue;

			const attach = (field: string, bucket: "boundBy" | "brokenBy") => {
				for (const link of linkTargets(frontmatter[field])) {
					const target = this.app.metadataCache.getFirstLinkpathDest(link, file.path);
					const law = target ? laws.get(target.path) : undefined;
					if (law) law[bucket].push(file);
				}
			};

			attach("laws", "boundBy");
			attach("breaks-law", "brokenBy");
		}

		return [...laws.values()].sort((a, b) => a.title.localeCompare(b.title));
	}

	render() {
		const t = (key: string, ...args: string[]) => this.plugin.i18n.t(key, ...args);
		this.contentEl.empty();

		const all = this.collect();
		if (all.length === 0) {
			this.renderEmpty(t("laws.empty.title"), t("laws.empty.body"));
			return;
		}

		this.renderFilter();

		// An empty `timeline-scope` means the law holds everywhere, which is the
		// common case and should not have to be spelled out on every note.
		const visible = all.filter(
			(law) =>
				this.timelineFilter === ALL_TIMELINES ||
				law.timelineScope.length === 0 ||
				law.timelineScope.includes(this.timelineFilter),
		);

		this.renderGroup(t("laws.universe"), visible.filter((law) => law.scope === "universe"));
		this.renderGroup(t("laws.local"), visible.filter((law) => law.scope === "local"));
	}

	private renderFilter() {
		const t = (key: string) => this.plugin.i18n.t(key);
		const ids = this.model.definitions().map((definition) => definition.id);
		if (ids.length === 0) return;

		const barEl = this.contentEl.createDiv({ cls: "plc-list-toolbar" });
		const select = barEl.createEl("select", { cls: "dropdown" });
		select.createEl("option", { value: ALL_TIMELINES, text: t("laws.allTimelines") });
		for (const id of ids) select.createEl("option", { value: id, text: id });

		select.value = this.timelineFilter;
		select.addEventListener("change", () => {
			this.timelineFilter = select.value;
			this.render();
		});
	}

	private renderGroup(title: string, laws: Law[]) {
		if (laws.length === 0) return;

		this.contentEl.createEl("h4", { cls: "plc-list-heading", text: title });
		const listEl = this.contentEl.createDiv({ cls: "plc-list" });

		for (const law of laws) {
			const rowEl = listEl.createDiv({ cls: "plc-list-row" });

			const headEl = rowEl.createDiv({ cls: "plc-list-head" });
			headEl.createSpan({ cls: "plc-list-icon", text: law.icon });
			headEl.createSpan({ cls: "plc-list-title", text: law.title });
			headEl.addEventListener("click", () => {
				void this.app.workspace.getLeaf(false).openFile(law.file);
			});

			this.renderMeta(rowEl, law);
		}
	}

	private renderMeta(rowEl: HTMLElement, law: Law) {
		const t = (key: string, ...args: string[]) => this.plugin.i18n.t(key, ...args);

		if (law.timelineScope.length > 0) {
			rowEl.createDiv({ cls: "plc-list-meta", text: t("laws.onlyIn", law.timelineScope.join(", ")) });
		}
		if (law.appliesTo.length > 0) {
			rowEl.createDiv({ cls: "plc-list-meta", text: t("laws.appliesTo", law.appliesTo.join(", ")) });
		}
		if (law.boundBy.length > 0) {
			rowEl.createDiv({
				cls: "plc-list-meta",
				text: t("laws.boundBy", law.boundBy.map((file) => file.basename).join(", ")),
			});
		}
		if (law.brokenBy.length > 0) {
			const brokenEl = rowEl.createDiv({ cls: "plc-list-meta plc-list-broken" });
			const iconEl = brokenEl.createSpan();
			setIcon(iconEl, "alert-triangle");
			brokenEl.createSpan({
				text: ` ${t("laws.brokenBy", law.brokenBy.map((file) => file.basename).join(", "))}`,
			});
		}
	}

	private renderEmpty(title: string, body: string) {
		const wrapper = this.contentEl.createDiv({ cls: "plc-list-empty" });
		wrapper.createEl("h4", { text: title });
		wrapper.createEl("p", { text: body });
	}
}
