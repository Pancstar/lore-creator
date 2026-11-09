import { App, Modal, Notice, Setting, normalizePath } from "obsidian";
import type LorePlugin from "../main";
import type { TypeDefinition } from "../types";
import { ensureFolder } from "../noteFactory";
import { DEFAULT_TIME, Time } from "../universe";
import { validateTime } from "../time";
import { openTimeSystemEditor } from "../modals/timeSystem";
import { keepExistingPaths } from "../settingsData";
import {
	FOLDER_NAMES,
	buildRegistryNote,
	buildVersionSetsNote,
	buildTemplate,
	buildUniverseNote,
	resolveTypes,
} from "./defaults";
import { applyLang } from "../i18n";

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
	private time: Time = { ...DEFAULT_TIME };
	private linkEarth = false;
	/** Raw number texts; empty or unreadable shows an error instead of a silent 0. */
	private timeTexts = { days: "365", earthYear: "", epoch: "0", ratio: "1" };
	private timeErrorEl: HTMLElement | null = null;
	private earthEl: HTMLElement | null = null;
	/** An existing universe note is the author's: its time system is edited elsewhere. */
	private universeExists = false;

	constructor(
		app: App,
		private plugin: LorePlugin,
	) {
		super(app);
		this.lang = this.plugin.language;
	}

	onOpen() {
		applyLang(this.modalEl);
		const t = (key: string, ...args: string[]) => this.plugin.i18n.t(key, ...args);
		this.titleEl.setText(t("setup.title"));
		this.contentEl.createEl("p", { cls: "setting-item-description", text: t("setup.desc") });
		this.universeExists = this.app.vault.getFileByPath(normalizePath(this.plugin.settings.universeFile)) !== null;

		// An existing universe note keeps its name; asking for one would be ignored.
		if (!this.universeExists) {
			new Setting(this.contentEl)
				.setName(t("setup.universeName"))
				.addText((text) =>
					text.setPlaceholder(t("setup.universeNamePlaceholder")).onChange((value) => {
						this.universeName = value;
					}),
				);
		}

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

		this.buildTimeStep();

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
		const existing = this.existingRegistryTypes();
		const types = existing ?? resolveTypes(this.lang, this.prefixFolders);
		const lines = [
			...(existing ? [this.plugin.i18n.t("setup.existingRegistry"), ""] : []),
			`${this.plugin.settings.universeFile}`,
			...types.filter((type) => type.folder).map((type) => `${type.folder}/`),
			...(existing
				? [
						`${this.plugin.settings.versionsFolder}/`,
						`${this.plugin.settings.templatesFolder}/`,
						this.plugin.settings.versionSetsFile,
						`${this.plugin.settings.exportFolder}/`,
					]
				: [
						`${folders.versions}/`,
						`${folders.templates}/`,
						`${folders.system}/`,
						this.paths().versionSetsFile,
						`${folders.exports}/`,
					]),
		];
		this.previewEl.setText(lines.join("\n"));
	}

	/**
	 * The types of a registry that is already in use, or null for a fresh
	 * setup. A re-run completes that registry's own folders and templates
	 * instead of laying a second set down in another language.
	 */
	private existingRegistryTypes(): TypeDefinition[] | null {
		const file = this.plugin.types.file;
		const raw: unknown = file ? this.app.metadataCache.getFileCache(file)?.frontmatter?.registry : undefined;
		if (!Array.isArray(raw) || raw.length === 0) return null;
		return this.plugin.types.creatable();
	}

	/**
	 * A registry file that exists but is not indexed yet cannot be read; taking
	 * it for a fresh vault would lay down a second set of folders beside it.
	 */
	private registryNotReady(): boolean {
		const file = this.plugin.types.file;
		return file !== null && !this.app.metadataCache.getFileCache(file);
	}

	/** Where the system files go for the chosen language; nothing is written here. */
	private paths() {
		const folders = FOLDER_NAMES[this.lang];
		return {
			registryFile: `${folders.system}/${this.lang === "tr" ? "Türler" : "Types"}.md`,
			versionSetsFile: `${folders.system}/${this.lang === "tr" ? "Sürüm setleri" : "Version sets"}.md`,
		};
	}

	/** Optional: skipping it all leaves an Earth-like 365-day calendar. */
	private buildTimeStep() {
		const t = (key: string) => this.plugin.i18n.t(key);

		if (this.universeExists) {
			// Answers typed here would go nowhere: the universe note already holds
			// the time system, and it is the author's to change.
			new Setting(this.contentEl)
				.setName(t("setup.time"))
				.setDesc(t("setup.time.existing"))
				.setHeading()
				.addButton((button) =>
					button.setButtonText(t("time.editSystem")).onClick(() => openTimeSystemEditor(this.plugin)),
				);
			return;
		}

		new Setting(this.contentEl).setName(t("setup.time")).setDesc(t("setup.time.desc")).setHeading();

		new Setting(this.contentEl)
			.setName(t("time.editor.name"))
			.setDesc(t("time.editor.name.desc"))
			.addText((text) => text.onChange((value) => (this.time.timeName = value)));
		new Setting(this.contentEl)
			.setName(t("time.editor.unit"))
			.setDesc(t("time.editor.unit.desc"))
			.addText((text) => text.onChange((value) => (this.time.timeUnit = value)));
		this.timeNumber(this.contentEl, "time.editor.days", "days");

		new Setting(this.contentEl)
			.setName(t("setup.time.earth"))
			.setDesc(t("setup.time.earth.desc"))
			.addToggle((toggle) =>
				toggle.setValue(this.linkEarth).onChange((value) => {
					this.linkEarth = value;
					this.earthEl?.toggleClass("is-hidden", !value);
				}),
			);

		this.earthEl = this.contentEl.createDiv({ cls: "plc-setup-earth is-hidden" });
		this.timeNumber(this.earthEl, "time.editor.earthYear", "earthYear");
		this.timeNumber(this.earthEl, "time.editor.epoch", "epoch");
		this.timeNumber(this.earthEl, "time.editor.ratio", "ratio");

		this.timeErrorEl = this.contentEl.createDiv({ cls: "plc-time-system-error" });
	}

	private timeNumber(parent: HTMLElement, key: string, field: keyof SetupModal["timeTexts"]) {
		const t = (k: string) => this.plugin.i18n.t(k);
		new Setting(parent)
			.setName(t(key))
			.setDesc(t(`${key}.desc`))
			.addText((text) => {
				text.inputEl.inputMode = "decimal";
				text.setValue(this.timeTexts[field]).onChange((value) => (this.timeTexts[field] = value));
			});
	}

	/** Reads the step into a `Time`, or shows why it cannot be used. */
	private readTimeStep(): Time | null {
		const t = (key: string) => this.plugin.i18n.t(key);
		const num = (text: string) => (text.trim() ? Number(text.trim()) : Number.NaN);

		const time: Time = { ...this.time, timeDays: num(this.timeTexts.days) };
		if (this.linkEarth && this.timeTexts.earthYear.trim()) {
			time.earthEpoch = num(this.timeTexts.earthYear);
			time.timeEpoch = num(this.timeTexts.epoch);
			time.earthRatio = num(this.timeTexts.ratio);
		}

		const issues = validateTime(time);
		this.timeErrorEl?.setText(issues.map((issue) => t(`time.editor.error.${issue}`)).join(" "));
		return issues.length === 0 ? time : null;
	}

	private async run() {
		const t = (key: string, ...args: string[]) => this.plugin.i18n.t(key, ...args);
		const name = this.universeName.trim() || t("setup.untitled");

		// With a universe note already there, the time step was never shown and
		// the note is not rewritten, so there is nothing to read.
		const time = this.universeExists ? DEFAULT_TIME : this.readTimeStep();
		if (!time) return;

		if (this.registryNotReady()) {
			new Notice(t("setup.indexing"));
			return;
		}

		try {
			const folders = FOLDER_NAMES[this.lang];
			// A registry already in use decides the folders and templates; the
			// language choice only shapes a fresh setup.
			const existing = this.existingRegistryTypes();
			const types = existing ?? resolveTypes(this.lang, this.prefixFolders);
			const settings = this.plugin.settings;
			// Missing pieces of an existing setup follow the vault's current
			// language, not the one picked for a fresh setup.
			const lang = existing ? this.plugin.language : this.lang;
			// On a re-run, paths that still lead somewhere are the author's working
			// setup: their registry, sets and templates stay in use. Only paths
			// pointing at nothing take the new names.
			const exists = (path: string) => this.app.vault.getAbstractFileByPath(normalizePath(path)) !== null;
			const current = {
				registryFile: settings.registryFile,
				versionSetsFile: settings.versionSetsFile,
				versionsFolder: settings.versionsFolder,
				templatesFolder: settings.templatesFolder,
				exportFolder: settings.exportFolder,
			};
			const target = keepExistingPaths(
				current,
				// With a registry in use, missing pieces are filled in where the
				// settings already point; new names are only for a fresh setup.
				existing
					? { ...current }
					: {
							...this.paths(),
							versionsFolder: folders.versions,
							templatesFolder: folders.templates,
							exportFolder: folders.exports,
						},
				exists,
			);

			// Everything is written to explicit paths first. Settings only move to
			// the new names once all of it exists, so a failure partway leaves the
			// plugin pointing where it pointed before, not at missing files.
			for (const type of types) if (type.folder) await ensureFolder(this.app, type.folder);
			await ensureFolder(this.app, target.versionsFolder);
			await ensureFolder(this.app, target.templatesFolder);
			await ensureFolder(this.app, target.exportFolder);

			let created = 0;
			created += await this.write(
				this.plugin.settings.universeFile,
				buildUniverseNote(name, this.plugin.i18n, time),
			);
			if (!existing) created += await this.write(target.registryFile, buildRegistryNote(types, this.plugin.i18n));
			created += await this.write(target.versionSetsFile, buildVersionSetsNote(lang));

			for (const type of types) {
				if (!type.template) continue;
				created += await this.write(
					`${target.templatesFolder}/${type.template}.md`,
					buildTemplate(type, lang),
				);
			}

			Object.assign(settings, target);
			settings.setupOffered = true;
			await this.plugin.saveSettings();

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
