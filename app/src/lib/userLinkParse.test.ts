import { describe, expect, it } from "vitest";
import { userLink, userLinksAvailable, usernameOfLink } from "./userLinkParse";

describe("username links", () => {
  it("lead to their name", () => {
    expect(usernameOfLink("https://dialog.pm/@maria")).toBe("maria");
    expect(usernameOfLink("https://dialog.pm/@Maria.Pop_1/")).toBe("maria.pop_1");
    expect(usernameOfLink("https://DIALOG.PM/@maria?lang=ro")).toBe("maria");
    expect(usernameOfLink("dialog://u/maria.01")).toBe("maria.01");
    expect(userLink("maria")).toBe("https://dialog.pm/@maria");
    expect(usernameOfLink(userLink("maria.01"))).toBe("maria.01");
  });

  it("are nothing else", () => {
    for (const link of [
      "http://dialog.pm/@maria",
      "https://dialog.pm.evil.example/@maria",
      "https://evil.example/@maria",
      "https://dialog.pm:8443/@maria",
      "https://dialog.pm/maria",
      "https://dialog.pm/@maria/extra",
      "https://dialog.pm/@ma",
      "https://dialog.pm/@1maria",
      "https://dialog.pm/@maria..pop",
      "https://dialog.pm/@maria%20pop",
      `https://dialog.pm/@${"a".repeat(33)}`,
      "dialog://x/maria",
      "dialog://u/maria/extra",
      "chatapp://u?s=x#abc",
      "not a link",
      "",
    ]) {
      expect(usernameOfLink(link), link).toBeNull();
    }
  });

  it("are for accounts of the official server only", () => {
    expect(userLinksAvailable("https://chat.dialog.pm")).toBe(true);
    expect(userLinksAvailable("https://chat.dialog.pm/")).toBe(true);
    expect(userLinksAvailable("https://chat.example.org")).toBe(false);
    expect(userLinksAvailable(null)).toBe(false);
  });
});
