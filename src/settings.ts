import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type LorePlugin from "./main";
import type { Language } from "./i18n";
import { SetupModal } from "./setup/wizard";

export interface LoreSettings {
	language: Language;
	universeFile: string;
	registryFile: string;
	versionsFolder: string;
	templatesFolder: string;
	versionSetsFile: string;
	exportFolder: string;
	showEarthTime: boolean;
	minimapPinned: boolean;
	minimapMode: "wide" | "near";
	/** Cleared once the vault has been set up, so the offer is made only once. */
	setupOffered: boolean;
}

/**
 * Paths default to English so the plugin reads sensibly in a fresh vault. Every
 * one of them is a setting — a vault is free to name these folders in whatever
 * language it is written in.
 */
export const DEFAULT_SETTINGS: LoreSettings = {
	language: "auto",
	universeFile: "Universe.md",
	registryFile: "System/Types.md",
	versionsFolder: "Versions",
	templatesFolder: "Templates",
	versionSetsFile: "System/Version sets.md",
	exportFolder: "Exports",
	showEarthTime: true,
	minimapPinned: false,
	minimapMode: "near",
	setupOffered: false,
};

export class LoreSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private plugin: LorePlugin,
	) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		const t = (key: string, ...args: string[]) => this.plugin.i18n.t(key, ...args);
		containerEl.empty();

		new Setting(containerEl)
			.setName(t("settings.language"))
			.setDesc(t("settings.language.desc"))
			.addDropdown((dropdown) =>
				dropdown
					.addOption("auto", t("settings.language.auto"))
					.addOption("en", t("settings.language.en"))
					.addOption("tr", t("settings.language.tr"))
					.setValue(this.plugin.settings.language)
					.onChange(async (value) => {
						this.plugin.settings.language = value as Language;
						await this.plugin.saveSettings();
						// Command and ribbon labels are fixed when the plugin loads,
						// so those need a restart even though the rest updates live.
						new Notice(this.plugin.i18n.t("settings.language.reload"));
						// Re-render so the tab itself picks up the new language.
						this.display();
					}),
			);

		new Setting(containerEl).setName(t("settings.folders")).setHeading();

		this.addPathSetting(
			t("settings.universeFile"),
			t("settings.universeFile.desc"),
			DEFAULT_SETTINGS.universeFile,
			() => this.plugin.settings.universeFile,
			(value) => {
				this.plugin.settings.universeFile = value;
			},
		);

		this.addPathSetting(
			t("settings.registryFile"),
			t("settings.registryFile.desc"),
			DEFAULT_SETTINGS.registryFile,
			() => this.plugin.settings.registryFile,
			(value) => {
				this.plugin.settings.registryFile = value;
			},
		);

		this.addPathSetting(
			t("settings.versionsFolder"),
			t("settings.versionsFolder.desc"),
			DEFAULT_SETTINGS.versionsFolder,
			() => this.plugin.settings.versionsFolder,
			(value) => {
				this.plugin.settings.versionsFolder = value;
			},
		);

		this.addPathSetting(
			t("settings.templatesFolder"),
			t("settings.templatesFolder.desc"),
			DEFAULT_SETTINGS.templatesFolder,
			() => this.plugin.settings.templatesFolder,
			(value) => {
				this.plugin.settings.templatesFolder = value;
			},
		);

		this.addPathSetting(
			t("settings.versionSetsFile"),
			t("settings.versionSetsFile.desc"),
			DEFAULT_SETTINGS.versionSetsFile,
			() => this.plugin.settings.versionSetsFile,
			(value) => {
				this.plugin.settings.versionSetsFile = value;
			},
		);

		this.addPathSetting(
			t("settings.exportFolder"),
			t("settings.exportFolder.desc"),
			DEFAULT_SETTINGS.exportFolder,
			() => this.plugin.settings.exportFolder,
			(value) => {
				this.plugin.settings.exportFolder = value;
			},
		);

		new Setting(containerEl)
			.setName(t("setup.run"))
			.setDesc(t("setup.run.desc"))
			.addButton((button) =>
				button.setButtonText(t("setup.open")).onClick(() => {
					new SetupModal(this.app, this.plugin).open();
				}),
			);

		new Setting(containerEl).setName(t("settings.calendar")).setHeading();
		containerEl.createEl("p", {
			text: t("settings.calendar.desc"),
			cls: "setting-item-description",
		});

		if (!this.plugin.universe.file) {
			containerEl.createEl("p", {
				text: t("settings.calendar.missing"),
				cls: "plc-warning",
			});
		} else {
			this.displayCalendar();
		}

		new Setting(containerEl).setName(t("settings.display")).setHeading();

		new Setting(containerEl)
			.setName(t("settings.showEarthTime"))
			.setDesc(t("settings.showEarthTime.desc"))
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.showEarthTime).onChange(async (value) => {
					this.plugin.settings.showEarthTime = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName(t("settings.minimapPinned"))
			.setDesc(t("settings.minimapPinned.desc"))
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.minimapPinned).onChange(async (value) => {
					this.plugin.settings.minimapPinned = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName(t("settings.minimapMode"))
			.setDesc(t("settings.minimapMode.desc"))
			.addDropdown((dropdown) =>
				dropdown
					.addOption("near", t("settings.minimapMode.near"))
					.addOption("wide", t("settings.minimapMode.wide"))
					.setValue(this.plugin.settings.minimapMode)
					.onChange(async (value) => {
						this.plugin.settings.minimapMode = value as "wide" | "near";
						await this.plugin.saveSettings();
					}),
			);
	}

	private addPathSetting(
		name: string,
		desc: string,
		placeholder: string,
		get: () => string,
		set: (value: string) => void,
	) {
		new Setting(this.containerEl)
			.setName(name)
			.setDesc(desc)
			.addText((text) =>
				text
					.setPlaceholder(placeholder)
					.setValue(get())
					.onChange(async (value) => {
						set(value.trim() || placeholder);
						await this.plugin.saveSettings();
					}),
			);
	}

	/** Calendar fields live in the universe note, so these write straight to it. */
	private displayCalendar() {
		const t = (key: string, ...args: string[]) => this.plugin.i18n.t(key, ...args);
		const calendar = this.plugin.universe.readCalendar();

		new Setting(this.containerEl)
			.setName(t("settings.calendar.name"))
			.addText((text) =>
				text
					.setPlaceholder(t("settings.calendar.namePlaceholder"))
					.setValue(calendar.calendarName)
					.onChange(async (value) => {
						await this.plugin.universe.writeCalendar({ calendarName: value });
					}),
			);

		new Setting(this.containerEl)
			.setName(t("settings.calendar.unit"))
			.addText((text) =>
				text
					.setPlaceholder(t("settings.calendar.unitPlaceholder"))
					.setValue(calendar.calendarUnit)
					.onChange(async (value) => {
						await this.plugin.universe.writeCalendar({ calendarUnit: value });
					}),
			);

		new Setting(this.containerEl)
			.setName(t("settings.calendar.epoch"))
			.setDesc(t("settings.calendar.epoch.desc"))
			.addText((text) =>
				text.setValue(String(calendar.calendarEpoch)).onChange(async (value) => {
					const parsed = Number.parseFloat(value);
					if (!Number.isFinite(parsed)) return;
					await this.plugin.universe.writeCalendar({ calendarEpoch: parsed });
					this.refreshPreview();
				}),
			);

		new Setting(this.containerEl)
			.setName(t("settings.calendar.days"))
			.setDesc(t("settings.calendar.days.desc"))
			.addText((text) =>
				text.setValue(String(calendar.calendarDays)).onChange(async (value) => {
					const parsed = Number.parseFloat(value);
					if (!Number.isFinite(parsed) || parsed <= 0) return;
					await this.plugin.universe.writeCalendar({ calendarDays: parsed });
					this.refreshPreview();
				}),
			);

		new Setting(this.containerEl)
			.setName(t("settings.calendar.earthEpoch"))
			.setDesc(t("settings.calendar.earthEpoch.desc"))
			.addText((text) =>
				text
					.setValue(calendar.earthEpoch === null ? "" : String(calendar.earthEpoch))
					.onChange(async (value) => {
						const trimmed = value.trim();
						if (trimmed === "") {
							await this.plugin.universe.writeCalendar({ earthEpoch: null });
							this.refreshPreview();
							return;
						}
						const parsed = Number.parseFloat(trimmed);
						if (!Number.isFinite(parsed)) return;
						await this.plugin.universe.writeCalendar({ earthEpoch: parsed });
						this.refreshPreview();
					}),
			);

		new Setting(this.containerEl)
			.setName(t("settings.calendar.ratio"))
			.setDesc(t("settings.calendar.ratio.desc"))
			.addText((text) =>
				text.setValue(String(calendar.earthRatio)).onChange(async (value) => {
					const parsed = Number.parseFloat(value);
					if (!Number.isFinite(parsed)) return;
					await this.plugin.universe.writeCalendar({ earthRatio: parsed });
					this.refreshPreview();
				}),
			);

		this.previewEl = this.containerEl.createEl("p", { cls: "plc-preview" });
		this.refreshPreview();
	}

	private previewEl: HTMLElement | null = null;

	/** Shows how the current calendar renders a sample date, so mistakes surface early. */
	private refreshPreview() {
		if (!this.previewEl) return;
		const t = (key: string, ...args: string[]) => this.plugin.i18n.t(key, ...args);
		const calendar = this.plugin.universe.readCalendar();
		const sample = calendar.calendarEpoch + 50;
		const label = this.plugin.universe.formatTime(sample, calendar);
		const earth = this.plugin.universe.toEarthTime(sample, calendar);
		const earthPart = earth === null ? "" : ` — Earth ${earth}`;
		this.previewEl.setText(`${t("settings.calendar.preview")}: ${label}${earthPart}`);
	}
}
