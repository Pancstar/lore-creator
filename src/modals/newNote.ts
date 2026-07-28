import { App, Modal, Notice, Setting, normalizePath, setIcon } from "obsidian";
import type LorePlugin from "../main";
import type { TypeDefinition } from "../types";
import { buildNoteContent, ensureFolder, sanitiseFileName } from "../noteFactory";
import { IconChoice, IconPickerModal } from "./iconPicker";

/**
 * Creates a lore note from its type's template, filling in the fields the
 * author would otherwise have to type by hand every time.
 */
export class NewNoteModal extends Modal {
	private typeId: string;
	private title = "";
	private icon: IconChoice | null = null;
	private iconButton: HTMLButtonElement | null = null;
	private folderEl: HTMLElement | null = null;

	constructor(
		app: App,
		private plugin: LorePlugin,
	) {
		super(app);
		this.typeId = this.plugin.types.creatable()[0]?.id ?? "story";
	}

	private get type(): TypeDefinition | undefined {
		return this.plugin.types.byId(this.typeId);
	}

	onOpen() {
		const t = (key: string, ...args: string[]) => this.plugin.i18n.t(key, ...args);
		this.titleEl.setText(t("new.title"));

		new Setting(this.contentEl).setName(t("new.type")).addDropdown((dropdown) => {
			for (const type of this.plugin.types.creatable()) {
				dropdown.addOption(type.id, this.plugin.types.label(type, this.plugin.language));
			}
			dropdown.setValue(this.typeId).onChange((value) => {
				this.typeId = value;
				this.icon = null;
				this.refreshIcon();
				this.refreshFolder();
			});
		});

		new Setting(this.contentEl).setName(t("new.name")).addText((text) => {
			text.setPlaceholder(t("new.namePlaceholder")).onChange((value) => {
				this.title = value;
			});
			text.inputEl.addEventListener("keydown", (event) => {
				if (event.key === "Enter") {
					event.preventDefault();
					void this.create();
				}
			});
			window.setTimeout(() => text.inputEl.focus(), 0);
		});

		new Setting(this.contentEl).setName(t("new.icon")).addButton((button) => {
			this.iconButton = button.buttonEl;
			button.onClick(() => {
				new IconPickerModal(this.app, this.plugin.i18n, this.icon, (choice) => {
					this.icon = choice;
					this.refreshIcon();
				}).open();
			});
		});
		this.refreshIcon();

		this.folderEl = this.contentEl.createEl("p", { cls: "plc-preview" });
		this.refreshFolder();

		new Setting(this.contentEl).addButton((button) =>
			button
				.setButtonText(t("new.create"))
				.setCta()
				.onClick(() => void this.create()),
		);
	}

	/** Falls back to the type's default icon so the button is never blank. */
	private refreshIcon() {
		if (!this.iconButton) return;
		this.iconButton.empty();
		const choice = this.icon;

		if (choice?.iconType === "lucide") {
			setIcon(this.iconButton, choice.icon);
			return;
		}
		this.iconButton.setText(choice?.icon || this.type?.icon || "❔");
	}

	private refreshFolder() {
		if (!this.folderEl) return;
		this.folderEl.setText(`${this.plugin.i18n.t("new.folder")}: ${this.targetFolder() || "/"}`);
	}

	private targetFolder(): string {
		return this.type?.folder?.trim() ?? "";
	}

	private async create() {
		const t = (key: string, ...args: string[]) => this.plugin.i18n.t(key, ...args);
		const type = this.type;
		const title = sanitiseFileName(this.title);

		if (!type) return;
		if (!title) {
			new Notice(t("new.nameRequired"));
			return;
		}

		const folder = this.targetFolder();
		const path = normalizePath(folder ? `${folder}/${title}.md` : `${title}.md`);

		if (this.app.vault.getFileByPath(path)) {
			new Notice(t("new.exists", path));
			return;
		}

		try {
			await ensureFolder(this.app, folder);
			const content = await buildNoteContent(this.app, this.plugin.settings.templatesFolder, {
				type,
				title,
				icon: this.icon?.icon || type.icon,
				iconType: this.icon?.iconType ?? "emoji",
			});
			const file = await this.app.vault.create(path, content);
			await this.app.workspace.getLeaf(false).openFile(file);
			this.close();
		} catch (error) {
			console.error("PancstaR Lore Creator: could not create note", error);
			new Notice(t("new.failed"));
		}
	}

	onClose() {
		this.contentEl.empty();
	}
}
