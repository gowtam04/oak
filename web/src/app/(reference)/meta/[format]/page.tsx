/**
 * /meta/:format — ignore old gen9ou (and any format). Permanent redirect to /usage.
 */

import { permanentRedirect } from "next/navigation";

export default async function MetaFormatPage({
  params,
}: {
  params: Promise<{ format: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  await params;
  permanentRedirect("/usage");
}
