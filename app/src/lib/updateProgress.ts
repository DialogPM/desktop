/** Percent of a download, or null when the total is unknown. */
export function downloadPercent(downloaded: number, total: number | null): number | null {
  if (!total || total <= 0) return null;
  return Math.max(0, Math.min(100, Math.floor((downloaded / total) * 100)));
}
