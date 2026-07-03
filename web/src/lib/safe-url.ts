/**
 * safe-url — a render-side allowlist for URLs that originate from the model's
 * `submit_answer` payload (citation `endpoint_url`, subject/candidate
 * `sprite_url`/`artwork_url`). Pure, client-safe (no Node/server/DB imports),
 * so it's usable from both server components and jsdom tests.
 *
 * (a) This closes a `javascript:`-href XSS: those fields are MODEL-COMPOSED
 * strings that used to go straight into `<a href>`/`<img src>`. React does
 * not block `javascript:` hrefs, and `target="_blank"` doesn't help — the
 * scheme still runs in the existing tab with the page's session authority.
 * (b) We deliberately do NOT tighten `citationSchema.endpoint_url` (or the
 * sprite/artwork fields) in Zod to require `http(s)`: a malformed model URL
 * would fail the whole `submit_answer` validation, triggering the re-emit
 * loop and degrading answers over what is otherwise a cosmetic field. This
 * render-side allowlist fully closes the XSS without that cost.
 */
export function safeHttpUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return undefined;
  }
  return url;
}
