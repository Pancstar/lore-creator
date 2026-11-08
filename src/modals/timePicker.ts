import { App, Modal, Notice, Setting } from "obsidian";
import type { I18n } from "../i18n";
import type { Universe } from "../universe";
import {
	EMPTY_PARTS,
	TimeParts,
	TimePrecision,
	daysPerYear,
	formatLabel,
	formatTime,
	partsToTime,
	timeToParts,
} from "../time";
import { enterSubmits } from "./enterSubmits";

export interface TimeValue {
	time: number | null;
	timeEnd: number | null;
	precision: TimePrecision;
	label: string;
	uncertain: boolean;
}

/**
 * Lets the author think in the universe's own time system while the note keeps
 * the single sortable number the timeline needs. The label is generated but
 * stays editable, since no generated string beats what the author wants
 * readers to see.
 */
export class TimePickerModal extends Modal {
	private precision: TimePrecision;
	private start: TimeParts;
	private end: TimeParts | null;
	private label: string;
	private labelTouched: boolean;
	private uncertain: boolean;

	private bodyEl!: HTMLElement;
	private labelInput: HTMLInputElement | null = null;
	private previewEl: HTMLElement | null = null;

	constructor(
		app: App,
		private i18n: I18n,
		private universe: Universe,
		private language: "tr" | "en",
		current: TimeValue,
		private onSubmit: (value: TimeValue) => void,
		/** Lets the author fix the calendar itself from where they meet it. */
		private onEditSystem?: () => void,
	) {
		super(app);
		const time = this.universe.readTime();

		this.precision = current.precision;
		this.start =
			current.time === null ? { ...EMPTY_PARTS } : timeToParts(current.time, time, current.precision);
		this.end =
			current.timeEnd === null ? null : timeToParts(current.timeEnd, time, current.precision);
		this.label = current.label;
		this.labelTouched = current.label.length > 0;
		this.uncertain = current.uncertain;
	}

	onOpen() {
		enterSubmits(this.contentEl);
		this.titleEl.setText(this.i18n.t("time.title"));
		this.contentEl.addClass("plc-time-picker");

		new Setting(this.contentEl)
			.setName(this.i18n.t("time.precision"))
			.setDesc(this.i18n.t("time.precision.desc"))
			.addDropdown((dropdown) =>
				dropdown
					.addOption("year", this.i18n.t("time.precision.year"))
					.addOption("date", this.i18n.t("time.precision.date"))
					.addOption("datetime", this.i18n.t("time.precision.datetime"))
					.setValue(this.precision)
					.onChange((value) => {
						this.precision = value as TimePrecision;
						this.renderBody();
					}),
			);

		this.bodyEl = this.contentEl.createDiv();
		this.renderBody();

		new Setting(this.contentEl).addButton((button) =>
			button
				.setButtonText(this.i18n.t("time.clear"))
				.onClick(() => {
					this.onSubmit({
						time: null,
						timeEnd: null,
						precision: this.precision,
						label: "",
						uncertain: false,
					});
					this.close();
				}),
		);

		new Setting(this.contentEl).addButton((button) =>
			button
				.setButtonText(this.i18n.t("time.save"))
				.setCta()
				.onClick(() => this.submit()),
		);
	}

	private renderBody() {
		this.bodyEl.empty();
		const timeSystem = this.universe.readTime();

		this.addPartsRow(this.i18n.t("time.start"), this.start);

		new Setting(this.bodyEl)
			.setName(this.i18n.t("time.hasEnd"))
			.setDesc(this.i18n.t("time.hasEnd.desc"))
			.addToggle((toggle) =>
				toggle.setValue(this.end !== null).onChange((value) => {
					this.end = value ? { ...this.start } : null;
					this.renderBody();
				}),
			);

		if (this.end) {
			this.addPartsRow(this.i18n.t("time.end"), this.end);
		}

		new Setting(this.bodyEl)
			.setName(this.i18n.t("time.uncertain"))
			.setDesc(this.i18n.t("time.uncertain.desc"))
			.addToggle((toggle) =>
				toggle.setValue(this.uncertain).onChange((value) => {
					this.uncertain = value;
				}),
			);

		new Setting(this.bodyEl)
			.setName(this.i18n.t("time.label"))
			.setDesc(this.i18n.t("time.label.desc"))
			.addText((text) => {
				this.labelInput = text.inputEl;
				text
					.setValue(this.label || formatLabel(this.start, timeSystem, this.precision, this.language))
					.onChange((value) => {
						this.label = value;
						// Once the author edits the label, stop overwriting it.
						this.labelTouched = true;
					});
			});

		this.previewEl = this.bodyEl.createEl("p", { cls: "plc-preview" });
		this.refreshPreview();

		const onEditSystem = this.onEditSystem;
		if (onEditSystem) {
			const link = this.bodyEl.createEl("button", { cls: "plc-link-button", text: this.i18n.t("time.editSystem") });
			link.addEventListener("click", () => {
				this.close();
				onEditSystem();
			});
		}
	}

	private addPartsRow(name: string, parts: TimeParts) {
		const timeSystem = this.universe.readTime();
		const unit = timeSystem.timeUnit.trim() || this.i18n.t("time.year");

		const setting = new Setting(this.bodyEl).setName(name);

		setting.addText((text) =>
			text
				.setPlaceholder(unit)
				.setValue(String(parts.year))
				.onChange((value) => {
					const parsed = Number.parseFloat(value);
					if (!Number.isFinite(parsed)) return;
					parts.year = parsed;
					this.syncLabel();
				}),
		);

		if (this.precision !== "year") {
			this.addClampedField(setting, parts, "day", this.i18n.t("time.day"), 1, daysPerYear(timeSystem));
		}

		if (this.precision === "datetime") {
			this.addClampedField(setting, parts, "hour", this.i18n.t("time.hour"), 0, 23);
			this.addClampedField(setting, parts, "minute", this.i18n.t("time.minute"), 0, 59);
		}
	}

	/**
	 * An integer field kept inside `[min, max]`. The state is clamped on every
	 * keystroke; the box itself is corrected on blur so typing is not fought.
	 */
	private addClampedField(
		setting: Setting,
		parts: TimeParts,
		key: "day" | "hour" | "minute",
		placeholder: string,
		min: number,
		max: number,
	) {
		setting.addText((text) => {
			text
				.setPlaceholder(placeholder)
				.setValue(String(parts[key]))
				.onChange((value) => {
					const parsed = Number.parseInt(value, 10);
					if (!Number.isFinite(parsed)) return;
					parts[key] = Math.min(max, Math.max(min, parsed));
					this.syncLabel();
				});
			text.inputEl.addEventListener("blur", () => {
				text.setValue(String(parts[key]));
			});
		});
	}

	private syncLabel() {
		const timeSystem = this.universe.readTime();
		if (!this.labelTouched && this.labelInput) {
			this.label = formatLabel(this.start, timeSystem, this.precision, this.language);
			this.labelInput.value = this.label;
		}
		this.refreshPreview();
	}

	/** Shows the stored number and Earth reference, so surprises surface here. */
	private refreshPreview() {
		if (!this.previewEl) return;
		const timeSystem = this.universe.readTime();
		const time = partsToTime(this.start, timeSystem, this.precision);
		const earth = this.universe.toEarthTime(time, timeSystem);
		const earthPart = earth === null ? "" : ` · ${this.i18n.t("time.earth")} ${earth}`;
		const readable = formatTime(time, timeSystem, this.precision, this.language);
		this.previewEl.setText(`${readable} (${time})${earthPart}`);
	}

	private submit() {
		const timeSystem = this.universe.readTime();
		const start = partsToTime(this.start, timeSystem, this.precision);
		const end = this.end ? partsToTime(this.end, timeSystem, this.precision) : null;

		if (end !== null && end < start) {
			new Notice(this.i18n.t("time.error.endBeforeStart"));
			return;
		}

		this.onSubmit({
			time: start,
			timeEnd: end,
			precision: this.precision,
			label: this.label,
			uncertain: this.uncertain,
		});
		this.close();
	}

	onClose() {
		this.contentEl.empty();
	}
}
