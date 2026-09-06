import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { auth } from "@modelcontextprotocol/sdk/client/auth.js";
import { fetch as undiciFetch } from "undici";
import {
  createOAuthProvider,
  getPendingAuthUrl,
  clearPendingAuth,
  isConnected,
  disconnect,
  readJsonAsync,
  writeJsonAsync,
} from "./store.js";
import { getBaseUrl } from "./base-url.js";

// Next.js patches global fetch (can hang on some OAuth hosts). Use undici.
const rawFetch = undiciFetch;

const PROVIDERS = {
  swiggy: {
    key: "swiggy",
    serverUrl: "https://mcp.swiggy.com/im",
    redirectPath: "/api/auth/swiggy/callback",
    clientMetadata: {
      client_name: "Compari5",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: "mcp:tools",
    },
  },
  zepto: {
    key: "zepto",
    serverUrl: "https://mcp.zepto.co.in/mcp",
    redirectPath: "/api/auth/zepto/callback",
    clientMetadata: {
      client_name: "Compari5",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: "tools:read tools:write",
    },
  },
};

function providerConfig(name) {
  const cfg = PROVIDERS[name];
  if (!cfg) throw new Error(`Unknown auth provider: ${name}`);
  return cfg;
}

function makeProvider(cfg, base, onRedirect) {
  const redirectUrl = `${base}${cfg.redirectPath}`;
  return {
    redirectUrl,
    provider: createOAuthProvider({
      providerKey: cfg.key,
      redirectUrl,
      clientMetadata: {
        ...cfg.clientMetadata,
        redirect_uris: [redirectUrl],
      },
      onRedirect,
    }),
  };
}

export async function authStatus() {
  const [swiggyOk, zeptoOk, swiggyTokens, zeptoTokens, address] =
    await Promise.all([
      isConnected("swiggy"),
      isConnected("zepto"),
      readJsonAsync("oauth-swiggy-tokens"),
      readJsonAsync("oauth-zepto-tokens"),
      readJsonAsync("swiggy-address"),
    ]);

  return {
    swiggy: swiggyOk,
    zepto: zeptoOk,
    swiggySyncedAt: swiggyTokens?.saved_at || null,
    zeptoSyncedAt: zeptoTokens?.saved_at || null,
    swiggyAddress: address
      ? { id: address.addressId, label: address.label }
      : null,
  };
}

export async function disconnectProvider(name) {
  await disconnect(name);
}

export async function startOAuth(name, request) {
  const cfg = providerConfig(name);
  const base = getBaseUrl(request);
  let redirectTo = null;

  const { provider } = makeProvider(cfg, base, (url) => {
    redirectTo = url.toString();
  });

  const result = await auth(provider, {
    serverUrl: new URL(cfg.serverUrl),
    fetchFn: rawFetch,
  });
  if (result === "AUTHORIZED") {
    return { status: "authorized", base };
  }

  const url = redirectTo || (await getPendingAuthUrl(cfg.key));
  if (!url) throw new Error("OAuth did not produce a redirect URL");
  return { status: "redirect", url, base };
}

export async function finishOAuth(name, code, request) {
  const cfg = providerConfig(name);
  const base = getBaseUrl(request);
  const { provider } = makeProvider(cfg, base);

  const result = await auth(provider, {
    serverUrl: new URL(cfg.serverUrl),
    authorizationCode: code,
    fetchFn: rawFetch,
  });

  await clearPendingAuth(cfg.key);
  if (result !== "AUTHORIZED") {
    throw new Error(`Unexpected OAuth result: ${result}`);
  }
  return { status: "authorized", base };
}

function parseToolResult(result) {
  if (result?.structuredContent) return result.structuredContent;
  const texts = (result?.content || [])
    .filter((c) => c.type === "text")
    .map((c) => c.text);
  for (const t of texts) {
    try {
      return JSON.parse(t);
    } catch {
      // continue
    }
  }
  if (texts.length === 1) return { message: texts[0], raw: texts[0] };
  return result;
}

export async function callMcpTool(name, toolName, args = {}, request) {
  const cfg = providerConfig(name);
  if (!(await isConnected(cfg.key))) {
    throw new Error(`${name} is not signed in. Use Sign in and complete the phone OTP.`);
  }

  const base = getBaseUrl(request);
  const { provider } = makeProvider(cfg, base);

  await auth(provider, {
    serverUrl: new URL(cfg.serverUrl),
    fetchFn: rawFetch,
  });

  const client = new Client(
    { name: "compari5", version: "0.1.0" },
    { capabilities: {} }
  );

  const transport = new StreamableHTTPClientTransport(new URL(cfg.serverUrl), {
    authProvider: provider,
    fetch: rawFetch,
  });

  try {
    await client.connect(transport);
    const result = await client.callTool({ name: toolName, arguments: args });
    return parseToolResult(result);
  } finally {
    try {
      await client.close();
    } catch {
      // ignore
    }
  }
}

export async function listMcpTools(name, request) {
  const cfg = providerConfig(name);
  if (!(await isConnected(cfg.key))) {
    throw new Error(`${name} is not signed in. Use Sign in and complete the phone OTP.`);
  }

  const base = getBaseUrl(request);
  const { provider } = makeProvider(cfg, base);

  await auth(provider, {
    serverUrl: new URL(cfg.serverUrl),
    fetchFn: rawFetch,
  });

  const client = new Client(
    { name: "compari5", version: "0.1.0" },
    { capabilities: {} }
  );

  const transport = new StreamableHTTPClientTransport(new URL(cfg.serverUrl), {
    authProvider: provider,
    fetch: rawFetch,
  });

  try {
    await client.connect(transport);
    const listed = await client.listTools();
    return listed?.tools || [];
  } finally {
    try {
      await client.close();
    } catch {
      // ignore
    }
  }
}

export async function getCachedAddressId() {
  const row = await readJsonAsync("swiggy-address");
  return row?.addressId || null;
}

export async function setCachedAddressId(addressId, label) {
  await writeJsonAsync("swiggy-address", {
    addressId,
    label,
    saved_at: Date.now(),
  });
}
