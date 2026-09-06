/**
 * Public site origin for OAuth redirects.
 * Set COMPARI5_BASE_URL on Netlify to https://your-site.netlify.app
 */
export function getBaseUrl(request) {
  const fromEnv = (
    process.env.COMPARI5_BASE_URL ||
    process.env.URL ||
    process.env.DEPLOY_PRIME_URL ||
    ""
  ).replace(/\/$/, "");
  if (fromEnv) return fromEnv;

  if (request?.nextUrl?.origin) return request.nextUrl.origin;
  if (request?.headers) {
    const host =
      request.headers.get("x-forwarded-host") || request.headers.get("host");
    const proto = request.headers.get("x-forwarded-proto") || "https";
    if (host) return `${proto}://${host}`;
  }

  return "http://localhost:3000";
}
