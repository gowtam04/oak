#!/usr/bin/env node
// Replace iPhone screenshot sets on Oak 1.2 (DEVELOPER_REJECTED) only.
// Never touches live 1.0.2. Never creates a review submission.
//
// Required env vars (same as asc-feedback.mjs):
//   APP_STORE_CONNECT_API_KEY_KEY_ID
//   APP_STORE_CONNECT_API_KEY_ISSUER_ID
//   APP_STORE_CONNECT_API_KEY_KEY_FILEPATH
//
// Usage (from anywhere):
//   node ios/scripts/asc-replace-screenshots.mjs

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP_ID = "6786014161";
const VERSION_ID = "9ec69dc9-92ba-4e87-a0e9-8a33b070261f"; // 1.2
const LOCALIZATION_ID = "e9aaaa07-be1e-4c1f-9e77-fcea1f3caedc"; // 1.2 en-US
const FORBIDDEN_LOCALIZATION_ID = "76205c64-3912-4c1b-8d12-da3ff6fc91ce"; // 1.0.2
const DISPLAY_TYPES = ["APP_IPHONE_67", "APP_IPHONE_65"];
const FORBIDDEN_STATES = new Set([
  "WAITING_FOR_REVIEW",
  "IN_REVIEW",
  "PENDING_APPLE_RELEASE",
  "PENDING_DEVELOPER_RELEASE",
  "READY_FOR_SALE",
]);
const API_BASE = "https://api.appstoreconnect.apple.com";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..");
const enamelDir = path.join(repoRoot, "docs", "app-store", "generated-screenshots", "enamel");
const PATH_FOR_TYPE = {
  APP_IPHONE_67: path.join(enamelDir, "1290x2796"),
  APP_IPHONE_65: path.join(enamelDir, "1284x2778"),
};

function requireEnv() {
  const keyId = process.env.APP_STORE_CONNECT_API_KEY_KEY_ID;
  const issuerId = process.env.APP_STORE_CONNECT_API_KEY_ISSUER_ID;
  const keyPath = process.env.APP_STORE_CONNECT_API_KEY_KEY_FILEPATH;
  const missing = [];
  if (!keyId) missing.push("APP_STORE_CONNECT_API_KEY_KEY_ID");
  if (!issuerId) missing.push("APP_STORE_CONNECT_API_KEY_ISSUER_ID");
  if (!keyPath) missing.push("APP_STORE_CONNECT_API_KEY_KEY_FILEPATH");
  if (missing.length > 0) {
    throw new Error(`Missing required env var(s): ${missing.join(", ")}`);
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

async function api(creds, urlOrPath, { method = "GET", body, raw = false } = {}) {
  const url = urlOrPath.startsWith("http") ? urlOrPath : `${API_BASE}${urlOrPath}`;
  const headers = { Authorization: `Bearer ${makeToken(creds)}` };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${method} ${url}\n${text}`);
  if (raw) return text;
  if (res.status === 204 || text.length === 0) return null;
  return JSON.parse(text);
}

function md5hex(buf) {
  return crypto.createHash("md5").update(buf).digest("hex");
}

async function uploadBytes(op, chunk) {
  const headers = {};
  for (const h of op.requestHeaders ?? []) headers[h.name] = h.value;
  const res = await fetch(op.url, { method: op.method || "PUT", headers, body: chunk });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`${res.status} PUT upload\n${t}`);
  }
}

function framesFor(displayType) {
  const dir = PATH_FOR_TYPE[displayType];
  return [1, 2, 3, 4, 5, 6].map((n) => {
    const filePath = path.join(dir, `frame-${n}.png`);
    if (!fs.existsSync(filePath)) throw new Error(`Missing ${filePath}`);
    return { n, filePath, fileName: `frame-${n}.png` };
  });
}

async function main() {
  if (LOCALIZATION_ID === FORBIDDEN_LOCALIZATION_ID) {
    throw new Error("Refusing to write the live 1.0.2 localization.");
  }
  const creds = requireEnv();

  const version = await api(creds, `/v1/appStoreVersions/${VERSION_ID}`);
  const state = version.data.attributes.appStoreState;
  const versionString = version.data.attributes.versionString;
  console.log(`version ${versionString} (${VERSION_ID}) state=${state}`);
  if (version.data.id !== VERSION_ID) throw new Error("version id mismatch");
  if (FORBIDDEN_STATES.has(state)) {
    throw new Error(`Refusing to edit screenshots while state is ${state}`);
  }

  const loc = await api(
    creds,
    `/v1/appStoreVersionLocalizations/${LOCALIZATION_ID}/appScreenshotSets?include=appScreenshots`,
  );
  const sets = loc.data ?? [];
  console.log(`screenshot sets: ${sets.length}`);

  for (const displayType of DISPLAY_TYPES) {
    let set = sets.find((s) => s.attributes.screenshotDisplayType === displayType);
    if (!set) {
      console.log(`creating set ${displayType}`);
      const created = await api(creds, "/v1/appScreenshotSets", {
        method: "POST",
        body: {
          data: {
            type: "appScreenshotSets",
            attributes: { screenshotDisplayType: displayType },
            relationships: {
              appStoreVersionLocalization: {
                data: { type: "appStoreVersionLocalizations", id: LOCALIZATION_ID },
              },
            },
          },
        },
      });
      set = created.data;
    }

    const existing =
      loc.included?.filter(
        (inc) =>
          inc.type === "appScreenshots" &&
          (set.relationships?.appScreenshots?.data ?? []).some((d) => d.id === inc.id),
      ) ?? [];
    // Relationships may omit included; list the set directly.
    const listed = await api(creds, `/v1/appScreenshotSets/${set.id}/appScreenshots`);
    const toDelete = listed.data ?? [];
    console.log(`${displayType} set ${set.id}: deleting ${toDelete.length} existing`);
    for (const shot of toDelete) {
      await api(creds, `/v1/appScreenshots/${shot.id}`, { method: "DELETE" });
    }

    for (const frame of framesFor(displayType)) {
      const bytes = fs.readFileSync(frame.filePath);
      console.log(`  uploading ${displayType} ${frame.fileName} (${bytes.length} bytes)`);
      const reserved = await api(creds, "/v1/appScreenshots", {
        method: "POST",
        body: {
          data: {
            type: "appScreenshots",
            attributes: { fileName: frame.fileName, fileSize: bytes.length },
            relationships: {
              appScreenshotSet: { data: { type: "appScreenshotSets", id: set.id } },
            },
          },
        },
      });
      const shotId = reserved.data.id;
      for (const op of reserved.data.attributes.uploadOperations ?? []) {
        const chunk = bytes.subarray(op.offset, op.offset + op.length);
        await uploadBytes(op, chunk);
      }
      await api(creds, `/v1/appScreenshots/${shotId}`, {
        method: "PATCH",
        body: {
          data: {
            type: "appScreenshots",
            id: shotId,
            attributes: {
              uploaded: true,
              sourceFileChecksum: md5hex(bytes),
            },
          },
        },
      });
    }
  }

  const after = await api(creds, `/v1/appStoreVersions/${VERSION_ID}`);
  const afterState = after.data.attributes.appStoreState;
  console.log(`after: version ${after.data.attributes.versionString} state=${afterState} app=${APP_ID}`);
  if (afterState !== state) {
    throw new Error(`State changed from ${state} to ${afterState} — aborting mentally, inspect ASC`);
  }
  if (afterState === "WAITING_FOR_REVIEW") {
    throw new Error("1.2 is WAITING_FOR_REVIEW after screenshot replace — unexpected");
  }

  for (const displayType of DISPLAY_TYPES) {
    const listed = await api(
      creds,
      `/v1/appStoreVersionLocalizations/${LOCALIZATION_ID}/appScreenshotSets?filter[screenshotDisplayType]=${displayType}`,
    );
    const set = listed.data?.[0];
    if (!set) throw new Error(`missing set ${displayType} after upload`);
    const shots = await api(creds, `/v1/appScreenshotSets/${set.id}/appScreenshots`);
    console.log(`${displayType}: ${shots.data.length} screenshots`);
    if (shots.data.length !== 6) {
      throw new Error(`${displayType} expected 6 screenshots, got ${shots.data.length}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
