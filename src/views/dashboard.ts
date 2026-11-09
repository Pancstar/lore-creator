import { ItemView, TFile, WorkspaceLeaf, setIcon } from "obsidian";
import type LorePlugin from "../main";
import { Audit, ISSUE_KINDS, Issue, IssueKind } from "../audit";
import { asString } from "../frontmatter";
import { asStatus } from "../timeline/model";
import { isUnfinished } from "../status";
import { loreFiles } from "../scope";
import { addExampleBadge } from "../guide/badge";
import { applyLang } from "../i18n";

export const VIEW_TYPE_DASHBOARD = "plc-dashboard";

interface LoreNote {
	file: TFile;
	frontmatter: Record<string, unknown>;
}

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
		this.audit = new Audit(
			this.app,
			this.plugin.types,
			() => this.plugin.settings.versionSetsFile,
			() => this.plugin.linksResolved,
		);
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
		applyLang(this.containerEl);
		this.contentEl.addClass("plc-list-view");
		this.render();
	}

	render() {
		// Redraws follow autosave, so keep the reader where they were.
		const scrollTop = this.contentEl.scrollTop;
		this.contentEl.empty();
		const notes = this.loreNotes();
		this.renderSummary(notes);
		this.renderUnfinished(notes);
		this.renderAudit();
		this.contentEl.scrollTop = scrollTop;
	}

	private loreNotes(): LoreNote[] {
		const notes: LoreNote[] = [];

		for (const file of loreFiles(this.app)) {
			const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
			if (!frontmatter) continue;
			if (frontmatter["version-of"]) continue;

			const type = asString(frontmatter.type);
			if (!type || type === "system") continue;

			notes.push({ file, frontmatter });
		}
		return notes;
	}

	private renderSummary(notes: LoreNote[]) {
		const t = (key: string, ...args: string[]) => this.plugin.i18n.t(key, ...args);

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

	private renderUnfinished(notes: LoreNote[]) {
		const t = (key: string, ...args: string[]) => this.plugin.i18n.t(key, ...args);

		// A note with no status is a draft, here as in the banner and the timeline;
		// timeline definitions are structure, not story, and never "unfinished".
		const unfinished: Unfinished[] = notes
			.filter((note) => isUnfinished(note.frontmatter))
			.map((note) => ({
				file: note.file,
				title: note.file.basename,
				icon: asString(note.frontmatter.icon),
				type: asString(note.frontmatter.type),
				status: asStatus(note.frontmatter.status) === "partial" ? "partial" : "draft",
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
			addExampleBadge(headEl, this.app, entry.file, this.plugin.i18n.t("guide.badge.example"));
			headEl.createSpan({
				cls: `plc-badge plc-badge-status is-${entry.status}`,
				text: t(`status.${entry.status}`),
			});

			headEl.addEventListener("click", () => {
				void this.app.workspace.getLeaf(false).openFile(entry.file);
			});
		}
	}

	/** True while the open report waits for Obsidian to finish indexing links. */
	get waitingForIndex(): boolean {
		return this.auditOpen && this.audit.indexing;
	}

	private renderAudit() {
		const t = (key: string, ...args: string[]) => this.plugin.i18n.t(key, ...args);
		// The audit is a full vault pass; while collapsed nobody reads it, so it
		// is skipped and the heading goes without a count.
		const hidden = new Set(ISSUE_KINDS.filter((kind) => this.plugin.settings.auditHidden.includes(kind)));
		// Kinds the author switched off leave the count too, so the heading says
		// how much is left to look at, not how much was found.
		const issues = this.auditOpen ? this.audit.run().filter((issue) => !hidden.has(issue.kind)) : null;

		const headingEl = this.contentEl.createEl("h4", { cls: "plc-list-heading plc-collapsible" });
		const caretEl = headingEl.createSpan({ cls: "plc-caret" });
		setIcon(caretEl, this.auditOpen ? "chevron-down" : "chevron-right");
		headingEl.createSpan({
			text: issues ? t("dashboard.audit", String(issues.length)) : t("dashboard.audit.closed"),
		});
		if (issues && hidden.size > 0) {
			headingEl.createSpan({ cls: "plc-list-meta", text: t("dashboard.audit.hidden", String(hidden.size)) });
		}

		headingEl.addEventListener("click", () => {
			this.auditOpen = !this.auditOpen;
			this.render();
		});

		if (!issues) return;

		this.contentEl.createEl("p", { cls: "plc-list-meta", text: t("dashboard.audit.desc") });
		if (this.audit.indexing) {
			this.contentEl.createEl("p", { cls: "plc-list-meta", text: t("dashboard.audit.indexing") });
		}
		this.renderAuditChips(hidden);

		if (issues.length === 0) {
			// While orphans are still unchecked, "nothing" would claim too much.
			const clean = this.audit.indexing ? "dashboard.audit.cleanSoFar" : "dashboard.audit.clean";
			this.contentEl.createEl("p", { cls: "plc-list-meta", text: t(clean) });
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

		for (const kind of ISSUE_KINDS) {
			const group = grouped.get(kind);
			if (!group) continue;
			this.contentEl.createDiv({
				cls: "plc-list-meta plc-audit-kind",
				text: t(`audit.${kind}`),
			});

			const listEl = this.contentEl.createDiv({ cls: "plc-list" });
			for (const issue of group) {
				const rowEl = listEl.createDiv({ cls: "plc-list-row plc-audit-row" });
				const headEl = rowEl.createDiv({ cls: "plc-list-head" });
				headEl.createSpan({ cls: "plc-list-title", text: issue.file.basename });
				addExampleBadge(headEl, this.app, issue.file, this.plugin.i18n.t("guide.badge.example"));
				if (issue.detail) {
					headEl.createSpan({ cls: "plc-list-meta", text: issue.detail });
				}
				headEl.addEventListener("click", () => {
					void this.app.workspace.getLeaf(false).openFile(issue.file);
				});
			}
		}
	}

	/** One toggle per kind; a switched-off kind stays visible so it can come back. */
	private renderAuditChips(hidden: Set<string>) {
		const chipsEl = this.contentEl.createDiv({ cls: "plc-audit-chips" });
		for (const kind of ISSUE_KINDS) {
			const chip = chipsEl.createEl("button", {
				cls: `plc-chip${hidden.has(kind) ? " is-off" : ""}`,
				text: this.plugin.i18n.t(`audit.chip.${kind}`),
				attr: {
					title: this.plugin.i18n.t(`audit.${kind}`),
					"aria-pressed": String(!hidden.has(kind)),
					"data-kind": kind,
				},
			});
			chip.addEventListener("click", () => void this.toggleAuditKind(kind));
		}
	}

	private async toggleAuditKind(kind: IssueKind) {
		const current = this.plugin.settings.auditHidden;
		this.plugin.settings.auditHidden = current.includes(kind)
			? current.filter((entry) => entry !== kind)
			: [...current, kind];
		// Only this list changes, so only this view redraws: `saveSettings`
		// would drop every cache and repaint every view for a filter click.
		await this.plugin.saveData(this.plugin.settings);
		this.render();
		// The redraw replaced the chip; give keyboard focus back to its successor.
		this.contentEl.querySelector<HTMLElement>(`.plc-chip[data-kind="${kind}"]`)?.focus();
	}
}
