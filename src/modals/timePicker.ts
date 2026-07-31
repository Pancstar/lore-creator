import { App, Modal, Setting } from "obsidian";
import type { I18n } from "../i18n";
import type { Universe } from "../universe";
import {
	EMPTY_PARTS,
	TimeParts,
	TimePrecision,
	formatLabel,
	partsToTime,
	timeToParts,
} from "../time";

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
			setting.addText((text) =>
				text
					.setPlaceholder(this.i18n.t("time.day"))
					.setValue(String(parts.day))
					.onChange((value) => {
						const parsed = Number.parseInt(value, 10);
						if (!Number.isFinite(parsed)) return;
						parts.day = parsed;
						this.syncLabel();
					}),
			);
		}

		if (this.precision === "datetime") {
			setting.addText((text) =>
				text
					.setPlaceholder(this.i18n.t("time.hour"))
					.setValue(String(parts.hour))
					.onChange((value) => {
						const parsed = Number.parseInt(value, 10);
						if (!Number.isFinite(parsed)) return;
						parts.hour = Math.min(23, Math.max(0, parsed));
						this.syncLabel();
					}),
			);
			setting.addText((text) =>
				text
					.setPlaceholder(this.i18n.t("time.minute"))
					.setValue(String(parts.minute))
					.onChange((value) => {
						const parsed = Number.parseInt(value, 10);
						if (!Number.isFinite(parsed)) return;
						parts.minute = Math.min(59, Math.max(0, parsed));
						this.syncLabel();
					}),
			);
		}
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
		this.previewEl.setText(`time: ${time}${earthPart}`);
	}

	private submit() {
		const timeSystem = this.universe.readTime();
		this.onSubmit({
			time: partsToTime(this.start, timeSystem, this.precision),
			timeEnd: this.end ? partsToTime(this.end, timeSystem, this.precision) : null,
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
