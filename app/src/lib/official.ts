// Official account badges (see components/OfficialBadge.tsx): the pure part.

/** Longest label shown; the operator sets it, but a long one must not push the name away. */
const MAX_LABEL = 48;

/** The label to show, or null when there is no badge (missing, null, empty or blank). */
export function officialLabel(label: string | null | undefined): string | null {
  if (typeof label !== "string") return null;
  const clean = label.replace(/\s+/g, " ").trim();
  if (!clean) return null;
  return clean.length > MAX_LABEL ? `${clean.slice(0, MAX_LABEL - 1)}…` : clean;
}
