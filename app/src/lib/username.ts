// Username helpers shared by the settings UI and the mock backend.
//
// Usernames may end in a Signal-style numeric discriminator, `nickname.01`. Lookup is by the
// exact full string, so older usernames (with or without dots) keep working; the rules below
// only apply when a username is chosen.

/** The trailing `.<digits>` part of a username, or null. */
export function discriminatorOf(username: string): string | null {
  const m = /\.([0-9]+)$/.exec(username);
  return m ? m[1] : null;
}

/** The username without its discriminator. */
export function nicknameOf(username: string): string {
  const d = discriminatorOf(username);
  return d === null ? username : username.slice(0, -(d.length + 1));
}

/** True when a trailing number follows the server rules: 2-9 digits, not all zeros, leading 0
 *  only in the 2-digit form ("01".."09"). Names without a trailing number are fine. */
export function discriminatorValid(username: string): boolean {
  const d = discriminatorOf(username);
  if (d === null) return true;
  return d.length >= 2 && d.length <= 9 && /[1-9]/.test(d) && !(d.length > 2 && d.startsWith("0"));
}

/** A random 2-digit discriminator ("01".."99"). */
export function randomDiscriminator(): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String((buf[0] % 99) + 1).padStart(2, "0");
}

/** `name` with a fresh random discriminator (replacing an existing one), within 32 chars. */
export function withRandomDiscriminator(name: string): string {
  const nick = nicknameOf(name).slice(0, 29);
  return `${nick}.${randomDiscriminator()}`;
}
