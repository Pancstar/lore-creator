import { ItemView, WorkspaceLeaf, setIcon } from "obsidian";
import type LorePlugin from "../main";
import { TimelineModel } from "../timeline/model";
import { Law, collectLaws } from "../lawsModel";
import { addExampleBadge } from "../guide/badge";
import { applyLang } from "../i18n";

export const VIEW_TYPE_LAWS = "plc-laws";

const ALL_TIMELINES = "__all";

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
		applyLang(this.containerEl);
		this.contentEl.addClass("plc-list-view");
		this.render();
	}

	render() {
		const t = (key: string, ...args: string[]) => this.plugin.i18n.t(key, ...args);
		this.contentEl.empty();

		const all = collectLaws(this.app, this.model);
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
			addExampleBadge(headEl, this.app, law.file, this.plugin.i18n.t("guide.badge.example"));
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
