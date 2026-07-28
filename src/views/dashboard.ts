import { ItemView, TFile, WorkspaceLeaf, setIcon } from "obsidian";
import type LorePlugin from "../main";
import { Audit, Issue, IssueKind } from "../audit";
import { asString } from "../frontmatter";

export const VIEW_TYPE_DASHBOARD = "plc-dashboard";

interface Unfinished {
	file: TFile;
	title: string;
	icon: string;
	type: string;
	status: "draft" | "partial";
}

/**
 * Where the author picks the thread back up. Fragments are written out of order
 * and left half-done on purpose, so "what did I leave open" is a question that
 * comes up constantly and the vault cannot answer on its own.
 */
export class DashboardView extends ItemView {
	private audit: Audit;
	private auditOpen = false;

	constructor(
		leaf: WorkspaceLeaf,
		private plugin: LorePlugin,
	) {
		super(leaf);
		this.audit = new Audit(this.app);
	}

	getViewType(): string {
		return VIEW_TYPE_DASHBOARD;
	}

	getDisplayText(): string {
		return this.plugin.i18n.t("view.dashboard");
	}

	getIcon(): string {
		return "layout-dashboard";
	}

	async onOpen() {
		this.contentEl.addClass("plc-list-view");
		this.render();
	}

	render() {
		this.contentEl.empty();
		this.renderSummary();
		this.renderUnfinished();
		this.renderAudit();
	}

	private loreNotes(): { file: TFile; frontmatter: Record<string, unknown> }[] {
		const notes: { file: TFile; frontmatter: Record<string, unknown> }[] = [];

		for (const file of this.app.vault.getMarkdownFiles()) {
			const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
			if (!frontmatter) continue;
			if (frontmatter["version-of"]) continue;

			const type = asString(frontmatter.type);
			if (!type || type === "system") continue;

			notes.push({ file, frontmatter });
		}
		return notes;
	}

	private renderSummary() {
		const t = (key: string, ...args: string[]) => this.plugin.i18n.t(key, ...args);
		const notes = this.loreNotes();

		if (notes.length === 0) {
			const wrapper = this.contentEl.createDiv({ cls: "plc-list-empty" });
			wrapper.createEl("h4", { text: t("dashboard.empty.title") });
			wrapper.createEl("p", { text: t("dashboard.empty.body") });
			return;
		}

		const counts = new Map<string, number>();
		for (const note of notes) {
			const type = asString(note.frontmatter.type);
			counts.set(type, (counts.get(type) ?? 0) + 1);
		}

		this.contentEl.createEl("h4", { cls: "plc-list-heading", text: t("dashboard.summary") });
		const gridEl = this.contentEl.createDiv({ cls: "plc-stat-grid" });

		for (const [typeId, count] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
			const type = this.plugin.types.byId(typeId);
			const cellEl = gridEl.createDiv({ cls: "plc-stat" });
			cellEl.createDiv({ cls: "plc-stat-value", text: String(count) });
			cellEl.createDiv({
				cls: "plc-stat-label",
				text: type ? this.plugin.types.label(type, this.plugin.language) : typeId,
			});
		}
	}

	private renderUnfinished() {
		const t = (key: string, ...args: string[]) => this.plugin.i18n.t(key, ...args);

		const unfinished: Unfinished[] = this.loreNotes()
			.filter((note) => note.frontmatter.status === "partial" || note.frontmatter.status === "draft")
			.map((note) => ({
				file: note.file,
				title: note.file.basename,
				icon: asString(note.frontmatter.icon),
				type: asString(note.frontmatter.type),
				status: note.frontmatter.status === "partial" ? "partial" : "draft",
			}));

		if (unfinished.length === 0) return;

		// Half-written comes before untouched: those are the threads with momentum.
		unfinished.sort((a, b) => {
			if (a.status !== b.status) return a.status === "partial" ? -1 : 1;
			return a.title.localeCompare(b.title);
		});

		this.contentEl.createEl("h4", {
			cls: "plc-list-heading",
			text: t("dashboard.unfinished", String(unfinished.length)),
		});

		const listEl = this.contentEl.createDiv({ cls: "plc-list" });
		for (const entry of unfinished) {
			const rowEl = listEl.createDiv({ cls: "plc-list-row" });
			const headEl = rowEl.createDiv({ cls: "plc-list-head" });

			if (entry.icon) headEl.createSpan({ cls: "plc-list-icon", text: entry.icon });
			headEl.createSpan({ cls: "plc-list-title", text: entry.title });
			headEl.createSpan({
				cls: `plc-badge plc-badge-status is-${entry.status}`,
				text: t(`status.${entry.status}`),
			});

			headEl.addEventListener("click", () => {
				void this.app.workspace.getLeaf(false).openFile(entry.file);
			});
		}
	}

	private renderAudit() {
		const t = (key: string, ...args: string[]) => this.plugin.i18n.t(key, ...args);
		const issues = this.audit.run();

		const headingEl = this.contentEl.createEl("h4", { cls: "plc-list-heading plc-collapsible" });
		const caretEl = headingEl.createSpan({ cls: "plc-caret" });
		setIcon(caretEl, this.auditOpen ? "chevron-down" : "chevron-right");
		headingEl.createSpan({ text: t("dashboard.audit", String(issues.length)) });

		headingEl.addEventListener("click", () => {
			this.auditOpen = !this.auditOpen;
			this.render();
		});

		if (!this.auditOpen) return;

		this.contentEl.createEl("p", { cls: "plc-list-meta", text: t("dashboard.audit.desc") });

		if (issues.length === 0) {
			this.contentEl.createEl("p", { cls: "plc-list-meta", text: t("dashboard.audit.clean") });
			return;
		}

		const grouped = new Map<IssueKind, Issue[]>();
		for (const issue of issues) {
			const bucket = grouped.get(issue.kind);
			if (bucket) {
				bucket.push(issue);
			} else {
				grouped.set(issue.kind, [issue]);
			}
		}

		for (const [kind, group] of grouped) {
			this.contentEl.createDiv({
				cls: "plc-list-meta plc-audit-kind",
				text: t(`audit.${kind}`),
			});

			const listEl = this.contentEl.createDiv({ cls: "plc-list" });
			for (const issue of group) {
				const rowEl = listEl.createDiv({ cls: "plc-list-row plc-audit-row" });
				const headEl = rowEl.createDiv({ cls: "plc-list-head" });
				headEl.createSpan({ cls: "plc-list-title", text: issue.file.basename });
				if (issue.detail) {
					headEl.createSpan({ cls: "plc-list-meta", text: issue.detail });
				}
				headEl.addEventListener("click", () => {
					void this.app.workspace.getLeaf(false).openFile(issue.file);
				});
			}
		}
	}
}
