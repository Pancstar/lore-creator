import { App, Modal, Notice, Setting, TFile, setIcon } from "obsidian";
import type LorePlugin from "../main";
import { VersionEntry, VersionError } from "../versions/store";
import { ConfirmModal } from "./confirm";

/**
 * Lists a note's versions and performs the file moves behind them. Every action
 * that touches disk goes through a confirmation naming the exact paths.
 */
export class VersionMenuModal extends Modal {
	private active: TFile;

	constructor(
		app: App,
		private plugin: LorePlugin,
		file: TFile,
	) {
		super(app);
		this.active = this.plugin.versions.activeFileFor(file) ?? file;
	}

	onOpen() {
		this.titleEl.setText(this.plugin.i18n.t("version.title"));
		this.contentEl.addClass("plc-versions");
		this.renderBody();
	}

	private renderBody() {
		const t = (key: string, ...args: string[]) => this.plugin.i18n.t(key, ...args);
		this.contentEl.empty();

		this.contentEl.createEl("p", {
			text: t("version.subtitle", this.active.basename),
			cls: "setting-item-description",
		});

		const entries = this.plugin.versions.list(this.active);
		const listEl = this.contentEl.createDiv({ cls: "plc-version-list" });

		for (const entry of entries) {
			this.renderEntry(listEl, entry, entries.length);
		}

		new Setting(this.contentEl).addButton((button) =>
			button
				.setButtonText(t("version.create"))
				.setCta()
				.onClick(() => this.confirmCreate()),
		);
	}

	private renderEntry(parent: HTMLElement, entry: VersionEntry, total: number) {
		const t = (key: string, ...args: string[]) => this.plugin.i18n.t(key, ...args);

		const rowEl = parent.createDiv({ cls: `plc-version-row${entry.active ? " is-active" : ""}` });

		const markEl = rowEl.createDiv({ cls: "plc-version-mark" });
		if (entry.active) setIcon(markEl, "check");

		const textEl = rowEl.createDiv({ cls: "plc-version-text" });
		textEl.createDiv({
			cls: "plc-version-label",
			text: this.plugin.versions.label(entry),
		});
		if (entry.note) {
			textEl.createDiv({ cls: "plc-version-note", text: entry.note });
		}
		if (entry.active) {
			textEl.createDiv({ cls: "plc-version-badge", text: t("version.activeLabel") });
		}

		const actionsEl = rowEl.createDiv({ cls: "plc-version-actions" });

		if (!entry.active) {
			const switchButton = actionsEl.createEl("button", {
				cls: "clickable-icon",
				attr: { "aria-label": t("version.switch"), title: t("version.switch") },
			});
			setIcon(switchButton, "arrow-left-right");
			switchButton.addEventListener("click", () => this.confirmSwitch(entry));

			const openButton = actionsEl.createEl("button", {
				cls: "clickable-icon",
				attr: { "aria-label": t("version.open"), title: t("version.open") },
			});
			setIcon(openButton, "external-link");
			openButton.addEventListener("click", () => {
				void this.app.workspace.getLeaf("tab").openFile(entry.file);
				this.close();
			});

			// The last remaining copy of a fragment should not be one click from
			// the bin, so deletion only appears once an alternative exists.
			if (total > 1) {
				const deleteButton = actionsEl.createEl("button", {
					cls: "clickable-icon",
					attr: { "aria-label": t("version.delete"), title: t("version.delete") },
				});
				setIcon(deleteButton, "trash-2");
				deleteButton.addEventListener("click", () => this.confirmDelete(entry));
			}
		}
	}

	private confirmCreate() {
		const t = (key: string, ...args: string[]) => this.plugin.i18n.t(key, ...args);
		const preview = this.plugin.versions.previewCreate(this.active);

		new NewVersionModal(this.app, this.plugin, (name, note) => {
			new ConfirmModal(
				this.app,
				{
					title: t("version.create"),
					body: t("version.create.body", String(preview.nextNumber)),
					details: [
						t("version.detail.archive", this.active.path, preview.archivePath),
						t("version.detail.becomes", this.active.path, `v${preview.nextNumber}`),
					],
					confirmLabel: t("version.create"),
					cancelLabel: t("common.cancel"),
				},
				() => void this.runCreate(name, note),
			).open();
		}).open();
	}

	private async runCreate(name: string, note: string) {
		const t = (key: string, ...args: string[]) => this.plugin.i18n.t(key, ...args);
		try {
			await this.plugin.versions.createVersion(this.active, name, note);
			new Notice(t("version.created"));
			this.renderBody();
		} catch (error) {
			this.reportFailure(error);
		}
	}

	private confirmSwitch(entry: VersionEntry) {
		const t = (key: string, ...args: string[]) => this.plugin.i18n.t(key, ...args);
		const preview = this.plugin.versions.previewSwitch(this.active, entry.file);
		const current = this.plugin.versions.info(this.active);

		new ConfirmModal(
			this.app,
			{
				title: t("version.switch"),
				body: t("version.switch.body", `v${current.number}`, `v${entry.number}`),
				details: [
					t("version.detail.archive", this.active.path, preview.archivePath),
					t("version.detail.restore", entry.file.path, this.active.path),
				],
				confirmLabel: t("version.switch"),
				cancelLabel: t("common.cancel"),
			},
			() => void this.runSwitch(entry),
		).open();
	}

	private async runSwitch(entry: VersionEntry) {
		const t = (key: string, ...args: string[]) => this.plugin.i18n.t(key, ...args);
		try {
			await this.plugin.versions.switchTo(this.active, entry.file);
			new Notice(t("version.switched", `v${entry.number}`));
			this.renderBody();
		} catch (error) {
			this.reportFailure(error);
		}
	}

	private confirmDelete(entry: VersionEntry) {
		const t = (key: string, ...args: string[]) => this.plugin.i18n.t(key, ...args);

		new ConfirmModal(
			this.app,
			{
				title: t("version.delete"),
				body: t("version.delete.body", this.plugin.versions.label(entry)),
				details: [t("version.detail.trash", entry.file.path)],
				confirmLabel: t("version.delete"),
				cancelLabel: t("common.cancel"),
				destructive: true,
			},
			() => void this.runDelete(entry),
		).open();
	}

	private async runDelete(entry: VersionEntry) {
		const t = (key: string, ...args: string[]) => this.plugin.i18n.t(key, ...args);
		try {
			await this.plugin.versions.deleteVersion(entry.file);
			new Notice(t("version.deleted"));
			this.renderBody();
		} catch (error) {
			this.reportFailure(error);
		}
	}

	private reportFailure(error: unknown) {
		const t = (key: string, ...args: string[]) => this.plugin.i18n.t(key, ...args);
		console.error("Lore Creator: version operation failed", error);

		if (error instanceof VersionError) {
			new Notice(t("version.error.exists", error.message));
			return;
		}
		new Notice(t("version.error.generic"));
	}

	onClose() {
		this.contentEl.empty();
	}
}

/** Collects the optional name and note before a new version is created. */
class NewVersionModal extends Modal {
	private name = "";
	private note = "";

	constructor(
		app: App,
		private plugin: LorePlugin,
		private onSubmit: (name: string, note: string) => void,
	) {
		super(app);
	}

	onOpen() {
		const t = (key: string, ...args: string[]) => this.plugin.i18n.t(key, ...args);
		this.titleEl.setText(t("version.create"));

		new Setting(this.contentEl)
			.setName(t("version.name"))
			.setDesc(t("version.name.desc"))
			.addText((text) =>
				text.setPlaceholder(t("version.namePlaceholder")).onChange((value) => {
					this.name = value;
				}),
			);

		new Setting(this.contentEl)
			.setName(t("version.note"))
			.setDesc(t("version.note.desc"))
			.addText((text) =>
				text.setPlaceholder(t("version.notePlaceholder")).onChange((value) => {
					this.note = value;
				}),
			);

		new Setting(this.contentEl).addButton((button) =>
			button
				.setButtonText(t("common.continue"))
				.setCta()
				.onClick(() => {
					this.close();
					this.onSubmit(this.name, this.note);
				}),
		);
	}

	onClose() {
		this.contentEl.empty();
	}
}
