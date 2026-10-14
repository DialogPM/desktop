// Icon set of the Dialog design (docs/design/Icon.dc.html).
// 24x24 viewBox, stroke 1.8 by default. A "*" prefix draws a dot (stroke 2.8),
// a "#" prefix draws a filled shape.

import type { CSSProperties } from "react";

const ICONS = {
  search: ["M11 4a7 7 0 1 0 0 14a7 7 0 0 0 0-14z", "M20 20l-3.5-3.5"],
  edit: ["M12 20h9", "M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"],
  more: ["*M12 5h0", "*M12 12h0", "*M12 19h0"],
  back: ["M19 12H5", "M12 19l-7-7 7-7"],
  x: ["M18 6L6 18", "M6 6l12 12"],
  clip: ["M21.4 11.1l-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5"],
  smile: ["M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z", "M8 14s1.5 2 4 2 4-2 4-2", "*M9 9.5h0", "*M15 9.5h0"],
  mic: ["M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z", "M19 10v2a7 7 0 0 1-14 0v-2", "M12 19v3"],
  send: ["M22 2L11 13", "M22 2l-7 20-4-9-9-4z"],
  lock: ["M5 11h14v10H5z", "M8 11V7a4 4 0 0 1 8 0v4"],
  shield: ["M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z", "M9 12l2 2 4-4"],
  qr: ["M3 3h7v7H3z", "M14 3h7v7h-7z", "M3 14h7v7H3z", "M14 14h3v3h-3z", "M21 14v.01", "M14 21h.01", "M17 17h4v4"],
  gear: [
    "M12 9a3 3 0 1 0 0 6a3 3 0 0 0 0-6z",
    "M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  ],
  chat: ["M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"],
  check: ["M5 12l5 5L20 7"],
  checks: ["M2 12.5l5 5L17.5 7", "M13 16.5l1 1L22 7"],
  pin: ["M12 17v5", "M9 3h6l-1 5 3 3v2H7v-2l3-3z"],
  mute: [
    "M8.7 3.2A6 6 0 0 1 18 8c0 3 .7 5 1.4 6.3",
    "M6.3 6.3A6 6 0 0 0 6 8c0 7-3 9-3 9h14",
    "M10.3 21a1.9 1.9 0 0 0 3.4 0",
    "M2 2l20 20",
  ],
  bell: ["M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9", "M10.3 21a1.9 1.9 0 0 0 3.4 0"],
  play: ["#M8 5.5v13l10.5-6.5z"],
  pause: ["#M7 5h3.5v14H7z", "#M13.5 5H17v14h-3.5z"],
  mappin: ["M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z", "M12 7.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 0 0 0-5z"],
  external: ["M15 3h6v6", "M10 14L21 3", "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"],
  globe: ["M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z", "M3 12h18", "M12 3a14 14 0 0 1 0 18", "M12 3a14 14 0 0 0 0 18"],
  server: ["M3 4h18v7H3z", "M3 13h18v7H3z", "*M7 7.5h0", "*M7 16.5h0"],
  copy: ["M9 9h11v11H9z", "M5 15H4V4h11v1"],
  camera: ["M3 8h4l2-3h6l2 3h4v12H3z", "M12 10a3.5 3.5 0 1 0 0 7a3.5 3.5 0 0 0 0-7z"],
  // Disappearing messages (badge on chat avatars, like other messengers).
  timer: ["M12 3a9 9 0 1 1-8.6 6.3", "*M4.6 6.4h0", "*M7.6 3.9h0", "M12 8v4.5l3 1.8"],
  clock: ["M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z", "M12 7v5l3 2"],
  chevron: ["M9 6l6 6-6 6"],
  moon: ["M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"],
  sun: [
    "M12 8a4 4 0 1 0 0 8a4 4 0 0 0 0-8z",
    "M12 2v2",
    "M12 20v2",
    "M4.9 4.9l1.4 1.4",
    "M17.7 17.7l1.4 1.4",
    "M2 12h2",
    "M20 12h2",
    "M4.9 19.1l1.4-1.4",
    "M17.7 6.3l1.4-1.4",
  ],
  devices: ["M4 5h13v9H4z", "M2 18h11", "M17 9h5v11h-5z"],
  key: ["M8 15a4 4 0 1 0 0-8a4 4 0 0 0 0 8z", "M12 11h9", "M18 11v3", "M21 11v2"],
  palette: [
    "M12 3a9 9 0 0 0 0 18c1.4 0 2-1 2-2 0-1.5-1-1.8-1-3 0-1 .8-2 2-2h2a4 4 0 0 0 4-4c0-4-4-7-9-7z",
    "*M7.5 11h0",
    "*M10 7h0",
    "*M15 7.5h0",
  ],
  lang: ["M4 5h9", "M8.5 3v2", "M11 5c-1 4-4 7-7 8", "M6 9c1 2 3 3.5 5 4", "M13 21l4-9 4 9", "M14.5 18h5"],
  info: ["M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z", "M12 11v5", "*M12 8h0"],
  logout: ["M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4", "M16 17l5-5-5-5", "M21 12H9"],
  users: [
    "M9 11a4 4 0 1 0 0-8a4 4 0 0 0 0 8z",
    "M2 21v-1a6 6 0 0 1 12 0v1",
    "M16 3.5a4 4 0 0 1 0 7.5",
    "M22 21v-1a6 6 0 0 0-4-5.6",
  ],
  image: ["M3 4h18v16H3z", "M8.5 8a1.5 1.5 0 1 0 0 3a1.5 1.5 0 0 0 0-3z", "M21 15l-5-5L5 20"],
  forward: ["M15 5l6 6-6 6", "M21 11H10a6 6 0 0 0-6 6v2"],
  user: ["M12 11a4 4 0 1 0 0-8a4 4 0 0 0 0 8z", "M4 21v-1a8 8 0 0 1 16 0v1"],
  phone: [
    "M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.1-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.9.6 2.8.7a2 2 0 0 1 1.7 2z",
  ],
  video: ["M3 6.5h12v11H3z", "M15 10.5l6-3.5v10l-6-3.5"],
  videooff: ["M3 3l18 18", "M7 6.5h8v8", "M15 17.5H3v-11", "M15 10.5l6-3.5v10l-6-3.5"],
  micoff: ["M3 3l18 18", "M9 9v3a3 3 0 0 0 5.1 2.1", "M15 9.3V5a3 3 0 0 0-5.9-.7", "M19 10v2a7 7 0 0 1-1.2 3.9", "M5 10v2a7 7 0 0 0 11.5 5.4", "M12 19v3"],
  trash: ["M3 6h18", "M8 6V4h8v2", "M6 6l1 15h10l1-15"],
  eye: ["M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z", "M12 9a3 3 0 1 0 0 6a3 3 0 0 0 0-6z"],
  eyeoff: [
    "M3 3l18 18",
    "M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3 3.8",
    "M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6",
    "M9.9 9.9a3 3 0 0 0 4.2 4.2",
  ],
  plug: ["M9 2v6", "M15 2v6", "M6 8h12v3a6 6 0 0 1-12 0z", "M12 17v5"],
  okcircle: ["M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z", "M8 12l3 3 5-5"],
  panel: ["M3 4h18v16H3z", "M15 4v16"],
  plus: ["M12 5v14", "M5 12h14"],
  scan: ["M3 8V5a2 2 0 0 1 2-2h3", "M16 3h3a2 2 0 0 1 2 2v3", "M21 16v3a2 2 0 0 1-2 2h-3", "M8 21H5a2 2 0 0 1-2-2v-3", "M7 12h10"],
  file: ["M14 3H6v18h12V7z", "M14 3v4h4"],
  alert: ["M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z", "M12 7.5v5", "*M12 16h0"],
  share: ["M12 3v13", "M7 8l5-5 5 5", "M5 14v7h14v-7"],
} as const;

export type IconName = keyof typeof ICONS;

interface Props {
  name: IconName;
  size?: number;
  /** Stroke width of regular paths (dots and filled shapes are not affected). */
  strokeWidth?: number;
  className?: string;
  style?: CSSProperties;
  "aria-label"?: string;
}

export function Icon({ name, size = 20, strokeWidth = 1.8, className, style, "aria-label": label }: Props) {
  const paths: readonly string[] = ICONS[name] ?? [];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={{ display: "block", flexShrink: 0, ...style }}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {paths.map((p, i) => {
        if (p[0] === "*") return <path key={i} d={p.slice(1)} strokeWidth={2.8} />;
        if (p[0] === "#") return <path key={i} d={p.slice(1)} strokeWidth={0} fill="currentColor" stroke="none" />;
        return <path key={i} d={p} strokeWidth={strokeWidth} />;
      })}
    </svg>
  );
}
