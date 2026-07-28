import { App, Modal, Notice, Setting, setIcon } from "obsidian";
import type LorePlugin from "../main";
import { VersionSet } from "../versions/sets";
import { ConfirmModal } from "./confirm";

/**
 * Manages named snapshots of which version of each note is active, so a whole
 * revision of the story can be stepped into and out of in one move.
 */
export class VersionSetsModal extends Modal {
	constructor(
		app: App,
		private plugin: LorePlugin,
	) {
		super(app);
	}

	onOpen() {
		this.titleEl.setText(this.plugin.i18n.t("sets.title"));
		this.contentEl.addClass("plc-versions");
		this.renderBody();
	}

	private renderBody() {
		const t = (key: string, ...args: string[]) => this.plugin.i18n.t(key, ...args);
		this.contentEl.empty();

		const versioned = this.plugin.versionSets.versionedNotes();
		this.contentEl.createEl("p", {
			text: t("sets.subtitle", String(versioned.length)),
			cls: "setting-item-description",
		});

		const sets = this.plugin.versionSets.list();
		if (sets.length === 0) {
			this.contentEl.createEl("p", { text: t("sets.empty"), cls: "plc-version-note" });
		} else {
			const listEl = this.contentEl.createDiv({ cls: "plc-version-list" });
			for (const set of sets) this.renderSet(listEl, set);
		}

		let name = "";
		new Setting(this.contentEl)
			.setName(t("sets.capture"))
			.setDesc(t("sets.capture.desc"))
			.addText((text) =>
				text.setPlaceholder(t("sets.capturePlaceholder")).onChange((value) => {
					name = value;
				}),
			)
			.addButton((button) =>
				button
					.setButtonText(t("sets.captureButton"))
					.setCta()
					.onClick(() => void this.runCapture(name, versioned.length)),
			);
	}

	private renderSet(parent: HTMLElement, set: VersionSet) {
		const t = (key: string, ...args: string[]) => this.plugin.i18n.t(key, ...args);
		const plan = this.plugin.versionSets.plan(set);

		const rowEl = parent.createDiv({ cls: "plc-version-row" });
		const textEl = rowEl.createDiv({ cls: "plc-version-text" });
		textEl.createEl("div", { cls: "plc-version-label", text: set.name });

		const summary =
			plan.changes.length === 0
				? t("sets.alreadyActive")
				: t("sets.wouldChange", String(plan.changes.length));
		textEl.createEl("div", { cls: "plc-version-note", text: summary });

		if (plan.missing.length > 0) {
			textEl.createEl("div", {
				cls: "plc-version-note plc-warning",
				text: t("sets.missing", plan.missing.join(", ")),
			});
		}

		const actionsEl = rowEl.createDiv({ cls: "plc-version-actions" });

		if (plan.changes.length > 0) {
			const applyButton = actionsEl.createEl("button", {
				cls: "clickable-icon",
				attr: { "aria-label": t("sets.apply"), title: t("sets.apply") },
			});
			setIcon(applyButton, "play");
			applyButton.addEventListener("click", () => this.confirmApply(set));
		}

		const deleteButton = actionsEl.createEl("button", {
			cls: "clickable-icon",
			attr: { "aria-label": t("sets.delete"), title: t("sets.delete") },
		});
		setIcon(deleteButton, "trash-2");
		deleteButton.addEventListener("click", () => this.confirmDelete(set));
	}

	private async runCapture(name: string, count: number) {
		const t = (key: string, ...args: string[]) => this.plugin.i18n.t(key, ...args);

		if (!name.trim()) {
			new Notice(t("sets.nameRequired"));
			return;
		}
		if (count === 0) {
			new Notice(t("sets.nothingToCapture"));
			return;
		}

		try {
			await this.plugin.versionSets.capture(name);
			new Notice(t("sets.captured", name));
			this.renderBody();
		} catch (error) {
			console.error("Lore Creator: could not capture version set", error);
			new Notice(t("version.error.generic"));
		}
	}

	private confirmApply(set: VersionSet) {
		const t = (key: string, ...args: string[]) => this.plugin.i18n.t(key, ...args);
		const plan = this.plugin.versionSets.plan(set);

		// Applying a set moves several files at once, so the dialog spells out
		// every note it will touch rather than just counting them.
		const details = plan.changes.map((change) =>
			t("sets.detail.change", change.active.basename, `v${change.from}`, `v${change.to}`),
		);
		if (plan.unchanged > 0) details.push(t("sets.detail.unchanged", String(plan.unchanged)));
		if (plan.missing.length > 0) details.push(t("sets.detail.skipped", plan.missing.join(", ")));

		new ConfirmModal(
			this.app,
			{
				title: t("sets.apply"),
				body: t("sets.apply.body", set.name, String(plan.changes.length)),
				details,
				confirmLabel: t("sets.apply"),
				cancelLabel: t("common.cancel"),
			},
			() => void this.runApply(set),
		).open();
	}

	private async runApply(set: VersionSet) {
		const t = (key: string, ...args: string[]) => this.plugin.i18n.t(key, ...args);
		const plan = this.plugin.versionSets.plan(set);
		const result = await this.plugin.versionSets.apply(plan);

		if (result.failed) {
			console.error("Lore Creator: applying set stopped early", result.error);
			new Notice(
				t("sets.partial", String(result.applied), result.failed.active.basename),
				8000,
			);
		} else {
			new Notice(t("sets.applied", String(result.applied)));
		}
		this.renderBody();
	}

	private confirmDelete(set: VersionSet) {
		const t = (key: string, ...args: string[]) => this.plugin.i18n.t(key, ...args);

		new ConfirmModal(
			this.app,
			{
				title: t("sets.delete"),
				body: t("sets.delete.body", set.name),
				details: [t("sets.delete.detail")],
				confirmLabel: t("sets.delete"),
				cancelLabel: t("common.cancel"),
				destructive: true,
			},
			() => void this.runDelete(set),
		).open();
	}

	private async runDelete(set: VersionSet) {
		const t = (key: string, ...args: string[]) => this.plugin.i18n.t(key, ...args);
		try {
			await this.plugin.versionSets.remove(set.id);
			new Notice(t("sets.deleted"));
			this.renderBody();
		} catch (error) {
			console.error("Lore Creator: could not delete version set", error);
			new Notice(t("version.error.generic"));
		}
	}

	onClose() {
		this.contentEl.empty();
	}
}
