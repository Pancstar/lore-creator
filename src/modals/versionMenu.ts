import { App, Modal, Notice, Setting, TFile, setIcon } from "obsidian";
import type LorePlugin from "../main";
import { VersionEntry, VersionError } from "../versions/store";
import { ConfirmModal } from "./confirm";
import { askOwner } from "./resolveOwner";
import { LiveRefresh } from "./liveRefresh";
import { enterSubmits } from "./enterSubmits";
import { applyLang } from "../i18n";
import { linkTargets } from "../links";

/**
 * Lists a note's versions and performs the file moves behind them. Every action
 * that touches disk goes through a confirmation naming the exact paths.
 */
export class VersionMenuModal extends Modal {
	private active: TFile;
	private live = new LiveRefresh(this.app, () => this.renderBody());
	/** An old record is being settled with the author; other actions wait. */
	private resolving = false;
	private closed = false;

	constructor(
		app: App,
		private plugin: LorePlugin,
		file: TFile,
	) {
		super(app);
		this.active = this.plugin.versions.activeFileFor(file) ?? file;
	}

	onOpen() {
		applyLang(this.modalEl);
		enterSubmits(this.contentEl);
		this.titleEl.setText(this.plugin.i18n.t("version.title"));
		this.contentEl.addClass("plc-versions");
		this.live.start();
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

		// Old archives of this name that Obsidian filed under another note of
		// the same name never appear above; offer to settle whose they are.
		const listed = new Set(entries.map((entry) => entry.file.path));
		const hidden = this.plugin.versions
			.ambiguousArchivesNamed(this.active.basename)
			.filter((archive) => !listed.has(archive.path));
		if (hidden.length > 0) {
			new Setting(this.contentEl)
				.setDesc(t("owner.hidden", String(hidden.length), this.active.basename))
				.addButton((button) => button.setButtonText(t("owner.fix")).onClick(() => this.settleHidden(hidden)));
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
		if (this.live.busy) return;
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
				() => void this.runCreate(name, note, preview.archivePath),
			).open();
		}).open();
	}

	private async runCreate(name: string, note: string, expectedPath: string) {
		const t = (key: string, ...args: string[]) => this.plugin.i18n.t(key, ...args);
		try {
			const ran = await this.live.run(() => this.plugin.versions.createVersion(this.active, name, note, expectedPath));
			if (ran) new Notice(t("version.created"));
		} catch (error) {
			this.reportFailure(error);
		}
	}

	private confirmSwitch(entry: VersionEntry) {
		if (this.live.busy || this.resolving) return;
		// An old record naming a shared name may have put another note's version
		// on this list: settle whose it is before anything moves.
		const candidates = this.plugin.versions.ownerCandidates(entry.file);
		if (candidates.length > 0) {
			this.resolving = true;
			void this.resolveOwner(entry, candidates).finally(() => (this.resolving = false));
			return;
		}
		this.showSwitchConfirm(entry);
	}

	private showSwitchConfirm(entry: VersionEntry) {
		const t = (key: string, ...args: string[]) => this.plugin.i18n.t(key, ...args);
		if (this.live.busy || this.closed) return;
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
			() => void this.runSwitch(entry, preview.archivePath),
		).open();
	}

	/** Asks whose an old archive is and records the answer; null when backed out. */
	private async askAndFix(archive: TFile, candidates: TFile[]): Promise<TFile | null> {
		const t = (key: string, ...args: string[]) => this.plugin.i18n.t(key, ...args);
		const target = linkTargets(this.app.metadataCache.getFileCache(archive)?.frontmatter?.["version-of"])[0] ?? "";
		const owner = await askOwner(this.app, {
			title: t("owner.title"),
			body: t("owner.archive.body", archive.path, target),
			candidates,
			chooseLabel: t("owner.choose"),
			cancelLabel: t("common.cancel"),
		});
		if (!owner) return null;

		try {
			await this.plugin.versions.setOwner(archive, owner);
		} catch (error) {
			console.error("Lore Creator: could not fix the version record", error);
			new Notice(t("owner.fixFailed"));
			return null;
		}
		return owner;
	}

	private async resolveOwner(entry: VersionEntry, candidates: TFile[]) {
		const owner = await this.askAndFix(entry.file, candidates);
		if (!owner || this.closed) return;
		if (owner.path !== this.active.path) {
			new Notice(this.plugin.i18n.t("owner.otherNote", owner.path), 8000);
			return;
		}
		// Settled: straight to the switch, without asking again from an index
		// that may not have caught up yet.
		this.showSwitchConfirm(entry);
	}

	private settleHidden(archives: TFile[]) {
		if (this.live.busy || this.resolving) return;
		this.resolving = true;
		void (async () => {
			for (const archive of archives) {
				const candidates = this.plugin.versions.ownerCandidates(archive);
				if (candidates.length === 0) continue;
				if (!(await this.askAndFix(archive, candidates)) || this.closed) return;
			}
			if (!this.closed) this.renderBody();
		})().finally(() => (this.resolving = false));
	}

	private async runSwitch(entry: VersionEntry, expectedPath: string) {
		const t = (key: string, ...args: string[]) => this.plugin.i18n.t(key, ...args);
		try {
			const ran = await this.live.run(() => this.plugin.versions.switchTo(this.active, entry.file, expectedPath));
			if (ran) new Notice(t("version.switched", `v${entry.number}`));
		} catch (error) {
			this.reportFailure(error);
		}
	}

	private confirmDelete(entry: VersionEntry) {
		const t = (key: string, ...args: string[]) => this.plugin.i18n.t(key, ...args);
		if (this.live.busy) return;

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
			const ran = await this.live.run(() => this.plugin.versions.deleteVersion(entry.file));
			if (ran) new Notice(t("version.deleted"));
		} catch (error) {
			this.reportFailure(error);
		}
	}

	private reportFailure(error: unknown) {
		const t = (key: string, ...args: string[]) => this.plugin.i18n.t(key, ...args);
		console.error("Lore Creator: version operation failed", error);

		if (error instanceof VersionError) {
			// The store throws a reason code for misuse, otherwise the blocking path.
			if (error.message === "archived") new Notice(t("version.error.archived"));
			else if (error.message === "active") new Notice(t("version.error.active"));
			else new Notice(t("version.error.exists", error.message));
			return;
		}
		new Notice(t("version.error.generic"));
	}

	onClose() {
		this.closed = true;
		this.live.stop();
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
		applyLang(this.modalEl);
		enterSubmits(this.contentEl);
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
