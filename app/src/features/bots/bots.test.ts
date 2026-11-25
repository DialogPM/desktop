import { describe, expect, it } from "vitest";
import { botSlug, commandQuery, looksLikeBotName, matchingCommands } from "./botText";

const commands = [
  { command: "today", description: "" },
  { command: "tomorrow", description: "" },
  { command: "alerts", description: "" },
];

describe("bots", () => {
  it("offers commands only for a slash at the start, before any space", () => {
    expect(commandQuery("/")).toBe("");
    expect(commandQuery("/To")).toBe("to");
    expect(commandQuery("/today now")).toBeNull();
    expect(commandQuery("see /today")).toBeNull();
    expect(commandQuery("hello")).toBeNull();
    expect(matchingCommands(commands, "").length).toBe(3);
    expect(matchingCommands(commands, "to").map((c) => c.command)).toEqual(["today", "tomorrow"]);
    expect(matchingCommands(commands, null)).toEqual([]);
  });

  it("turns a name into a bot address", () => {
    expect(botSlug("Alarmă casă")).toBe("alarma_casa");
    expect(botSlug("  Server alerts bot ")).toBe("server_alerts");
    expect(botSlug("9 lives")).toBe("lives");
  });

  it("tells a bot's name from a person's", () => {
    expect(looksLikeBotName("weather_bot")).toBe(true);
    expect(looksLikeBotName("maria.01")).toBe(false);
    expect(looksLikeBotName("bot")).toBe(false);
  });
});
