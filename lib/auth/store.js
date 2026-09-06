import { mkdirSync, readFileSync, writeFileSync, existsSync, unlinkSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";

const DATA_DIR = join(process.cwd(), ".data");
const BLOB_STORE = "compari5-auth";

function ensureDir() {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  } catch {
    // read-only FS (some serverless) — ignore; Blobs will be used
  }
}

function pathFor(name) {
  return join(DATA_DIR, `${name}.json`);
}

export function netlifyBlobsEnabled() {
  return Boolean(
    process.env.NETLIFY ||
      process.env.NETLIFY_BLOBS_CONTEXT ||
      process.env.USE_NETLIFY_BLOBS === "1"
  );
}

export function readJson(name, fallback = null) {
  ensureDir();
  const p = pathFor(name);
  try {
    if (!existsSync(p)) return fallback;
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return fallback;
  }
}

export function writeJson(name, value) {
  ensureDir();
  writeFileSync(pathFor(name), JSON.stringify(value, null, 2));
}

export function deleteJson(name) {
  const p = pathFor(name);
  try {
    if (existsSync(p)) unlinkSync(p);
  } catch {
    // ignore
  }
}

async function getBlobStore() {
  const { getStore } = await import("@netlify/blobs");
  return getStore(BLOB_STORE);
}

export async function readJsonAsync(name, fallback = null) {
  if (netlifyBlobsEnabled()) {
    try {
      const store = await getBlobStore();
      const data = await store.get(name, { type: "json" });
      if (data != null) return data;
    } catch {
      // fall through to file for local netlify-cli quirks
    }
  }
  return readJson(name, fallback);
}

export async function writeJsonAsync(name, value) {
  if (netlifyBlobsEnabled()) {
    try {
      const store = await getBlobStore();
      await store.setJSON(name, value);
      return;
    } catch {
      // fall through
    }
  }
  writeJson(name, value);
}

export async function deleteJsonAsync(name) {
  if (netlifyBlobsEnabled()) {
    try {
      const store = await getBlobStore();
      await store.delete(name);
    } catch {
      // fall through
    }
  }
  deleteJson(name);
}

/**
 * Durable OAuthClientProvider (file locally, Netlify Blobs in prod).
 * Shared site-wide for this personal play tool.
 */
export function createOAuthProvider({
  providerKey,
  redirectUrl,
  clientMetadata,
  onRedirect,
}) {
  const prefix = `oauth-${providerKey}`;

  return {
    get redirectUrl() {
      return redirectUrl;
    },
    get clientMetadata() {
      return clientMetadata;
    },
    async clientInformation() {
      return (await readJsonAsync(`${prefix}-client`)) || undefined;
    },
    async saveClientInformation(info) {
      await writeJsonAsync(`${prefix}-client`, info);
    },
    async tokens() {
      return (await readJsonAsync(`${prefix}-tokens`)) || undefined;
    },
    async saveTokens(tokens) {
      await writeJsonAsync(`${prefix}-tokens`, {
        ...tokens,
        saved_at: Date.now(),
      });
    },
    async redirectToAuthorization(authorizationUrl) {
      await writeJsonAsync(`${prefix}-pending`, {
        url: authorizationUrl.toString(),
      });
      if (onRedirect) onRedirect(authorizationUrl);
    },
    async saveCodeVerifier(codeVerifier) {
      await writeJsonAsync(`${prefix}-verifier`, { codeVerifier });
    },
    async codeVerifier() {
      const v = await readJsonAsync(`${prefix}-verifier`);
      if (!v?.codeVerifier) {
        throw new Error(`Missing code verifier for ${providerKey}`);
      }
      return v.codeVerifier;
    },
    async saveDiscoveryState(state) {
      await writeJsonAsync(`${prefix}-discovery`, state);
    },
    async discoveryState() {
      return (await readJsonAsync(`${prefix}-discovery`)) || undefined;
    },
    async state() {
      const s = randomUUID();
      await writeJsonAsync(`${prefix}-state`, { state: s });
      return s;
    },
    async invalidateCredentials(which) {
      if (which === "all" || which === "client") {
        await deleteJsonAsync(`${prefix}-client`);
      }
      if (which === "all" || which === "tokens") {
        await deleteJsonAsync(`${prefix}-tokens`);
      }
      if (which === "all" || which === "verifier") {
        await deleteJsonAsync(`${prefix}-verifier`);
      }
    },
  };
}

/** @deprecated use createOAuthProvider */
export const createFileOAuthProvider = createOAuthProvider;

export async function getPendingAuthUrl(providerKey) {
  const pending = await readJsonAsync(`oauth-${providerKey}-pending`);
  return pending?.url || null;
}

export async function clearPendingAuth(providerKey) {
  await deleteJsonAsync(`oauth-${providerKey}-pending`);
}

export async function isConnected(providerKey) {
  const tokens = await readJsonAsync(`oauth-${providerKey}-tokens`);
  return Boolean(tokens?.access_token);
}

export async function disconnect(providerKey) {
  await deleteJsonAsync(`oauth-${providerKey}-tokens`);
  await deleteJsonAsync(`oauth-${providerKey}-pending`);
  await deleteJsonAsync(`oauth-${providerKey}-verifier`);
  await deleteJsonAsync(`oauth-${providerKey}-state`);
}

/** Sync helpers for local-only callers (prefer async on Netlify). */
export function isConnectedSync(providerKey) {
  const tokens = readJson(`oauth-${providerKey}-tokens`);
  return Boolean(tokens?.access_token);
}
