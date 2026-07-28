import { App, Modal, getIconIds, setIcon } from "obsidian";
import { EMOJI_CATEGORIES, searchEmoji } from "../emoji";
import type { I18n } from "../i18n";

export interface IconChoice {
	icon: string;
	iconType: "emoji" | "lucide";
}

type Tab = "emoji" | "lucide";

/**
 * Two-tab picker: a curated emoji set, plus whatever Lucide icons the running
 * Obsidian version ships — the latter costs nothing to offer since they are
 * already bundled with the app.
 */
export class IconPickerModal extends Modal {
	private tab: Tab = "emoji";
	private query = "";
	private resultsEl!: HTMLElement;
	private lucideIds: string[] = [];

	constructor(
		app: App,
		private i18n: I18n,
		private current: IconChoice | null,
		private onChoose: (choice: IconChoice | null) => void,
	) {
		super(app);
	}

	onOpen() {
		const { contentEl, titleEl } = this;
		titleEl.setText(this.i18n.t("icon.title"));
		contentEl.addClass("plc-icon-picker");

		this.tab = this.current?.iconType === "lucide" ? "lucide" : "emoji";
		this.lucideIds = getIconIds();

		const tabsEl = contentEl.createDiv({ cls: "plc-icon-tabs" });
		const emojiTab = tabsEl.createEl("button", { text: this.i18n.t("icon.emoji") });
		const lucideTab = tabsEl.createEl("button", { text: this.i18n.t("icon.lucide") });

		const syncTabs = () => {
			emojiTab.toggleClass("is-active", this.tab === "emoji");
			lucideTab.toggleClass("is-active", this.tab === "lucide");
		};

		emojiTab.addEventListener("click", () => {
			this.tab = "emoji";
			syncTabs();
			this.renderResults();
		});
		lucideTab.addEventListener("click", () => {
			this.tab = "lucide";
			syncTabs();
			this.renderResults();
		});
		syncTabs();

		const searchEl = contentEl.createEl("input", {
			type: "text",
			cls: "plc-icon-search",
			attr: { placeholder: this.i18n.t("icon.search") },
		});
		searchEl.addEventListener("input", () => {
			this.query = searchEl.value;
			this.renderResults();
		});

		this.resultsEl = contentEl.createDiv({ cls: "plc-icon-results" });
		this.renderResults();

		const footerEl = contentEl.createDiv({ cls: "plc-icon-footer" });
		const clearButton = footerEl.createEl("button", { text: this.i18n.t("icon.clear") });
		clearButton.addEventListener("click", () => {
			this.onChoose(null);
			this.close();
		});

		window.setTimeout(() => searchEl.focus(), 0);
	}

	private renderResults() {
		this.resultsEl.empty();
		if (this.tab === "emoji") {
			this.renderEmoji();
		} else {
			this.renderLucide();
		}
	}

	private renderEmoji() {
		const needle = this.query.trim().toLowerCase();

		if (needle) {
			const matches = searchEmoji(needle);
			if (matches.length === 0) {
				this.resultsEl.createEl("p", { text: this.i18n.t("icon.noResults"), cls: "plc-icon-empty" });
				return;
			}
			const gridEl = this.resultsEl.createDiv({ cls: "plc-icon-grid" });
			for (const entry of matches) {
				this.addEmojiButton(gridEl, entry.char, entry.en);
			}
			return;
		}

		const language = this.i18n.t("icon.lang") === "tr" ? "tr" : "en";
		for (const category of EMOJI_CATEGORIES) {
			this.resultsEl.createEl("h4", {
				text: language === "tr" ? category.tr : category.en,
				cls: "plc-icon-category",
			});
			const gridEl = this.resultsEl.createDiv({ cls: "plc-icon-grid" });
			for (const entry of category.entries) {
				this.addEmojiButton(gridEl, entry.char, entry.en);
			}
		}
	}

	private addEmojiButton(parent: HTMLElement, char: string, tooltip: string) {
		const button = parent.createEl("button", {
			cls: "plc-icon-cell",
			text: char,
			attr: { "aria-label": tooltip, title: tooltip },
		});
		if (this.current?.iconType === "emoji" && this.current.icon === char) {
			button.addClass("is-current");
		}
		button.addEventListener("click", () => {
			this.onChoose({ icon: char, iconType: "emoji" });
			this.close();
		});
	}

	private renderLucide() {
		const needle = this.query.trim().toLowerCase();
		const matches = needle
			? this.lucideIds.filter((id) => id.toLowerCase().includes(needle))
			: this.lucideIds;

		if (matches.length === 0) {
			this.resultsEl.createEl("p", { text: this.i18n.t("icon.noResults"), cls: "plc-icon-empty" });
			return;
		}

		// The full Lucide set runs to a couple of thousand icons; render a slice
		// so opening the picker stays instant and let search narrow it down.
		const shown = matches.slice(0, 400);
		const gridEl = this.resultsEl.createDiv({ cls: "plc-icon-grid" });
		for (const id of shown) {
			const button = gridEl.createEl("button", {
				cls: "plc-icon-cell",
				attr: { "aria-label": id, title: id },
			});
			setIcon(button, id);
			if (this.current?.iconType === "lucide" && this.current.icon === id) {
				button.addClass("is-current");
			}
			button.addEventListener("click", () => {
				this.onChoose({ icon: id, iconType: "lucide" });
				this.close();
			});
		}

		if (matches.length > shown.length) {
			this.resultsEl.createEl("p", {
				text: this.i18n.t("icon.more", String(matches.length - shown.length)),
				cls: "plc-icon-empty",
			});
		}
	}

	onClose() {
		this.contentEl.empty();
	}
}
