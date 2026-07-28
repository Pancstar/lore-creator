import { MarkdownView, Notice, TFile, setIcon } from "obsidian";
import type LorePlugin from "./main";
import { IconChoice, IconPickerModal } from "./modals/iconPicker";
import { TimePickerModal, TimeValue } from "./modals/timePicker";
import { VersionMenuModal } from "./modals/versionMenu";
import { isTimePrecision } from "./time";

const BANNER_CLASS = "plc-banner";

const STATUSES = ["draft", "partial", "done"] as const;
type Status = (typeof STATUSES)[number];

function isStatus(value: unknown): value is Status {
	return typeof value === "string" && (STATUSES as readonly string[]).includes(value);
}

function asString(value: unknown): string {
	return typeof value === "string" ? value : "";
}

function asNumberOrNull(value: unknown): number | null {
	if (value === null || value === undefined || value === "") return null;
	const parsed = typeof value === "number" ? value : Number.parseFloat(String(value));
	return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Renders a compact summary above the note. Obsidian's own Properties table
 * stays where it is and keeps handling raw field editing; this only surfaces the
 * handful of things an author checks constantly — what this note is, how
 * finished it is, and where it sits in time.
 */
export class Banner {
	constructor(private plugin: LorePlugin) {}

	/** Redraws the banner in every open markdown view. */
	refreshAll() {
		for (const leaf of this.plugin.app.workspace.getLeavesOfType("markdown")) {
			const view = leaf.view;
			if (view instanceof MarkdownView) this.render(view);
		}
	}

	removeAll() {
		for (const leaf of this.plugin.app.workspace.getLeavesOfType("markdown")) {
			const view = leaf.view;
			if (view instanceof MarkdownView) this.remove(view);
		}
	}

	private remove(view: MarkdownView) {
		view.contentEl.findAll(`.${BANNER_CLASS}`).forEach((el) => el.remove());
	}

	render(view: MarkdownView) {
		this.remove(view);

		const file = view.file;
		if (!file) return;

		const frontmatter = this.plugin.app.metadataCache.getFileCache(file)?.frontmatter;
		if (!frontmatter) return;

		const typeId = asString(frontmatter.type);
		const type = this.plugin.types.byId(typeId);

		// Only lore notes get a banner; plain notes are left untouched.
		if (!type || type.id === "system") return;

		const bannerEl = createDiv({ cls: BANNER_CLASS });
		this.buildHeadRow(bannerEl, file, frontmatter, type.icon);
		this.buildMetaRow(bannerEl, file, frontmatter, typeId);
		this.buildTimeRow(bannerEl, file, frontmatter);

		view.contentEl.prepend(bannerEl);
	}

	private buildHeadRow(
		parent: HTMLElement,
		file: TFile,
		frontmatter: Record<string, unknown>,
		fallbackIcon: string,
	) {
		const rowEl = parent.createDiv({ cls: "plc-banner-head" });

		const icon = asString(frontmatter.icon) || fallbackIcon;
		const iconType = asString(frontmatter["icon-type"]) === "lucide" ? "lucide" : "emoji";

		const iconButton = rowEl.createEl("button", {
			cls: "plc-banner-icon",
			attr: { "aria-label": this.plugin.i18n.t("banner.changeIcon") },
		});
		if (iconType === "lucide" && icon) {
			setIcon(iconButton, icon);
		} else {
			iconButton.setText(icon || "❔");
		}
		iconButton.addEventListener("click", () => this.pickIcon(file, { icon, iconType }));

		rowEl.createEl("span", { cls: "plc-banner-title", text: file.basename });
	}

	private buildMetaRow(
		parent: HTMLElement,
		file: TFile,
		frontmatter: Record<string, unknown>,
		typeId: string,
	) {
		const rowEl = parent.createDiv({ cls: "plc-banner-meta" });
		const type = this.plugin.types.byId(typeId);

		if (type) {
			rowEl.createEl("span", {
				cls: "plc-badge plc-badge-type",
				text: this.plugin.types.label(type, this.plugin.language),
			});
		}

		const status = isStatus(frontmatter.status) ? frontmatter.status : "draft";
		const statusButton = rowEl.createEl("button", {
			cls: `plc-badge plc-badge-status is-${status}`,
			text: this.plugin.i18n.t(`status.${status}`),
			attr: { "aria-label": this.plugin.i18n.t("banner.cycleStatus") },
		});
		statusButton.addEventListener("click", () => void this.cycleStatus(file, status));

		const version = asString(frontmatter.version);
		const versionName = asString(frontmatter["version-name"]);
		if (version) {
			const versionButton = rowEl.createEl("button", {
				cls: "plc-badge plc-badge-version",
				text: versionName ? `${version} · ${versionName}` : version,
				attr: { "aria-label": this.plugin.i18n.t("version.title") },
			});
			versionButton.addEventListener("click", () =>
				new VersionMenuModal(this.plugin.app, this.plugin, file).open(),
			);
		}

		if (frontmatter["version-of"]) {
			rowEl.createEl("span", {
				cls: "plc-badge plc-badge-archived",
				text: this.plugin.i18n.t("banner.oldVersion"),
			});
		}
	}

	private buildTimeRow(parent: HTMLElement, file: TFile, frontmatter: Record<string, unknown>) {
		const rowEl = parent.createDiv({ cls: "plc-banner-time" });

		const timeline = asString(frontmatter.timeline);
		const flow = asString(frontmatter.flow);
		if (timeline) {
			const trail = flow ? `${timeline} › ${flow}` : timeline;
			rowEl.createEl("span", { cls: "plc-banner-trail", text: trail });
		}

		const time = asNumberOrNull(frontmatter.time);
		const label = asString(frontmatter["time-label"]);
		const uncertain = frontmatter["time-uncertain"] === true;
		const timeEnd = asNumberOrNull(frontmatter["time-end"]);

		let text: string;
		if (time === null) {
			text = this.plugin.i18n.t("banner.noTime");
		} else {
			const calendar = this.plugin.universe.readCalendar();
			const head = label || this.plugin.universe.formatTime(time, calendar);
			const tail = timeEnd === null ? "" : ` – ${this.plugin.universe.formatTime(timeEnd, calendar)}`;
			const prefix = uncertain ? `~ ` : "";
			text = `${prefix}${head}${tail}`;

			if (this.plugin.settings.showEarthTime) {
				const earth = asNumberOrNull(frontmatter["earth-time"]) ?? this.plugin.universe.toEarthTime(time, calendar);
				if (earth !== null) text += `  (${this.plugin.i18n.t("time.earth")} ${earth})`;
			}
		}

		const timeButton = rowEl.createEl("button", {
			cls: "plc-banner-timevalue",
			text,
			attr: { "aria-label": this.plugin.i18n.t("banner.editTime") },
		});
		timeButton.addEventListener("click", () => this.pickTime(file, frontmatter));
	}

	private pickIcon(file: TFile, current: IconChoice) {
		new IconPickerModal(this.plugin.app, this.plugin.i18n, current, (choice) => {
			void this.plugin.app.fileManager.processFrontMatter(file, (frontmatter) => {
				if (choice === null) {
					delete frontmatter.icon;
					delete frontmatter["icon-type"];
					return;
				}
				frontmatter.icon = choice.icon;
				frontmatter["icon-type"] = choice.iconType;
			});
		}).open();
	}

	private async cycleStatus(file: TFile, current: Status) {
		const next = STATUSES[(STATUSES.indexOf(current) + 1) % STATUSES.length];
		await this.plugin.app.fileManager.processFrontMatter(file, (frontmatter) => {
			frontmatter.status = next;
		});
		new Notice(this.plugin.i18n.t(`status.${next}`));
	}

	private pickTime(file: TFile, frontmatter: Record<string, unknown>) {
		const precisionRaw = frontmatter["time-precision"];
		const current: TimeValue = {
			time: asNumberOrNull(frontmatter.time),
			timeEnd: asNumberOrNull(frontmatter["time-end"]),
			precision: isTimePrecision(precisionRaw) ? precisionRaw : "year",
			label: asString(frontmatter["time-label"]),
			uncertain: frontmatter["time-uncertain"] === true,
		};

		new TimePickerModal(
			this.plugin.app,
			this.plugin.i18n,
			this.plugin.universe,
			this.plugin.language,
			current,
			(value) => {
				void this.plugin.app.fileManager.processFrontMatter(file, (target) => {
					if (value.time === null) {
						delete target.time;
						delete target["time-end"];
						delete target["time-label"];
						delete target["time-uncertain"];
						return;
					}
					target.time = value.time;
					target["time-precision"] = value.precision;
					target["time-label"] = value.label;
					target["time-uncertain"] = value.uncertain;

					if (value.timeEnd === null) {
						delete target["time-end"];
					} else {
						target["time-end"] = value.timeEnd;
					}
				});
			},
		).open();
	}
}
