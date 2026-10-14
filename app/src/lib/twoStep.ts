// Lets other screens (the post-login recommendation) open the two-step verification dialog
// of the settings page once it is mounted.

let opener: (() => void) | null = null;
let pending = false;

export function registerTwoStepOpener(fn: (() => void) | null) {
  opener = fn;
  if (fn && pending) {
    pending = false;
    fn();
  }
}

/** Opens the dialog now, or as soon as the settings card is shown. */
export function openTwoStepSetup() {
  if (opener) opener();
  else pending = true;
}
