import tseslint from "typescript-eslint";
import obsidianmd from "eslint-plugin-obsidianmd";

export default tseslint.config(
	// Tests and the vitest config are not plugin code: the Obsidian rule set does
	// not apply to them, and tsc still type-checks them through tsconfig.
	{ ignores: ["main.js", "dist/**", "node_modules/**", "docs/**", "**/*.mjs", "test/**", "vitest.config.ts"] },
	...obsidianmd.configs.recommended,
	{
		languageOptions: {
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
			},
		},
	},
);
