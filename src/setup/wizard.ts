import { App, Modal, Notice, Setting, normalizePath } from "obsidian";
import type LorePlugin from "../main";
import { ensureFolder } from "../noteFactory";
import {
	FOLDER_NAMES,
	buildRegistryNote,
	buildTemplate,
	buildUniverseNote,
	resolveTypes,
} from "./defaults";

type Lang = "tr" | "en";

/**
 * Builds the folder structure, templates and registry a vault needs before any
 * of this plugin's views have something to show. Without it a new user faces an
 * empty vault and four views that all say "nothing here".
 */
export class SetupModal extends Modal {
	private universeName = "";
	private lang: Lang;
	private prefixFolders = true;

	constructor(
		app: App,
		private plugin: LorePlugin,
	) {
		super(app);
		this.lang = this.plugin.language;
	}

	onOpen() {
		const t = (key: string, ...args: string[]) => this.plugin.i18n.t(key, ...args);
		this.titleEl.setText(t("setup.title"));
		this.contentEl.createEl("p", { cls: "setting-item-description", text: t("setup.desc") });

		new Setting(this.contentEl)
			.setName(t("setup.universeName"))
			.addText((text) =>
				text.setPlaceholder(t("setup.universeNamePlaceholder")).onChange((value) => {
					this.universeName = value;
				}),
			);

		new Setting(this.contentEl)
			.setName(t("setup.fileLanguage"))
			.setDesc(t("setup.fileLanguage.desc"))
			.addDropdown((dropdown) =>
				dropdown
					.addOption("en", "English")
					.addOption("tr", "Türkçe")
					.setValue(this.lang)
					.onChange((value) => {
						this.lang = value as Lang;
						this.refreshPreview();
					}),
			);

		new Setting(this.contentEl)
			.setName(t("setup.prefix"))
			.setDesc(t("setup.prefix.desc"))
			.addToggle((toggle) =>
				toggle.setValue(this.prefixFolders).onChange((value) => {
					this.prefixFolders = value;
					this.refreshPreview();
				}),
			);

		this.previewEl = this.contentEl.createEl("pre", { cls: "plc-setup-preview" });
		this.refreshPreview();

		new Setting(this.contentEl).addButton((button) =>
			button
				.setButtonText(t("setup.create"))
				.setCta()
				.onClick(() => void this.run()),
		);
	}

	private previewEl: HTMLElement | null = null;

	/** Shows the exact tree that will be created, before anything is written. */
	private refreshPreview() {
		if (!this.previewEl) return;

		const folders = FOLDER_NAMES[this.lang];
		const types = resolveTypes(this.lang, this.prefixFolders);
		const lines = [
			`${this.plugin.settings.universeFile}`,
			...types.map((type) => `${type.folder}/`),
			`${folders.versions}/`,
			`${folders.templates}/`,
			`${folders.system}/`,
		];
		this.previewEl.setText(lines.join("\n"));
	}

	private async run() {
		const t = (key: string, ...args: string[]) => this.plugin.i18n.t(key, ...args);
		const name = this.universeName.trim() || t("setup.untitled");

		try {
			const folders = FOLDER_NAMES[this.lang];
			const types = resolveTypes(this.lang, this.prefixFolders);

			// Settings are pointed at the new names first so everything created
			// below lands where the plugin will look for it afterwards.
			this.plugin.settings.registryFile = `${folders.system}/${this.lang === "tr" ? "Türler" : "Types"}.md`;
			this.plugin.settings.versionSetsFile = `${folders.system}/${
				this.lang === "tr" ? "Sürüm setleri" : "Version sets"
			}.md`;
			this.plugin.settings.versionsFolder = folders.versions;
			this.plugin.settings.templatesFolder = folders.templates;
			this.plugin.settings.exportFolder = folders.exports;
			this.plugin.settings.setupOffered = true;
			await this.plugin.saveSettings();

			for (const type of types) await ensureFolder(this.app, type.folder);
			await ensureFolder(this.app, folders.versions);
			await ensureFolder(this.app, folders.templates);
			await ensureFolder(this.app, folders.system);

			let created = 0;
			created += await this.write(
				this.plugin.settings.universeFile,
				buildUniverseNote(name, this.plugin.i18n),
			);
			created += await this.write(
				this.plugin.settings.registryFile,
				buildRegistryNote(types, this.plugin.i18n),
			);

			for (const type of types) {
				if (!type.template) continue;
				created += await this.write(
					`${folders.templates}/${type.template}.md`,
					buildTemplate(type, this.lang),
				);
			}

			this.plugin.types.invalidate();
			new Notice(t("setup.done", String(created)));

			const universe = this.app.vault.getFileByPath(normalizePath(this.plugin.settings.universeFile));
			if (universe) await this.app.workspace.getLeaf(false).openFile(universe);

			this.close();
		} catch (error) {
			console.error("Lore Creator: setup failed", error);
			new Notice(t("setup.failed"));
		}
	}

	/** Never overwrites: an existing file is the author's, not ours to replace. */
	private async write(path: string, content: string): Promise<number> {
		const normalized = normalizePath(path);
		if (this.app.vault.getFileByPath(normalized)) return 0;

		const folder = normalized.split("/").slice(0, -1).join("/");
		await ensureFolder(this.app, folder);
		await this.app.vault.create(normalized, content);
		return 1;
	}

	onClose() {
		this.contentEl.empty();
	}
}
