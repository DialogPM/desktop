// Generated sample media for the mock backend (no binary assets needed).

function svgUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const PALETTES: [string, string, string, string][] = [
  ["#ffb88c", "#de6262", "#2d3a4a", "#3f5566"], // sunset
  ["#89f7fe", "#66a6ff", "#2f5d50", "#3e7a64"], // lake
  ["#fbd3e9", "#bb377d", "#402f59", "#5b4580"], // dusk
  ["#f6d365", "#fda085", "#6b4f3a", "#8a6a4f"], // desert
  ["#a1ffce", "#faffd1", "#3a6b35", "#4f8a47"], // meadow
  ["#c9d6ff", "#e2e2e2", "#4b5563", "#6b7280"], // snow
];

/** A stylized landscape "photo". */
export function photo(seed: number, w = 1200, h = 800): string {
  const [sky1, sky2, m1, m2] = PALETTES[seed % PALETTES.length];
  const sunX = 200 + ((seed * 137) % 800);
  const sunY = 180 + ((seed * 53) % 160);
  const peak = (i: number) => 300 + ((seed * (i + 3) * 97) % 260);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice">
<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky1}"/><stop offset="1" stop-color="${sky2}"/></linearGradient></defs>
<rect width="1200" height="800" fill="url(#s)"/>
<circle cx="${sunX}" cy="${sunY}" r="70" fill="#fff" opacity="0.85"/>
<path d="M0 ${peak(1) + 150} L200 ${peak(2)} L420 ${peak(3) + 80} L640 ${peak(4)} L860 ${peak(5) + 60} L1050 ${peak(6)} L1200 ${peak(7) + 100} L1200 800 L0 800Z" fill="${m1}" opacity="0.9"/>
<path d="M0 620 L250 520 L500 600 L760 500 L1000 590 L1200 540 L1200 800 L0 800Z" fill="${m2}"/>
</svg>`;
  return svgUrl(svg);
}

/** Tiny blurred-looking preview (same art, very small). */
export function thumb(seed: number): string {
  const [sky1, sky2, m1] = PALETTES[seed % PALETTES.length];
  return svgUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 8"><defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky1}"/><stop offset="1" stop-color="${sky2}"/></linearGradient></defs><rect width="12" height="8" fill="url(#s)"/><rect y="5" width="12" height="3" fill="${m1}"/></svg>`,
  );
}

/** Avatar picture: a soft gradient with an abstract figure. */
export function avatarPic(seed: number): string {
  const hues = [168, 200, 280, 20, 330, 95];
  const h = hues[seed % hues.length];
  return svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${h},70%,72%)"/><stop offset="1" stop-color="hsl(${(h + 40) % 360},65%,50%)"/></linearGradient></defs>
<rect width="100" height="100" fill="url(#g)"/>
<circle cx="50" cy="40" r="18" fill="hsl(${h},40%,92%)"/>
<path d="M18 100c2-22 16-34 32-34s30 12 32 34z" fill="hsl(${h},40%,92%)"/>
</svg>`);
}

export function groupPic(seed: number): string {
  const hues = [150, 35, 220, 300];
  const h = hues[seed % hues.length];
  return svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<rect width="100" height="100" fill="hsl(${h},55%,55%)"/>
<path d="M0 75 L30 40 L50 62 L68 45 L100 80 L100 100 L0 100Z" fill="hsl(${h},45%,35%)"/>
<circle cx="72" cy="28" r="10" fill="#fff" opacity=".9"/>
</svg>`);
}

/** Simple pseudo-random generator so sample data is stable between reloads. */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 10_000) / 10_000;
  };
}

export function waveform(seed: number, n = 48): number[] {
  const r = rng(seed);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const env = Math.sin((i / n) * Math.PI) * 0.6 + 0.3;
    out.push(Math.min(1, Math.max(0.08, env * (0.45 + r() * 0.7))));
  }
  return out;
}

/** Synthesizes a short "voice-like" WAV following the given waveform. */
export function voiceWav(wave: number[], durationMs: number): string {
  const rate = 8000;
  const n = Math.floor((rate * durationMs) / 1000);
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + n * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const amp = wave[Math.min(wave.length - 1, Math.floor((i / n) * wave.length))];
    const f = 180 + 60 * Math.sin(t * 3);
    const sample = amp * 0.35 * (Math.sin(2 * Math.PI * f * t) + 0.4 * Math.sin(2 * Math.PI * f * 2.01 * t));
    v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, sample)) * 32767, true);
  }
  let bin = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return `data:audio/wav;base64,${btoa(bin)}`;
}

export function textFile(content: string, mime = "text/plain"): string {
  return `data:${mime};charset=utf-8,${encodeURIComponent(content)}`;
}

// A subset of the BIP39 English word list, enough for realistic mock seeds.
export const WORDS =
  "abandon ability able about above absent absorb abstract absurd abuse access accident account accuse achieve acid acoustic acquire across action actor actress actual adapt address adjust admit adult advance advice aerobic affair afford afraid again agent agree ahead aim air airport aisle alarm album alcohol alert alien all alley allow almost alone alpha already also alter always amateur amazing among amount amused analyst anchor ancient anger angle angry animal ankle announce annual another answer antenna antique anxiety apart apology appear apple approve april arch arctic area arena argue arm armed armor army around arrange arrest arrive arrow art artefact artist artwork ask aspect assault asset assist assume asthma athlete atom attack attend attitude attract auction audit august aunt author auto autumn average avocado avoid awake aware away awesome awful awkward axis baby bachelor bacon badge bag balance balcony ball bamboo banana banner bar barely bargain barrel base basic basket battle beach bean beauty because become beef before begin behave behind believe below belt bench benefit best betray better between beyond bicycle bid bike bind biology bird birth bitter black blade blame blanket blast bleak bless blind blood blossom blouse blue blur blush board boat body boil bomb bone bonus book boost border boring borrow boss bottom bounce box boy bracket brain brand brass brave bread breeze brick bridge brief bright bring brisk broccoli broken bronze broom brother brown brush bubble buddy budget buffalo build bulb bulk bullet bundle bunker burden burger burst bus business busy butter buyer buzz cabbage cabin cable cactus cage cake call calm camera camp canal cancel candy cannon canoe canvas canyon capable capital captain car carbon card cargo carpet carry cart case cash casino castle casual cat catalog catch category cattle caught cause caution cave ceiling celery cement census century cereal certain chair chalk champion change chaos chapter charge chase chat cheap check cheese chef cherry chest chicken chief child chimney choice choose chronic chuckle chunk churn cigar cinnamon circle citizen city civil claim clap clarify claw clay clean clerk clever click client cliff climb clinic clip clock clog close cloth cloud clown club clump cluster clutch coach coast coconut code coffee coil coin collect color column combine come comfort comic common company concert conduct confirm congress connect consider control convince cook cool copper copy coral core corn correct cost cotton couch country couple course cousin cover coyote crack cradle craft cram crane crash crater crawl crazy cream credit creek crew cricket crime crisp critic crop cross crouch crowd crucial cruel cruise crumble crunch crush cry crystal cube culture cup cupboard curious current curtain curve cushion custom cute cycle".split(
    " ",
  );
