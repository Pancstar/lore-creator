import { App, Modal, Notice, Setting, TFile, normalizePath } from "obsidian";
import type LorePlugin from "../main";
import { buildNoteContent, ensureFolder, extractBody, sanitiseFileName } from "../noteFactory";

type BodyMode = "keep" | "move";

/**
 * Turns a sketch into a real note. The draft is never deleted — it either stays
 * put as inspiration or hands its text over, and either way the two notes keep
 * pointing at each other.
 */
export class PromoteModal extends Modal {
	private typeId: string;
	private title: string;
	private folder: string;
	private bodyMode: BodyMode = "keep";
	private folderInput: HTMLInputElement | null = null;

	constructor(
		app: App,
		private plugin: LorePlugin,
		private draft: TFile,
	) {
		super(app);
		const first = this.plugin.types.creatable().find((type) => type.id !== "draft");
		this.typeId = this.suggestedType() ?? first?.id ?? "story";
		this.title = draft.basename;
		this.folder = this.plugin.types.byId(this.typeId)?.folder ?? "";
	}

	/** Drafts can name what they are an idea for; use it when it matches a type. */
	private suggestedType(): string | null {
		const frontmatter = this.app.metadataCache.getFileCache(this.draft)?.frontmatter;
		const raw = typeof frontmatter?.["idea-for"] === "string" ? frontmatter["idea-for"].trim() : "";
		if (!raw) return null;

		const needle = raw.toLocaleLowerCase("tr");
		const match = this.plugin.types
			.creatable()
			.find(
				(type) =>
					type.id === needle ||
					type.tr.toLocaleLowerCase("tr") === needle ||
					type.en.toLowerCase() === needle.toLowerCase(),
			);
		return match?.id ?? null;
	}

	onOpen() {
		const t = (key: string, ...args: string[]) => this.plugin.i18n.t(key, ...args);
		this.titleEl.setText(t("promote.title"));

		new Setting(this.contentEl).setName(t("promote.type")).addDropdown((dropdown) => {
			for (const type of this.plugin.types.creatable()) {
				if (type.id === "draft") continue;
				dropdown.addOption(type.id, this.plugin.types.label(type, this.plugin.language));
			}
			dropdown.setValue(this.typeId).onChange((value) => {
				this.typeId = value;
				this.folder = this.plugin.types.byId(value)?.folder ?? "";
				if (this.folderInput) this.folderInput.value = this.folder;
			});
		});

		new Setting(this.contentEl).setName(t("promote.name")).addText((text) =>
			text.setValue(this.title).onChange((value) => {
				this.title = value;
			}),
		);

		new Setting(this.contentEl)
			.setName(t("promote.folder"))
			.setDesc(t("promote.folder.desc"))
			.addText((text) => {
				this.folderInput = text.inputEl;
				text.setValue(this.folder).onChange((value) => {
					this.folder = value.trim();
				});
			});

		new Setting(this.contentEl)
			.setName(t("promote.body"))
			.setDesc(t("promote.body.desc"))
			.addDropdown((dropdown) =>
				dropdown
					.addOption("keep", t("promote.body.keep"))
					.addOption("move", t("promote.body.move"))
					.setValue(this.bodyMode)
					.onChange((value) => {
						this.bodyMode = value as BodyMode;
					}),
			);

		new Setting(this.contentEl).addButton((button) =>
			button
				.setButtonText(t("promote.confirm"))
				.setCta()
				.onClick(() => void this.run()),
		);
	}

	private async run() {
		const t = (key: string, ...args: string[]) => this.plugin.i18n.t(key, ...args);
		const type = this.plugin.types.byId(this.typeId);
		const title = sanitiseFileName(this.title);

		if (!type) return;
		if (!title) {
			new Notice(t("new.nameRequired"));
			return;
		}

		const path = normalizePath(this.folder ? `${this.folder}/${title}.md` : `${title}.md`);
		if (this.app.vault.getFileByPath(path)) {
			new Notice(t("new.exists", path));
			return;
		}

		try {
			const draftContent = await this.app.vault.read(this.draft);
			const draftFrontmatter = this.app.metadataCache.getFileCache(this.draft)?.frontmatter;
			const icon = typeof draftFrontmatter?.icon === "string" ? draftFrontmatter.icon : "";
			const iconType = draftFrontmatter?.["icon-type"] === "lucide" ? "lucide" : "emoji";

			await ensureFolder(this.app, this.folder);
			const content = await buildNoteContent(this.app, this.plugin.settings.templatesFolder, {
				type,
				title,
				icon: icon || type.icon,
				iconType,
				body: extractBody(draftContent),
				extra: { "promoted-from": `"[[${this.draft.basename}]]"` },
			});

			const created = await this.app.vault.create(path, content);

			await this.app.fileManager.processFrontMatter(this.draft, (frontmatter: Record<string, unknown>) => {
				frontmatter["promoted-to"] = `[[${title}]]`;
			});

			if (this.bodyMode === "move") {
				await this.emptyDraft(title);
			}

			await this.app.workspace.getLeaf(false).openFile(created);
			new Notice(t("promote.done", title));
			this.close();
		} catch (error) {
			console.error("Lore Creator: could not promote draft", error);
			new Notice(t("promote.failed"));
		}
	}

	/** Leaves the draft in place with a pointer, rather than removing the note. */
	private async emptyDraft(title: string) {
		const notice = this.plugin.i18n.t("promote.movedNotice", title);

		await this.app.vault.process(this.draft, (current) => {
			const match = current.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
			const frontmatter = match ? match[0] : "";
			return `${frontmatter}# ${this.draft.basename}\n\n${notice}\n`;
		});
	}

	onClose() {
		this.contentEl.empty();
	}
}
