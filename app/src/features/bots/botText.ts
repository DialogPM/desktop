// Text rules of bots, kept apart from the components so they can be tested without a DOM.

import type { BotCommand } from "../../lib/types";

/** The name a bot's address must have: a username that ends in "bot". */
export const looksLikeBotName = (name: string) => /^[a-z][a-z0-9_.]{1,28}bot$/.test(name);

/** The command being typed: "/" at the very start, up to the first space. */
export function commandQuery(text: string): string | null {
  const m = /^\/([a-z0-9_]*)$/i.exec(text);
  return m ? m[1].toLowerCase() : null;
}

export function matchingCommands(commands: BotCommand[], query: string | null): BotCommand[] {
  if (query === null) return [];
  return commands.filter((c) => c.command.startsWith(query));
}

/** Address part typed by the user -> the bot's username ("alerte server" -> "alerte_server_bot"). */
export function botSlug(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^[_0-9]+|_+$/g, "")
    .replace(/_?bot$/, "")
    .slice(0, 28);
}
