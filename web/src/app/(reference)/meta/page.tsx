/**
 * /meta — redirects to the default competitive ladder's leaderboard
 * (`/meta/<DEFAULT_META_FORMAT>`). Trivial server component: `DEFAULT_META_FORMAT`
 * comes from the pure, side-effect-free `@/data/meta-formats` module, so this
 * is safe to import statically (unlike the DB-backed loaders, which stay
 * dynamically imported inside the format/species pages).
 */

import { redirect } from "next/navigation";

import { DEFAULT_META_FORMAT } from "@/data/meta-formats";

export default function MetaIndexPage() {
  redirect(`/meta/${DEFAULT_META_FORMAT}`);
}
