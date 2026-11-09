import { App, Component, MarkdownRenderer, TFile, arrayBufferToBase64 } from "obsidian";
import { linkPath } from "../links";

const IMAGE_TYPES: Record<string, string> = {
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	gif: "image/gif",
	webp: "image/webp",
	svg: "image/svg+xml",
	bmp: "image/bmp",
	avif: "image/avif",
};

export function isImage(file: TFile): boolean {
	return file.extension.toLowerCase() in IMAGE_TYPES;
}

/** An image as a `data:` URI, so a single-page book carries its pictures with it. */
export async function imageDataUri(app: App, file: TFile): Promise<string> {
	const type = IMAGE_TYPES[file.extension.toLowerCase()] ?? "application/octet-stream";
	return `data:${type};base64,${arrayBufferToBase64(await app.vault.readBinary(file))}`;
}

export interface RenderTarget {
	/** Where a link to this note points in the output, or null when the note is not exported. */
	hrefFor(path: string): string | null;
	/** The `src` an embedded image gets in the output. */
	imageSrc(file: TFile): Promise<string>;
}

export interface RenderedNote {
	html: string;
	/** Exported notes this note links to, for the wiki's "linked from" lists. */
	links: string[];
}

/** Pointers into this app (`app://`, `capacitor://`) that would show nothing anywhere else. */
const LOCAL_SOURCE = /^(app|capacitor):/i;

/**
 * A note's text as HTML for the book or the wiki, rendered by Obsidian itself.
 *
 * - Links to exported notes point inside the output; links to anything else
 *   become plain words (an outside reader could not follow them).
 * - An embedded note becomes a link to it when it is exported, and its name
 *   otherwise: a note left out of the export never slips in through an embed.
 * - Embedded images travel along, keeping a size written as `![[a.png|200]]`.
 * - Tags, Obsidian's own buttons and media pointing into the app are left out.
 */
export async function renderNote(app: App, path: string, markdown: string, target: RenderTarget): Promise<RenderedNote> {
	// One component per note: its children are unloaded as soon as the note is read.
	const component = new Component();
	component.load();
	try {
		const el = createDiv();
		await MarkdownRenderer.render(app, markdown, el, path, component);
		const links: string[] = [];
		const resolve = (text: string) => app.metadataCache.getFirstLinkpathDest(linkPath(text), path);

		for (const embed of Array.from(el.querySelectorAll<HTMLElement>(".internal-embed[src]"))) {
			const source = embed.getAttribute("src") ?? "";
			const file = resolve(source);
			if (file && isImage(file)) {
				const alt = embed.getAttribute("alt") ?? "";
				const attr: Record<string, string> = {
					src: await target.imageSrc(file),
					// Obsidian puts a size written after the bar into alt; it is not a description.
					alt: /^\d+(x\d+)?$/.test(alt) || !alt ? file.basename : alt,
				};
				for (const size of ["width", "height"]) {
					const value = embed.getAttribute(size);
					if (value) attr[size] = value;
				}
				embed.replaceWith(createEl("img", { attr }));
				continue;
			}
			const href = file ? target.hrefFor(file.path) : null;
			const name = file?.basename ?? linkPath(source);
			if (file && href) {
				const para = createEl("p");
				para.createEl("a", { text: name, attr: { href } });
				embed.replaceWith(para);
				if (!links.includes(file.path)) links.push(file.path);
			} else {
				embed.replaceWith(createSpan({ text: name }));
			}
		}

		for (const anchor of Array.from(el.querySelectorAll<HTMLAnchorElement>("a.internal-link"))) {
			const raw = anchor.getAttribute("data-href") ?? anchor.getAttribute("href") ?? "";
			const file = resolve(raw);
			const href = file ? target.hrefFor(file.path) : null;
			if (file && href) {
				anchor.replaceWith(createEl("a", { text: anchor.textContent ?? "", attr: { href } }));
				if (!links.includes(file.path)) links.push(file.path);
			} else {
				anchor.replaceWith(createSpan({ text: anchor.textContent ?? "" }));
			}
		}

		// A tag's link would jump to whichever note shares its name.
		for (const tag of Array.from(el.querySelectorAll("a.tag"))) tag.replaceWith(createSpan({ text: tag.textContent ?? "" }));

		for (const media of Array.from(el.querySelectorAll("img, audio, video, source, iframe, embed, object"))) {
			const src = media.getAttribute("src") ?? media.getAttribute("data") ?? "";
			if (LOCAL_SOURCE.test(src)) media.remove();
		}
		for (const button of Array.from(el.querySelectorAll("button, .copy-code-button, .edit-block-button"))) button.remove();

		return { html: el.innerHTML, links };
	} finally {
		component.unload();
	}
}
