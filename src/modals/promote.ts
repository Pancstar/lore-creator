import { App, Modal, Notice, Setting, TFile, normalizePath } from "obsidian";
import type LorePlugin from "../main";
import { buildNoteContent, ensureFolder, extractBody, sanitiseFileName } from "../noteFactory";
import { enterSubmits } from "./enterSubmits";
import { linkTo } from "../links";
import { ConfirmModal } from "./confirm";
import type { TypeDefinition } from "../types";

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
	/** Set while a promotion runs, so a second click cannot start another. */
	private busy = false;
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
		enterSubmits(this.contentEl);
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

		if (!type) {
			// The type was removed from the registry while the dialog was open.
			new Notice(t("promote.noType", this.typeId || "—"));
			return;
		}
		if (!title) {
			new Notice(t("new.nameRequired"));
			return;
		}

		const path = normalizePath(this.folder ? `${this.folder}/${title}.md` : `${title}.md`);
		if (this.app.vault.getFileByPath(path)) {
			new Notice(t("new.exists", path));
			return;
		}

		if (this.bodyMode === "move") {
			// Moving empties the draft's text, so it is spelled out and confirmed first.
			new ConfirmModal(
				this.app,
				{
					title: t("promote.move.title"),
					body: t("promote.move.body", this.draft.basename, path),
					confirmLabel: t("promote.confirm"),
					cancelLabel: t("common.cancel"),
					destructive: true,
				},
				() => void this.promote(type, title, path),
			).open();
			return;
		}
		await this.promote(type, title, path);
	}

	private async promote(type: TypeDefinition, title: string, path: string) {
		const t = (key: string, ...args: string[]) => this.plugin.i18n.t(key, ...args);
		// One promotion per dialog: a second click would only fail on the
		// note the first one just created.
		if (this.busy) return;
		this.busy = true;
		const folder = this.folder;
		const move = this.bodyMode === "move";
		try {
			const draftContent = await this.app.vault.read(this.draft);
			const draftFrontmatter = this.app.metadataCache.getFileCache(this.draft)?.frontmatter;
			const icon = typeof draftFrontmatter?.icon === "string" ? draftFrontmatter.icon : "";
			const iconType = draftFrontmatter?.["icon-type"] === "lucide" ? "lucide" : "emoji";

			await ensureFolder(this.app, folder);
			const content = await buildNoteContent(this.app, this.plugin.settings.templatesFolder, {
				type,
				title,
				icon: icon || type.icon,
				iconType,
				body: extractBody(draftContent),
			});

			const created = await this.app.vault.create(path, content);

			// Both links are written once both notes exist: the new note usually
			// shares the draft's name, and only then can Obsidian tell them apart.
			await this.app.fileManager.processFrontMatter(created, (frontmatter: Record<string, unknown>) => {
				frontmatter["promoted-from"] = linkTo(this.app, this.draft, created.path);
			});
			await this.app.fileManager.processFrontMatter(this.draft, (frontmatter: Record<string, unknown>) => {
				frontmatter["promoted-to"] = linkTo(this.app, created, this.draft.path);
			});

			if (move) {
				await this.emptyDraft(linkTo(this.app, created, this.draft.path).slice(2, -2));
			}

			await this.app.workspace.getLeaf(false).openFile(created);
			new Notice(t("promote.done", title));
			this.close();
		} catch (error) {
			console.error("Lore Creator: could not promote draft", error);
			new Notice(t("promote.failed"));
		} finally {
			this.busy = false;
		}
	}

	/** Leaves the draft in place with a pointer, rather than removing the note. */
	private async emptyDraft(linkText: string) {
		const notice = this.plugin.i18n.t("promote.movedNotice", linkText);

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
