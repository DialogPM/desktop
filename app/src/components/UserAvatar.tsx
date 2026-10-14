import type { CSSProperties } from "react";
import { hueFor } from "../lib/appearance";
import { initials } from "../lib/format";
import { useMediaSrc } from "../lib/media";
import { Icon } from "./Icon";

interface Props {
  name: string;
  path?: string | null;
  /** Stable id (contact / conversation id) that picks the avatar hue. */
  seed?: string;
  size?: number;
  group?: boolean;
  style?: CSSProperties;
}

// Font sizes used by the design for its avatar sizes.
const FONT: Record<number, number> = { 28: 11, 38: 13, 40: 13.5, 42: 14.5, 44: 15, 50: 16, 58: 19, 96: 31, 112: 36, 124: 40 };

/** Round avatar: photo when available, otherwise initials on an oklch tint derived from the id. */
export function UserAvatar({ name, path, seed, size = 44, group, style }: Props) {
  const src = useMediaSrc(path);
  const text = initials(name);
  const fontSize = FONT[size] ?? Math.round(size * 0.33 * 2) / 2;
  return (
    <div
      className="avatar"
      style={{ width: size, height: size, fontSize, ["--h" as string]: hueFor(seed ?? name), ...style }}
      role="img"
      aria-label={name}
    >
      {src ? (
        <img src={src} alt="" draggable={false} />
      ) : group && (!text.trim() || text === "?" || text === "#") ? (
        <Icon name="users" size={Math.round(size * 0.45)} />
      ) : (
        text
      )}
    </div>
  );
}
