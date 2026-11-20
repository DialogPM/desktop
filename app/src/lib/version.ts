// Comparison of plain "major.minor.patch" versions (the app's own and the ones a server announces).

/** The three numbers of a plain version, or null when `v` is anything else. */
export function parseVersion(v: string | null | undefined): [number, number, number] | null {
  const m = /^(\d{1,4})\.(\d{1,4})\.(\d{1,4})$/.exec(v ?? "");
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** Whether version `a` is older than `b`; false when either is not a plain version. */
export function isOlder(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = parseVersion(a);
  const y = parseVersion(b);
  if (!x || !y) return false;
  for (let i = 0; i < 3; i++) {
    if (x[i] !== y[i]) return x[i] < y[i];
  }
  return false;
}
