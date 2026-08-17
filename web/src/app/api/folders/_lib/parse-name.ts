/** Upper bound for a user-supplied folder name (ORG-US-1). */
export const FOLDER_NAME_MAX = 40;

/** Trim + length-check a folder name, or `null` if it is not 1–40. */
export function parseFolderName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.trim();
  if (name.length < 1 || name.length > FOLDER_NAME_MAX) return null;
  return name;
}
