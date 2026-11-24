// Username links: https://dialog.pm/@name (and dialog://u/name, which the web page of such a
// link uses to open the installed app). Kept apart from lib/userLinks.ts so it can be tested
// without the app around it.

/** Host of the username links, and the server whose accounts they name. */
export const USER_LINK_HOST = "dialog.pm";
export const USER_LINK_SERVER = "https://chat.dialog.pm";

const NAME = /^[a-z][a-z0-9_.]{2,31}$/;

/** The username a link leads to, or null when it is not a username link. */
export function usernameOfLink(link: string): string | null {
  let url: URL;
  try {
    url = new URL(link.trim());
  } catch {
    return null;
  }
  let raw: string | null = null;
  let path: string;
  try {
    path = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
  const segments = path.split("/").filter(Boolean);
  if (url.protocol === "https:" && url.hostname.toLowerCase() === USER_LINK_HOST && !url.port) {
    if (segments.length === 1 && segments[0].startsWith("@")) raw = segments[0].slice(1);
  } else if (url.protocol === "dialog:" && url.hostname === "u") {
    if (segments.length === 1) raw = segments[0];
  }
  if (raw === null) return null;
  const name = raw.toLowerCase();
  return NAME.test(name) && !name.includes("..") ? name : null;
}

/** The web link of a username. */
export function userLink(username: string): string {
  return `https://${USER_LINK_HOST}/@${username}`;
}

/** Whether an account on `serverUrl` is one the links can name. */
export function userLinksAvailable(serverUrl: string | null | undefined): boolean {
  return (serverUrl ?? "").replace(/\/+$/, "").toLowerCase() === USER_LINK_SERVER;
}
