/**
 * Stand-in for the `obsidian` package in unit tests. The real package has no
 * runtime outside the app, so only the few values the tested modules touch are
 * provided here; everything else is type-only and erased at compile time.
 */

export function normalizePath(path: string): string {
	return path
		.replace(/\\/g, "/")
		.replace(/\/{2,}/g, "/")
		.replace(/^\/+|\/+$/g, "");
}

export class TFile {
	path = "";
	basename = "";
	extension = "md";
}

export class TFolder {}
