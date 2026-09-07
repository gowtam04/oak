/**
 * /meta — former Smogon OU index. Permanently redirects to live Champions usage
 * (CF-USAGE-AC-1.7, ADR-5).
 */

import { permanentRedirect } from "next/navigation";

export default async function MetaIndexPage() {
  permanentRedirect("/usage");
}
