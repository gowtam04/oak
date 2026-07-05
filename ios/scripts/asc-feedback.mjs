#!/usr/bin/env node
// Sync new TestFlight beta feedback (screenshots + crashes) from App Store
// Connect into docs/testflight-feedback/ledger.md, downloading each
// submission's assets alongside it. Zero dependencies (Node 20+ only).
//
// Required env vars:
//   APP_STORE_CONNECT_API_KEY_KEY_ID
//   APP_STORE_CONNECT_API_KEY_ISSUER_ID
//   APP_STORE_CONNECT_API_KEY_KEY_FILEPATH
//
// Usage: node ios/scripts/asc-feedback.mjs   (from anywhere; paths are
// resolved relative to this script's own location, not the cwd)

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP_ID = "6786014161";
const API_BASE = "https://api.appstoreconnect.apple.com";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..");
const feedbackDir = path.join(repoRoot, "docs", "testflight-feedback");
const ledgerPath = path.join(feedbackDir, "ledger.md");
const assetsDir = path.join(feedbackDir, "assets");

function requireEnv() {
  const keyId = process.env.APP_STORE_CONNECT_API_KEY_KEY_ID;
  const issuerId = process.env.APP_STORE_CONNECT_API_KEY_ISSUER_ID;
  const keyPath = process.env.APP_STORE_CONNECT_API_KEY_KEY_FILEPATH;
  const missing = [];
  if (!keyId) missing.push("APP_STORE_CONNECT_API_KEY_KEY_ID");
  if (!issuerId) missing.push("APP_STORE_CONNECT_API_KEY_ISSUER_ID");
  if (!keyPath) missing.push("APP_STORE_CONNECT_API_KEY_KEY_FILEPATH");
  if (missing.length > 0) {
    console.error(
      `Missing required env var(s): ${missing.join(", ")}\n` +
        "Set all three APP_STORE_CONNECT_API_KEY_* vars before running this script.",
    );
    process.exit(1);
  }
  return { keyId, issuerId, keyPath };
}

const b64url = (buf) => Buffer.from(buf).toString("base64url");

function makeToken({ keyId, issuerId, keyPath }) {
  const header = { alg: "ES256", kid: keyId, typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = { iss: issuerId, iat: now, exp: now + 900, aud: "appstoreconnect-v1" };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const key = crypto.createPrivateKey(fs.readFileSync(keyPath));
  const sig = crypto.sign("sha256", Buffer.from(signingInput), { key, dsaEncoding: "ieee-p1363" });
  return `${signingInput}.${b64url(sig)}`;
}

async function api(creds, urlOrPath) {
  const url = urlOrPath.startsWith("http") ? urlOrPath : `${API_BASE}${urlOrPath}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${makeToken(creds)}` } });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${url}\n${text}`);
  return JSON.parse(text);
}

async function fetchAllPages(creds, initialPath) {
  const items = [];
  let next = initialPath;
  while (next) {
    const page = await api(creds, next);
    items.push(...page.data);
    next = page.links?.next ?? null;
  }
  return items;
}

async function downloadFile(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} downloading ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, buf);
}

function existingIds(ledgerText) {
  const ids = new Set();
  const re = /^### (\S+)$/gm;
  let m;
  while ((m = re.exec(ledgerText)) !== null) ids.add(m[1]);
  return ids;
}

function blockquote(comment) {
  return comment
    .split("\n")
    .map((line) => (line.length === 0 ? ">" : `> ${line}`))
    .join("\n");
}

function parseBuildFromCrashLog(logText) {
  const m = logText.match(/^Version:\s*[\d.]+\s*\((\d+)\)/m);
  return m ? m[1] : null;
}

function formatEntry({ id, date, type, build, device, os, locale, email, comment, assetLinks }) {
  const submitter = email || "anonymous";
  const links = assetLinks.map((l) => `[${l.label}](${l.href})`).join(", ");
  return [
    `### ${id}`,
    "",
    `- **Date:** ${date}`,
    `- **Type:** ${type}`,
    `- **Build:** ${build}`,
    `- **Device/OS:** ${device}, iOS ${os}, ${locale}`,
    `- **Submitter:** ${submitter}`,
    "- **Status:** pending",
    "",
    blockquote(comment),
    "",
    `**Assets:** ${links}`,
    "",
  ].join("\n");
}

async function main() {
  const creds = requireEnv();

  if (!fs.existsSync(ledgerPath)) {
    console.error(`Ledger not found at ${ledgerPath} — is the repo layout as expected?`);
    process.exit(1);
  }
  const ledgerText = fs.readFileSync(ledgerPath, "utf8");
  const known = existingIds(ledgerText);

  const [screenshots, crashes] = await Promise.all([
    fetchAllPages(creds, `/v1/apps/${APP_ID}/betaFeedbackScreenshotSubmissions?limit=200`),
    fetchAllPages(creds, `/v1/apps/${APP_ID}/betaFeedbackCrashSubmissions?limit=200`),
  ]);

  const newScreenshots = screenshots.filter((s) => !known.has(s.id));
  const newCrashes = crashes.filter((c) => !known.has(c.id));

  const allNew = [
    ...newScreenshots.map((s) => ({ kind: "screenshot", item: s })),
    ...newCrashes.map((c) => ({ kind: "crash", item: c })),
  ].sort((a, b) => new Date(b.item.attributes.createdDate) - new Date(a.item.attributes.createdDate));

  if (allNew.length === 0) {
    console.log("0 new");
    return;
  }

  const blocks = [];
  for (const { kind, item } of allNew) {
    const attrs = item.attributes;
    const id = item.id;
    const destDir = path.join(assetsDir, id);

    if (kind === "screenshot") {
      const assetLinks = [];
      const shots = attrs.screenshots ?? [];
      for (let i = 0; i < shots.length; i++) {
        const fileName = `screenshot-${i + 1}.jpg`;
        await downloadFile(shots[i].url, path.join(destDir, fileName));
        assetLinks.push({ label: fileName, href: `assets/${id}/${fileName}` });
      }
      blocks.push(
        formatEntry({
          id,
          date: attrs.createdDate,
          type: "screenshot",
          build: "unknown (not available from the feedback API — attribute manually)",
          device: attrs.deviceModel,
          os: attrs.osVersion,
          locale: attrs.locale,
          email: attrs.email,
          comment: attrs.comment,
          assetLinks,
        }),
      );
    } else {
      const crashLogPath = `/v1/betaFeedbackCrashSubmissions/${id}/crashLog`;
      const crashLogRes = await api(creds, crashLogPath);
      const logText = crashLogRes.data?.attributes?.logText ?? "";
      fs.mkdirSync(destDir, { recursive: true });
      fs.writeFileSync(path.join(destDir, "crash.log"), logText, "utf8");
      const build = parseBuildFromCrashLog(logText);
      blocks.push(
        formatEntry({
          id,
          date: attrs.createdDate,
          type: "crash",
          build: build ? `${build} (confirmed — crash log)` : "unknown (could not parse crash log)",
          device: attrs.deviceModel,
          os: attrs.osVersion,
          locale: attrs.locale,
          email: attrs.email,
          comment: attrs.comment,
          assetLinks: [{ label: "crash.log", href: `assets/${id}/crash.log` }],
        }),
      );
    }
  }

  const separator = ledgerText.endsWith("\n") ? "\n" : "\n\n";
  fs.writeFileSync(ledgerPath, ledgerText + separator + blocks.join("\n"));

  console.log(`${allNew.length} new`);
  for (const { item } of allNew) console.log(`  ${item.id}`);
}

main().catch((err) => {
  console.error(err.stack || err.message || err);
  process.exit(1);
});
