import { ItemView, TFile, WorkspaceLeaf, setIcon } from "obsidian";
import type LorePlugin from "../main";
import { linkTarget } from "../links";
import { PromoteModal } from "../modals/promote";

export const VIEW_TYPE_DRAFTS = "plc-drafts";

interface Draft {
	file: TFile;
	title: string;
	icon: string;
	ideaFor: string;
	promotedTo: string;
}

function asString(value: unknown): string {
	return typeof value === "string" ? value : "";
}

/**
 * The shelf of unused ideas. Kept separate from the canon so it can be opened
 * beside whatever is being written without cluttering the timeline.
 */
export class DraftsView extends ItemView {
	constructor(
		leaf: WorkspaceLeaf,
		private plugin: LorePlugin,
	) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_DRAFTS;
	}

	getDisplayText(): string {
		return this.plugin.i18n.t("view.drafts");
	}

	getIcon(): string {
		return "lightbulb";
	}

	async onOpen() {
		this.contentEl.addClass("plc-list-view");
		this.render();
	}

	private collect(): Draft[] {
		const drafts: Draft[] = [];

		for (const file of this.app.vault.getMarkdownFiles()) {
			const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
			if (frontmatter?.type !== "draft") continue;
			if (frontmatter["version-of"]) continue;

			drafts.push({
				file,
				title: file.basename,
				icon: asString(frontmatter.icon) || "💭",
				ideaFor: asString(frontmatter["idea-for"]).trim(),
				promotedTo: linkTarget(frontmatter["promoted-to"]),
			});
		}

		return drafts.sort((a, b) => a.title.localeCompare(b.title));
	}

	render() {
		const t = (key: string, ...args: string[]) => this.plugin.i18n.t(key, ...args);
		this.contentEl.empty();

		const drafts = this.collect();
		if (drafts.length === 0) {
			const wrapper = this.contentEl.createDiv({ cls: "plc-list-empty" });
			wrapper.createEl("h4", { text: t("drafts.empty.title") });
			wrapper.createEl("p", { text: t("drafts.empty.body") });
			return;
		}

		const groups = new Map<string, Draft[]>();
		for (const draft of drafts) {
			const key = draft.ideaFor || t("drafts.unassigned");
			const bucket = groups.get(key);
			if (bucket) {
				bucket.push(draft);
			} else {
				groups.set(key, [draft]);
			}
		}

		for (const [group, members] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
			this.contentEl.createEl("h4", { cls: "plc-list-heading", text: group });
			const listEl = this.contentEl.createDiv({ cls: "plc-list" });
			for (const draft of members) this.renderDraft(listEl, draft);
		}
	}

	private renderDraft(parent: HTMLElement, draft: Draft) {
		const t = (key: string, ...args: string[]) => this.plugin.i18n.t(key, ...args);
		const rowEl = parent.createDiv({
			cls: `plc-list-row${draft.promotedTo ? " is-promoted" : ""}`,
		});

		const headEl = rowEl.createDiv({ cls: "plc-list-head" });
		headEl.createSpan({ cls: "plc-list-icon", text: draft.icon });
		headEl.createSpan({ cls: "plc-list-title", text: draft.title });
		headEl.addEventListener("click", () => {
			void this.app.workspace.getLeaf(false).openFile(draft.file);
		});

		if (draft.promotedTo) {
			rowEl.createDiv({ cls: "plc-list-meta", text: t("drafts.promotedTo", draft.promotedTo) });
		}

		const actionsEl = rowEl.createDiv({ cls: "plc-list-actions" });

		// Opening beside the note being written is the whole point of this shelf:
		// the idea is there to draw on without losing your place.
		this.addRowButton(actionsEl, "separator-vertical", t("drafts.openSplit"), () => {
			void this.app.workspace.getLeaf("split").openFile(draft.file);
		});
		this.addRowButton(actionsEl, "external-link", t("drafts.openTab"), () => {
			void this.app.workspace.getLeaf("tab").openFile(draft.file);
		});
		this.addRowButton(actionsEl, "arrow-up-circle", t("drafts.promote"), () => {
			new PromoteModal(this.app, this.plugin, draft.file).open();
		});
	}

	private addRowButton(parent: HTMLElement, icon: string, label: string, onClick: () => void) {
		const button = parent.createEl("button", {
			cls: "clickable-icon",
			attr: { "aria-label": label, title: label },
		});
		setIcon(button, icon);
		button.addEventListener("click", onClick);
	}
}
