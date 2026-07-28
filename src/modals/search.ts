import { App, Modal, Setting, TFile } from "obsidian";
import type LorePlugin from "../main";
import { TimelineModel } from "../timeline/model";
import { asNumberOrNull, asString } from "../frontmatter";

const ANY = "__any";

interface Row {
	file: TFile;
	title: string;
	icon: string;
	type: string;
	status: string;
	timeline: string;
	flow: string;
	time: number | null;
	timeLabel: string;
}

/**
 * Searches the fields rather than the prose. Obsidian's own search already
 * covers the words; what it cannot answer is "every unfinished character in the
 * main universe", which is the question that comes up when picking up work.
 */
export class SearchModal extends Modal {
	private query = "";
	private typeFilter = ANY;
	private statusFilter = ANY;
	private timelineFilter = ANY;
	private flowFilter = ANY;
	private fromTime = "";
	private toTime = "";

	private resultsEl!: HTMLElement;
	private flowSelect: HTMLSelectElement | null = null;

	constructor(
		app: App,
		private plugin: LorePlugin,
	) {
		super(app);
	}

	onOpen() {
		const t = (key: string, ...args: string[]) => this.plugin.i18n.t(key, ...args);
		this.titleEl.setText(t("search.title"));
		this.contentEl.addClass("plc-search");

		const searchEl = this.contentEl.createEl("input", {
			type: "text",
			cls: "plc-search-input",
			attr: { placeholder: t("search.placeholder") },
		});
		searchEl.addEventListener("input", () => {
			this.query = searchEl.value;
			this.renderResults();
		});

		this.buildFilters();
		this.resultsEl = this.contentEl.createDiv({ cls: "plc-search-results" });
		this.renderResults();

		window.setTimeout(() => searchEl.focus(), 0);
	}

	private buildFilters() {
		const t = (key: string, ...args: string[]) => this.plugin.i18n.t(key, ...args);
		const model = new TimelineModel(this.app);

		new Setting(this.contentEl).setName(t("search.type")).addDropdown((dropdown) => {
			dropdown.addOption(ANY, t("search.any"));
			for (const type of this.plugin.types.creatable()) {
				dropdown.addOption(type.id, this.plugin.types.label(type, this.plugin.language));
			}
			dropdown.setValue(this.typeFilter).onChange((value) => {
				this.typeFilter = value;
				this.renderResults();
			});
		});

		new Setting(this.contentEl).setName(t("search.status")).addDropdown((dropdown) => {
			dropdown
				.addOption(ANY, t("search.any"))
				.addOption("draft", t("status.draft"))
				.addOption("partial", t("status.partial"))
				.addOption("done", t("status.done"))
				.setValue(this.statusFilter)
				.onChange((value) => {
					this.statusFilter = value;
					this.renderResults();
				});
		});

		const definitions = model.definitions();
		new Setting(this.contentEl).setName(t("search.timeline")).addDropdown((dropdown) => {
			dropdown.addOption(ANY, t("search.any"));
			for (const definition of definitions) dropdown.addOption(definition.id, definition.name);
			dropdown.setValue(this.timelineFilter).onChange((value) => {
				this.timelineFilter = value;
				this.flowFilter = ANY;
				this.refreshFlows(definitions);
				this.renderResults();
			});
		});

		new Setting(this.contentEl).setName(t("search.flow")).addDropdown((dropdown) => {
			this.flowSelect = dropdown.selectEl;
			dropdown.addOption(ANY, t("search.any"));
			dropdown.onChange((value) => {
				this.flowFilter = value;
				this.renderResults();
			});
		});
		this.refreshFlows(definitions);

		new Setting(this.contentEl)
			.setName(t("search.timeRange"))
			.setDesc(t("search.timeRange.desc"))
			.addText((text) =>
				text.setPlaceholder(t("search.from")).onChange((value) => {
					this.fromTime = value;
					this.renderResults();
				}),
			)
			.addText((text) =>
				text.setPlaceholder(t("search.to")).onChange((value) => {
					this.toTime = value;
					this.renderResults();
				}),
			);
	}

	/** Lanes depend on the selected timeline, so the list is rebuilt with it. */
	private refreshFlows(definitions: ReturnType<TimelineModel["definitions"]>) {
		const select = this.flowSelect;
		if (!select) return;

		const t = (key: string) => this.plugin.i18n.t(key);
		select.empty();
		select.createEl("option", { value: ANY, text: t("search.any") });

		const relevant =
			this.timelineFilter === ANY
				? definitions.flatMap((definition) => definition.flows)
				: (definitions.find((definition) => definition.id === this.timelineFilter)?.flows ?? []);

		const seen = new Set<string>();
		for (const flow of relevant) {
			if (seen.has(flow.id)) continue;
			seen.add(flow.id);
			select.createEl("option", { value: flow.id, text: flow.name });
		}
		select.value = this.flowFilter;
	}

	private collect(): Row[] {
		const rows: Row[] = [];

		for (const file of this.app.vault.getMarkdownFiles()) {
			const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
			if (!frontmatter || frontmatter["version-of"]) continue;

			const type = asString(frontmatter.type);
			if (!type || type === "system") continue;

			rows.push({
				file,
				title: file.basename,
				icon: asString(frontmatter.icon),
				type,
				status: asString(frontmatter.status) || "draft",
				timeline: asString(frontmatter.timeline).trim(),
				flow: asString(frontmatter.flow).trim(),
				time: asNumberOrNull(frontmatter.time),
				timeLabel: asString(frontmatter["time-label"]),
			});
		}
		return rows;
	}

	private matches(row: Row): boolean {
		const needle = this.query.trim().toLocaleLowerCase("tr");
		if (needle && !row.title.toLocaleLowerCase("tr").includes(needle)) return false;
		if (this.typeFilter !== ANY && row.type !== this.typeFilter) return false;
		if (this.statusFilter !== ANY && row.status !== this.statusFilter) return false;
		if (this.timelineFilter !== ANY && row.timeline !== this.timelineFilter) return false;
		if (this.flowFilter !== ANY && row.flow !== this.flowFilter) return false;

		const from = Number.parseFloat(this.fromTime);
		const to = Number.parseFloat(this.toTime);

		// A time bound only makes sense for notes that carry a time; untimed notes
		// drop out rather than being treated as year zero.
		if (Number.isFinite(from) && (row.time === null || row.time < from)) return false;
		if (Number.isFinite(to) && (row.time === null || row.time > to)) return false;

		return true;
	}

	private renderResults() {
		const t = (key: string, ...args: string[]) => this.plugin.i18n.t(key, ...args);
		this.resultsEl.empty();

		const rows = this.collect()
			.filter((row) => this.matches(row))
			.sort((a, b) => a.title.localeCompare(b.title));

		this.resultsEl.createDiv({
			cls: "plc-list-meta",
			text: t("search.count", String(rows.length)),
		});

		if (rows.length === 0) return;

		const listEl = this.resultsEl.createDiv({ cls: "plc-list" });
		for (const row of rows.slice(0, 200)) {
			const rowEl = listEl.createDiv({ cls: "plc-list-row" });
			const headEl = rowEl.createDiv({ cls: "plc-list-head" });

			if (row.icon) headEl.createSpan({ cls: "plc-list-icon", text: row.icon });
			headEl.createSpan({ cls: "plc-list-title", text: row.title });

			const type = this.plugin.types.byId(row.type);
			if (type) {
				headEl.createSpan({
					cls: "plc-badge plc-badge-type",
					text: this.plugin.types.label(type, this.plugin.language),
				});
			}
			headEl.createSpan({
				cls: `plc-badge plc-badge-status is-${row.status}`,
				text: t(`status.${row.status}`),
			});

			const context = [row.timeline, row.flow, row.timeLabel].filter((part) => part.length > 0);
			if (context.length > 0) {
				rowEl.createDiv({ cls: "plc-list-meta", text: context.join(" · ") });
			}

			headEl.addEventListener("click", () => {
				void this.app.workspace.getLeaf(false).openFile(row.file);
				this.close();
			});
		}

		if (rows.length > 200) {
			this.resultsEl.createDiv({
				cls: "plc-list-meta",
				text: t("search.more", String(rows.length - 200)),
			});
		}
	}

	onClose() {
		this.contentEl.empty();
	}
}
