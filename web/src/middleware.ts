import { NextResponse, type NextRequest } from "next/server";
import { CANONICAL_HOST } from "@/lib/site";

/**
 * Host-consolidation middleware — permanently redirects traffic on the
 * internal Fly host (`*.fly.dev`) onto the canonical `https://oak.gowtam.ai`.
 *
 * Why: search engines see the app on two hosts (the Fly-assigned domain and
 * the canonical custom domain), which splits ranking signal and reads as
 * duplicate content. A 301 here tells crawlers (and any stray inbound links)
 * there is exactly one true URL for every page.
 *
 * Why `/api/*` is exempt (see `config.matcher` below): the shipped iOS app
 * (`ios/OakApp/Networking/BaseURL.swift`) has historically pointed straight
 * at `https://oak-gowtam.fly.dev/api/*` and older installs may still resolve
 * that host directly — redirecting those calls would break the app for
 * anyone who hasn't relaunched onto a newer build. Separately, Fly's own
 * health check (`fly.toml` `[[http_service.checks]]`) polls `/api/health` on
 * the machine's Fly hostname; if that path 301'd, Fly would never see a 200
 * and would consider the machine unhealthy. `/api/*` must stay reachable,
 * un-redirected, on every host.
 *
 * Why GET/HEAD only: this is belt-and-braces on top of the `/api/*`
 * exemption. A 301 redirect drops the request body, so scoping the redirect
 * to methods that never carry one (GET/HEAD) guarantees a body-carrying
 * request (POST/PUT/PATCH/DELETE) can never be silently turned into a
 * body-dropping redirect, even if the matcher above is ever loosened.
 *
 * Why the matcher does NOT exclude `_next/static` (or anything else): any
 * stray request that lands on the Fly host — a cached asset URL, a crawler
 * hitting `/robots.txt` or `/sitemap.xml`, a stale bookmark — should still
 * consolidate onto the canonical host. The only carve-out is `/api/*`.
 *
 * The matcher must remain a static string literal — Next.js resolves
 * middleware matchers at build time and cannot evaluate an expression built
 * from `CANONICAL_HOST` or any other runtime value.
 */
export function middleware(req: NextRequest) {
  const host = (req.headers.get("host") ?? "").toLowerCase();
  if (host.endsWith(".fly.dev") && (req.method === "GET" || req.method === "HEAD")) {
    const url = new URL(req.nextUrl.pathname + req.nextUrl.search, `https://${CANONICAL_HOST}`);
    return NextResponse.redirect(url, 301);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api/).*)"],
};
