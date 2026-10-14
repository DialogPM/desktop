import type { ImgHTMLAttributes } from "react";
import { useMediaSrc } from "../lib/media";

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  /** Local media path (attachment or avatar). */
  path: string | null | undefined;
  /** Shown while the file loads or when there is no local file (e.g. a blurred thumbnail). */
  fallback?: string | null;
  mime?: string;
};

/** <img> for a local media file, loaded the way the current webview supports. */
export function MediaImg({ path, fallback, mime, alt = "", ...rest }: Props) {
  const src = useMediaSrc(path, mime) ?? fallback ?? undefined;
  if (!src) return null;
  return <img src={src} alt={alt} {...rest} />;
}
