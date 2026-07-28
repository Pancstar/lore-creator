import { App, TFile, normalizePath } from "obsidian";
import { linkTarget } from "../links";
import { asString } from "../frontmatter";

export interface VersionInfo {
	number: number;
	name: string;
	note: string;
}

export interface VersionEntry extends VersionInfo {
	file: TFile;
	/** True for the note sitting at its real path rather than in the archive. */
	active: boolean;
}

export class VersionError extends Error {}

/** Version ids are written as `v3`; anything else counts as the first version. */
function parseNumber(value: unknown): number {
	const text = asString(value).trim();
	const match = text.match(/^v?(\d+)$/i);
	return match ? Number.parseInt(match[1], 10) : 1;
}

/**
 * Keeps the active version at the note's real path and older ones in an archive
 * folder. Links elsewhere in the vault always point at the active version, so
 * switching versions never leaves a dangling `[[link]]` behind.
 */
export class VersionStore {
	constructor(
		private app: App,
		private versionsFolder: string,
	) {}

	setFolder(folder: string) {
		this.versionsFolder = folder;
	}

	private frontmatter(file: TFile): Record<string, unknown> {
		return this.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
	}

	info(file: TFile): VersionInfo {
		const frontmatter = this.frontmatter(file);
		return {
			number: parseNumber(frontmatter.version),
			name: asString(frontmatter["version-name"]),
			note: asString(frontmatter["version-note"]),
		};
	}

	isArchived(file: TFile): boolean {
		return Boolean(this.frontmatter(file)["version-of"]);
	}

	/** The live note an archived version belongs to. */
	activeFileFor(file: TFile): TFile | null {
		const frontmatter = this.frontmatter(file);
		const target = linkTarget(frontmatter["version-of"]);
		if (!target) return file;
		return this.app.metadataCache.getFirstLinkpathDest(target, file.path);
	}

	/**
	 * Archives are discovered by following `version-of` rather than by reading a
	 * list off the active note, so the two can never drift apart.
	 */
	archivesOf(active: TFile): TFile[] {
		const archives: TFile[] = [];

		for (const file of this.app.vault.getMarkdownFiles()) {
			const target = linkTarget(this.frontmatter(file)["version-of"]);
			if (!target) continue;
			if (this.app.metadataCache.getFirstLinkpathDest(target, file.path)?.path === active.path) {
				archives.push(file);
			}
		}
		return archives;
	}

	list(file: TFile): VersionEntry[] {
		const active = this.activeFileFor(file) ?? file;
		const entries: VersionEntry[] = [{ file: active, active: true, ...this.info(active) }];

		for (const archive of this.archivesOf(active)) {
			entries.push({ file: archive, active: false, ...this.info(archive) });
		}

		entries.sort((a, b) => a.number - b.number);
		return entries;
	}

	hasMultiple(file: TFile): boolean {
		return this.list(file).length > 1;
	}

	private archivePath(baseName: string, info: VersionInfo): string {
		const suffix = info.name.trim() ? ` ${info.name.trim()}` : "";
		return normalizePath(`${this.versionsFolder}/${baseName} — v${info.number}${suffix}.md`);
	}

	private async ensureFolder() {
		const folder = normalizePath(this.versionsFolder);
		if (!this.app.vault.getFolderByPath(folder)) {
			await this.app.vault.createFolder(folder);
		}
	}

	/** Describes what `createVersion` would do, for the confirmation dialog. */
	previewCreate(active: TFile): { archivePath: string; nextNumber: number } {
		const info = this.info(active);
		const highest = this.list(active).reduce((max, entry) => Math.max(max, entry.number), 0);
		return { archivePath: this.archivePath(active.basename, info), nextNumber: highest + 1 };
	}

	/**
	 * Files the current content into the archive and leaves a copy at the note's
	 * own path as the next version, so the author edits forward from what they
	 * already had rather than starting from a blank note.
	 */
	async createVersion(active: TFile, name: string, note: string): Promise<void> {
		if (this.isArchived(active)) {
			throw new VersionError("archived");
		}

		const { archivePath, nextNumber } = this.previewCreate(active);
		if (this.app.vault.getFileByPath(archivePath)) {
			throw new VersionError(archivePath);
		}

		const content = await this.app.vault.read(active);
		const previous = this.info(active);

		await this.ensureFolder();
		const archive = await this.app.vault.create(archivePath, content);

		await this.app.fileManager.processFrontMatter(archive, (frontmatter: Record<string, unknown>) => {
			frontmatter.version = `v${previous.number}`;
			frontmatter["version-of"] = `[[${active.basename}]]`;
			if (previous.name) frontmatter["version-name"] = previous.name;
			if (previous.note) frontmatter["version-note"] = previous.note;
		});

		await this.app.fileManager.processFrontMatter(active, (frontmatter: Record<string, unknown>) => {
			frontmatter.version = `v${nextNumber}`;
			delete frontmatter["version-of"];
			if (name.trim()) {
				frontmatter["version-name"] = name.trim();
			} else {
				delete frontmatter["version-name"];
			}
			if (note.trim()) {
				frontmatter["version-note"] = note.trim();
			} else {
				delete frontmatter["version-note"];
			}
		});
	}

	/** Describes what `switchTo` would do, for the confirmation dialog. */
	previewSwitch(active: TFile, target: TFile): { archivePath: string } {
		return { archivePath: this.archivePath(active.basename, this.info(active)) };
	}

	/**
	 * Swaps an archived version into the note's real path. Ordered so the current
	 * content is safely on disk in its new home before anything overwrites it:
	 * a failure partway through leaves a duplicate, never a hole.
	 */
	async switchTo(active: TFile, target: TFile): Promise<void> {
		if (target.path === active.path) return;

		const archivePath = this.archivePath(active.basename, this.info(active));
		if (this.app.vault.getFileByPath(archivePath)) {
			throw new VersionError(archivePath);
		}

		const activeContent = await this.app.vault.read(active);
		const targetContent = await this.app.vault.read(target);
		const activeInfo = this.info(active);

		await this.ensureFolder();
		const archive = await this.app.vault.create(archivePath, activeContent);
		await this.app.fileManager.processFrontMatter(archive, (frontmatter: Record<string, unknown>) => {
			frontmatter.version = `v${activeInfo.number}`;
			frontmatter["version-of"] = `[[${active.basename}]]`;
		});

		await this.app.vault.process(active, () => targetContent);
		await this.app.fileManager.processFrontMatter(active, (frontmatter: Record<string, unknown>) => {
			delete frontmatter["version-of"];
		});

		await this.app.fileManager.trashFile(target);
	}

	async rename(file: TFile, name: string, note: string): Promise<void> {
		await this.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
			if (name.trim()) {
				frontmatter["version-name"] = name.trim();
			} else {
				delete frontmatter["version-name"];
			}
			if (note.trim()) {
				frontmatter["version-note"] = note.trim();
			} else {
				delete frontmatter["version-note"];
			}
		});
	}

	/** Only ever called on archives, and only behind an explicit confirmation. */
	async deleteVersion(archive: TFile): Promise<void> {
		if (!this.isArchived(archive)) {
			throw new VersionError("active");
		}
		await this.app.fileManager.trashFile(archive);
	}

	label(entry: VersionEntry): string {
		const name = entry.name.trim();
		return name ? `v${entry.number} · ${name}` : `v${entry.number}`;
	}
}
