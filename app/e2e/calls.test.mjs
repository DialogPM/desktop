// End-to-end voice call test: two real accounts (web bridges), the real server, the real UI
// in Chromium with fake microphones. See app/e2e/README.md.
//
//   node calls.test.mjs <ui url> <bridge A> <bridge B> <peer B name as shown to A> [--relay]
//   (UNLOCK_PASSWORD=<password> when the accounts' local data is locked, as demo_peer's is)
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";

const [uiUrl, bridgeA, bridgeB, peerName] = process.argv.slice(2);
const relay = process.argv.includes("--relay");
const shim = readFileSync(new URL("./tauri-shim.js", import.meta.url), "utf8");
const shots = process.env.SHOTS_DIR;

const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"],
});

async function open(bridge, name) {
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 780 }, permissions: ["microphone"] });
  await ctx.addInitScript(`window.__BRIDGE_URL__ = ${JSON.stringify(bridge)}; window.__FORCE_RELAY__ = ${relay};`);
  await ctx.addInitScript(shim);
  const page = await ctx.newPage();
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") console.log(`[${name} ${m.type()}] ${m.text()}`);
  });
  await page.goto(uiUrl);
  // Accounts whose local data is locked with the password (demo_peer accounts are).
  const password = process.env.UNLOCK_PASSWORD;
  const field = page.locator("input[type='password']");
  const visible = (loc, timeout) => loc.waitFor({ timeout }).then(() => true, () => false);
  if (password && (await visible(field.first(), 10_000))) {
    await field.first().fill(password);
    await page.keyboard.press("Enter");
  }
  // The two-step verification reminder, if it shows up.
  const later = page.getByRole("button", { name: /^(Later|Mai târziu|Più tardi)$/ });
  if (await visible(later.first(), 4000)) await later.first().click();
  return page;
}

async function audioStats(page) {
  return page.evaluate(async () => {
    const pc = window.__pcs.at(-1);
    if (!pc) return null;
    const stats = [...(await pc.getStats()).values()];
    const inbound = stats.find((s) => s.type === "inbound-rtp" && s.kind === "audio");
    const pair = stats.find((s) => s.type === "candidate-pair" && s.nominated && s.state === "succeeded");
    const local = pair && stats.find((s) => s.id === pair.localCandidateId);
    const sender = pc.getSenders().find((s) => s.track?.kind === "audio");
    // RED (lib/callAudio.ts): getStats still names the codec "audio/opus", so this checks the
    // negotiation (RED first in the peer's audio codecs) and the packet size (about doubled).
    const sdp = pc.currentRemoteDescription?.sdp ?? "";
    const red = /a=rtpmap:(\d+) red\/48000/.exec(sdp)?.[1];
    const first = /m=audio \S+ \S+ (\d+)/.exec(sdp)?.[1];
    return {
      bytes: inbound?.bytesReceived ?? 0,
      packets: inbound?.packetsReceived ?? 0,
      candidate: local?.candidateType ?? null,
      red: !!red && red === first,
      bytesPerPacket: inbound?.packetsReceived ? Math.round(inbound.bytesReceived / inbound.packetsReceived) : 0,
      // The fake microphone's track, or the voice effects pipeline's (lib/voiceFx.ts).
      sending: sender?.track?.label ?? null,
    };
  });
}

const step = (msg) => console.log(`- ${msg}`);
const fail = (msg) => {
  console.error(`FAIL: ${msg}`);
  process.exitCode = 1;
};

const a = await open(bridgeA, "A");
const b = await open(bridgeB, "B");
await a.getByText(peerName, { exact: true }).first().click();
step(`A opened the chat with ${peerName}`);

await a.getByRole("button", { name: /^(Voice call|Apel vocal|Chiamata vocale)$/ }).first().click();
await b.locator(".call-screen").waitFor({ timeout: 20_000 });
step("B rings");
await a.getByText(/Ringing|Sună|Squilla/).waitFor({ timeout: 10_000 });
step("A sees 'ringing'");
if (shots) await b.screenshot({ path: `${shots}/call-incoming.png` });

await b.locator(".call-btn[data-tone='accept']").click();
await a.locator(".call-status[data-active='true']").waitFor({ timeout: 30_000 });
await b.locator(".call-status[data-active='true']").waitFor({ timeout: 30_000 });
step("both sides connected");
await a.waitForTimeout(4000);
const sa = await audioStats(a);
const sb = await audioStats(b);
step(`audio A<-B ${sa?.bytes} bytes (${sa?.candidate}), B<-A ${sb?.bytes} bytes (${sb?.candidate})`);
if (!(sa?.bytes > 5000 && sb?.bytes > 5000)) fail("no audio flowing");
if (relay && (sa?.candidate !== "relay" || sb?.candidate !== "relay")) fail("expected TURN relay candidates");
if (shots) await a.screenshot({ path: `${shots}/call-active.png` });
// Audio redundancy (lib/callAudio.ts): Chromium on both sides negotiates RED.
step(`RED A ${sa?.red} (${sa?.bytesPerPacket} B/packet), B ${sb?.red} (${sb?.bytesPerPacket} B/packet)`);
if (!sa?.red || !sb?.red) fail("expected RED (redundant audio) to be negotiated");

// Noise reduction and a voice effect on A: B keeps receiving A's (processed) voice.
await a.getByRole("button", { name: /^(Effects|Efecte|Effetti)$/ }).click();
await a.getByRole("menuitem", { name: /Noise reduction|Reducere zgomot|Riduzione rumore/ }).click();
await a.getByRole("menuitem", { name: /Robot/ }).click();
await a.waitForTimeout(500);
const fxA = await audioStats(a);
await a.waitForTimeout(3000);
const sb2 = await audioStats(b);
step(`effects on A: sending "${fxA?.sending}", B received ${sb2?.bytes - sb.bytes} more bytes`);
if (fxA?.sending === sa?.sending) fail("A still sends the raw microphone");
if (!(sb2?.bytes - sb.bytes > 5000)) fail("no audio from A with effects on");
if (shots) await a.screenshot({ path: `${shots}/call-effects.png` });

await a.locator(".call-btn[data-tone='soft']").first().click();
step("A muted");
await a.locator(".call-btn[data-tone='danger']").click();
await b.locator(".call-screen").waitFor({ state: "detached", timeout: 15_000 });
step("A hung up, B's call ended");
await a.getByText(/Outgoing voice call|Apel vocal efectuat|Chiamata vocale effettuata/).first().waitFor({ timeout: 10_000 });
step("A has the call in the chat history");
if (shots) await a.screenshot({ path: `${shots}/call-history.png` });

// Declined call.
await a.getByRole("button", { name: /^(Voice call|Apel vocal|Chiamata vocale)$/ }).first().click();
await b.locator(".call-btn[data-tone='danger']").waitFor({ timeout: 20_000 });
await b.locator(".call-btn[data-tone='danger']").click();
await a.locator(".call-screen").waitFor({ state: "detached", timeout: 15_000 });
await a.getByText(/Voice call declined|Apel vocal respins|Chiamata vocale rifiutata/).first().waitFor({ timeout: 10_000 });
step("declined call: A's screen closed, history says declined");

await browser.close();
console.log(process.exitCode ? "CALL TEST FAILED" : "CALL TEST PASSED");
