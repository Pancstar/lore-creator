import esbuild from "esbuild";
import process from "node:process";
import fs from "node:fs";
import { builtinModules } from "node:module";

const banner = `/*
Lore Creator — bundled output.
Do not edit directly; edit the TypeScript sources in src/ instead.
*/
`;

const production = process.argv[2] === "production";

/** Copies manifest.json and styles.css alongside main.js so dist/ holds every file the vault plugin folder needs. */
const copyPluginAssets = {
	name: "copy-plugin-assets",
	setup(build) {
		build.onEnd(() => {
			fs.mkdirSync("dist", { recursive: true });
			fs.copyFileSync("manifest.json", "dist/manifest.json");
			fs.copyFileSync("styles.css", "dist/styles.css");
		});
	},
};

const context = await esbuild.context({
	banner: { js: banner },
	entryPoints: ["src/main.ts"],
	bundle: true,
	external: [
		"obsidian",
		"electron",
		"@codemirror/autocomplete",
		"@codemirror/collab",
		"@codemirror/commands",
		"@codemirror/language",
		"@codemirror/lint",
		"@codemirror/search",
		"@codemirror/state",
		"@codemirror/view",
		"@lezer/common",
		"@lezer/highlight",
		"@lezer/lr",
		...builtinModules,
		...builtinModules.map((name) => `node:${name}`),
	],
	format: "cjs",
	target: "es2018",
	logLevel: "info",
	sourcemap: production ? false : "inline",
	treeShaking: true,
	outfile: "dist/main.js",
	minify: production,
	plugins: [copyPluginAssets],
});

if (production) {
	await context.rebuild();
	process.exit(0);
} else {
	await context.watch();
}
