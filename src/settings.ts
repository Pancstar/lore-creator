import {
	App,
	Notice,
	PluginSettingTab,
	Setting,
	SettingDefinitionItem,
	SettingGroup,
} from "obsidian";
import type LorePlugin from "./main";
import type { Language } from "./i18n";
import { SetupModal } from "./setup/wizard";
import { Calendar, DEFAULT_CALENDAR, newCalendarId } from "./universe";

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
	/**
	 * Session-local copy of the calendar list. Mutations write through to the
	 * universe note and re-render from this array rather than re-reading
	 * `readCalendars()` right after a write — Obsidian's metadataCache lags a
	 * write by a tick, so an immediate re-read would show stale data.
	 */
	private calendars: Calendar[] | null = null;

	constructor(
		app: App,
		private plugin: LorePlugin,
	) {
		super(app, plugin);
	}

	hide(): void {
		super.hide();
		// Forces a fresh read next time the tab opens, so out-of-band edits
		// to the universe note (or a different vault/universe) aren't missed.
		this.calendars = null;
	}

	private getCalendars(): Calendar[] {
		if (this.calendars === null) {
			this.calendars = this.plugin.universe.readCalendars();
		}
		return this.calendars;
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
				name: t("settings.calendar.desc"),
				searchable: false,
			},
			{
				name: t("settings.calendar.missing"),
				searchable: false,
				visible: () => !this.plugin.universe.file,
			},
			this.calendarListDefinition(),
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

	/**
	 * Calendars live in the universe note as a list, each rendered in its own
	 * bordered block so a field always writes back into its own calendar object
	 * and never bleeds into a sibling's settings. Structural changes (add,
	 * remove) trigger a full `update()` since the number of rows itself changes.
	 */
	private calendarListDefinition(): SettingDefinitionItem {
		const t = (key: string, ...args: string[]) => this.plugin.i18n.t(key, ...args);
		const calendars = this.getCalendars();

		return {
			type: "list",
			heading: t("settings.calendar"),
			visible: () => !!this.plugin.universe.file,
			items: calendars.map((calendar, index) => ({
				type: "page",
				name: calendar.calendarName.trim() || t("settings.calendar.unnamed"),
				items: [
					{
						// Suffixed with the index so duplicate calendar names (e.g.
						// several unnamed calendars) don't collide on the framework's
						// item key — the heading shown in renderCalendarBox() overrides
						// this text anyway.
						name: `${calendar.calendarName.trim() || t("settings.calendar.unnamed")} #${index + 1}`,
						render: (setting: Setting, group: SettingGroup) =>
							this.renderCalendarBox(setting, group, calendars, index),
					},
				],
			})),
			onDelete: (index) => {
				void (async () => {
					calendars.splice(index, 1);
					await this.plugin.universe.writeCalendars(calendars);
					this.update();
				})();
			},
			addItem: {
				name: t("settings.calendar.add"),
				action: () => {
					void (async () => {
						calendars.push({ ...DEFAULT_CALENDAR, id: newCalendarId(calendars) });
						await this.plugin.universe.writeCalendars(calendars);
						this.update();
					})();
				},
			},
		};
	}

	private renderCalendarBox(
		headerSetting: Setting,
		group: SettingGroup,
		calendars: Calendar[],
		index: number,
	) {
		const t = (key: string, ...args: string[]) => this.plugin.i18n.t(key, ...args);
		let calendar = calendars[index];
		headerSetting.setName(calendar.calendarName.trim() || t("settings.calendar.unnamed")).setHeading();

		/** Writes one field of this calendar only, leaving the rest of the list untouched. */
		const update = async (patch: Partial<Calendar>) => {
			calendar = { ...calendar, ...patch };
			calendars[index] = calendar;
			await this.plugin.universe.writeCalendars(calendars);
			refreshPreview();
		};

		group.addSetting((setting) => {
			setting
				.setName(t("settings.calendar.name"))
				.addText((text) =>
					text
						.setPlaceholder(t("settings.calendar.namePlaceholder"))
						.setValue(calendar.calendarName)
						.onChange((value) => void update({ calendarName: value })),
				);
		});

		group.addSetting((setting) => {
			setting
				.setName(t("settings.calendar.unit"))
				.addText((text) =>
					text
						.setPlaceholder(t("settings.calendar.unitPlaceholder"))
						.setValue(calendar.calendarUnit)
						.onChange((value) => void update({ calendarUnit: value })),
				);
		});

		group.addSetting((setting) => {
			setting
				.setName(t("settings.calendar.epoch"))
				.setDesc(t("settings.calendar.epoch.desc"))
				.addText((text) =>
					text.setValue(String(calendar.calendarEpoch)).onChange((value) => {
						const parsed = Number.parseFloat(value);
						if (!Number.isFinite(parsed)) return;
						void update({ calendarEpoch: parsed });
					}),
				);
		});

		group.addSetting((setting) => {
			setting
				.setName(t("settings.calendar.days"))
				.setDesc(t("settings.calendar.days.desc"))
				.addText((text) =>
					text.setValue(String(calendar.calendarDays)).onChange((value) => {
						const parsed = Number.parseFloat(value);
						if (!Number.isFinite(parsed) || parsed <= 0) return;
						void update({ calendarDays: parsed });
					}),
				);
		});

		let earthEpochSetting!: Setting;
		let earthRatioSetting!: Setting;
		let noteEl!: HTMLElement;

		group.addSetting((setting) => {
			setting
				.setName(t("settings.calendar.async"))
				.setDesc(t("settings.calendar.async.desc"))
				.addToggle((toggle) =>
					toggle.setValue(calendar.async).onChange((value) => {
						void update({ async: value });
						earthEpochSetting.settingEl.toggleClass("is-hidden", value);
						earthRatioSetting.settingEl.toggleClass("is-hidden", value);
						noteEl.toggleClass("is-hidden", !value);
					}),
				);
		});

		group.addSetting((setting) => {
			earthEpochSetting = setting
				.setName(t("settings.calendar.earthEpoch"))
				.setDesc(t("settings.calendar.earthEpoch.desc"))
				.addText((text) =>
					text
						.setValue(calendar.earthEpoch === null ? "" : String(calendar.earthEpoch))
						.onChange((value) => {
							const trimmed = value.trim();
							if (trimmed === "") {
								void update({ earthEpoch: null });
								return;
							}
							const parsed = Number.parseFloat(trimmed);
							if (!Number.isFinite(parsed)) return;
							void update({ earthEpoch: parsed });
						}),
				);
			earthEpochSetting.settingEl.toggleClass("is-hidden", calendar.async);
		});

		group.addSetting((setting) => {
			earthRatioSetting = setting
				.setName(t("settings.calendar.ratio"))
				.setDesc(t("settings.calendar.ratio.desc"))
				.addText((text) =>
					text.setValue(String(calendar.earthRatio)).onChange((value) => {
						const parsed = Number.parseFloat(value);
						if (!Number.isFinite(parsed)) return;
						void update({ earthRatio: parsed });
					}),
				);
			earthRatioSetting.settingEl.toggleClass("is-hidden", calendar.async);
		});

		noteEl = group.listEl.createEl("p", { text: t("settings.calendar.async.note"), cls: "plc-calendar-note" });
		noteEl.toggleClass("is-hidden", !calendar.async);

		const previewEl = group.listEl.createEl("p", { cls: "plc-preview" });
		const refreshPreview = () => {
			const sample = calendar.calendarEpoch + 50;
			const label = this.plugin.universe.formatTime(sample, calendar);
			const earth = this.plugin.universe.toEarthTime(sample, calendar);
			const earthPart = earth === null ? "" : ` — Earth ${earth}`;
			previewEl.setText(`${t("settings.calendar.preview")}: ${label}${earthPart}`);
		};
		refreshPreview();
	}

	getControlValue(key: string): unknown {
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
