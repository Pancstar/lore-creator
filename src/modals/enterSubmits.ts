/**
 * Enter in a text field presses the form's main button, as it would in any
 * dialog. Shift+Enter, text areas, dropdowns and an IME still composing are
 * left alone, and a disabled main button is not pressed.
 */
export function enterSubmits(container: HTMLElement): void {
	if (container.dataset.plcEnterSubmits) return; // the same modal opened again
	container.dataset.plcEnterSubmits = "true";

	container.addEventListener("keydown", (event) => {
		if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
		// A field with its own Enter handling has already acted.
		if (event.defaultPrevented) return;
		// `instanceOf` works across windows; `instanceof` fails in a popout.
		const target = event.target as Node | null;
		if (!target?.instanceOf(HTMLInputElement)) return;
		if (["button", "submit", "checkbox", "radio"].includes(target.type)) return;

		const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>("button.mod-cta"));
		const main = buttons.reverse().find((button) => !button.disabled);
		if (!main) return;

		event.preventDefault();
		main.click();
	});
}
