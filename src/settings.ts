import { App, Notice, PluginSettingTab, SettingDefinitionItem } from "obsidian";
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
	/** Multiplier on the automatic time scale, so the axis can be spread out. */
	timeDensity: number;
	timelineLocked: boolean;
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
	timeDensity: 1,
	timelineLocked: false,
	setupOffered: false,
};

/** A path field's key within `LoreSettings`, and the default it falls back to when cleared. */
const PATH_FIELDS = [
	"universeFile",
	"registryFile",
	"versionsFolder",
	"templatesFolder",
	"versionSetsFile",
	"exportFolder",
] as const;
type PathField = (typeof PATH_FIELDS)[number];

function isPathField(key: string): key is PathField {
	return (PATH_FIELDS as readonly string[]).includes(key);
}

export class LoreSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private plugin: LorePlugin,
	) {
		super(app, plugin);
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		const t = (key: string, ...args: string[]) => this.plugin.i18n.t(key, ...args);

		const items: SettingDefinitionItem[] = [
			{
				name: t("settings.language"),
				desc: t("settings.language.desc"),
				control: {
					type: "dropdown",
					key: "language",
					options: {
						auto: t("settings.language.auto"),
						en: t("settings.language.en"),
						tr: t("settings.language.tr"),
					},
				},
			},
			{
				type: "group",
				heading: t("settings.folders"),
				items: [
					{
						name: t("settings.universeFile"),
						desc: t("settings.universeFile.desc"),
						control: { type: "text", key: "path:universeFile", placeholder: DEFAULT_SETTINGS.universeFile },
					},
					{
						name: t("settings.registryFile"),
						desc: t("settings.registryFile.desc"),
						control: { type: "text", key: "path:registryFile", placeholder: DEFAULT_SETTINGS.registryFile },
					},
					{
						name: t("settings.versionsFolder"),
						desc: t("settings.versionsFolder.desc"),
						control: {
							type: "text",
							key: "path:versionsFolder",
							placeholder: DEFAULT_SETTINGS.versionsFolder,
						},
					},
					{
						name: t("settings.templatesFolder"),
						desc: t("settings.templatesFolder.desc"),
						control: {
							type: "text",
							key: "path:templatesFolder",
							placeholder: DEFAULT_SETTINGS.templatesFolder,
						},
					},
					{
						name: t("settings.versionSetsFile"),
						desc: t("settings.versionSetsFile.desc"),
						control: {
							type: "text",
							key: "path:versionSetsFile",
							placeholder: DEFAULT_SETTINGS.versionSetsFile,
						},
					},
					{
						name: t("settings.exportFolder"),
						desc: t("settings.exportFolder.desc"),
						control: { type: "text", key: "path:exportFolder", placeholder: DEFAULT_SETTINGS.exportFolder },
					},
					{
						name: t("setup.run"),
						desc: t("setup.run.desc"),
						action: () => new SetupModal(this.app, this.plugin).open(),
					},
				],
			},
			{
				type: "group",
				heading: t("settings.time"),
				items: [
					{
						name: t("settings.time.desc"),
						searchable: false,
					},
					{
						name: t("settings.time.missing"),
						searchable: false,
						visible: () => !this.plugin.universe.file,
					},
					{
						name: t("settings.time.name"),
						visible: () => !!this.plugin.universe.file,
						control: {
							type: "text",
							key: "time:name",
							placeholder: t("settings.time.namePlaceholder"),
						},
					},
					{
						name: t("settings.time.openUniverse"),
						visible: () => !!this.plugin.universe.file,
						action: () => {
							const file = this.plugin.universe.file;
							if (file) void this.app.workspace.getLeaf(false).openFile(file);
						},
					},
				],
			},
			{
				type: "group",
				heading: t("settings.display"),
				items: [
					{
						name: t("settings.showEarthTime"),
						desc: t("settings.showEarthTime.desc"),
						control: { type: "toggle", key: "showEarthTime" },
					},
					{
						name: t("settings.minimapPinned"),
						desc: t("settings.minimapPinned.desc"),
						control: { type: "toggle", key: "minimapPinned" },
					},
					{
						name: t("settings.minimapMode"),
						desc: t("settings.minimapMode.desc"),
						control: {
							type: "dropdown",
							key: "minimapMode",
							options: { near: t("settings.minimapMode.near"), wide: t("settings.minimapMode.wide") },
						},
					},
				],
			},
		];

		return items;
	}

	getControlValue(key: string): unknown {
		if (key === "time:name") {
			return this.plugin.universe.readTime().timeName;
		}

		if (key.startsWith("path:")) {
			const field = key.slice("path:".length);
			return isPathField(field) ? this.plugin.settings[field] : "";
		}

		switch (key) {
			case "language":
				return this.plugin.settings.language;
			case "showEarthTime":
				return this.plugin.settings.showEarthTime;
			case "minimapPinned":
				return this.plugin.settings.minimapPinned;
			case "minimapMode":
				return this.plugin.settings.minimapMode;
			default:
				return undefined;
		}
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		if (key === "time:name") {
			if (typeof value !== "string") return;
			const current = this.plugin.universe.readTime();
			await this.plugin.universe.writeTime({ ...current, timeName: value });
			return;
		}

		if (key.startsWith("path:")) {
			const field = key.slice("path:".length);
			if (!isPathField(field) || typeof value !== "string") return;
			this.plugin.settings[field] = value.trim() || DEFAULT_SETTINGS[field];
			await this.plugin.saveSettings();
			return;
		}

		switch (key) {
			case "language":
				this.plugin.settings.language = value as Language;
				await this.plugin.saveSettings();
				// Command and ribbon labels are fixed when the plugin loads, so
				// those need a restart even though the rest updates live.
				new Notice(this.plugin.i18n.t("settings.language.reload"));
				this.update();
				return;
			case "showEarthTime":
				this.plugin.settings.showEarthTime = value === true;
				await this.plugin.saveSettings();
				return;
			case "minimapPinned":
				this.plugin.settings.minimapPinned = value === true;
				await this.plugin.saveSettings();
				return;
			case "minimapMode":
				this.plugin.settings.minimapMode = value === "wide" ? "wide" : "near";
				await this.plugin.saveSettings();
				return;
		}
	}
}
