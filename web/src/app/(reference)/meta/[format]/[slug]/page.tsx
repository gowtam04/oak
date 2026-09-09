/**
 * /meta/:format/:slug — keep the species slug, drop the old format.
 * Permanent redirect to /usage/:slug (CF-USAGE-AC-1.7, ADR-5).
 */

import { permanentRedirect } from "next/navigation";

export default async function MetaSpeciesPage({
  params,
}: {
  params: Promise<{ format: string; slug: string }>;
}) {
  const { slug } = await params;
  permanentRedirect(`/usage/${slug}`);
}
