/**
 * Outbound HTTP(S) proxy for Blinkit / Minutes (residential preferred).
 * Example: http://user:pass@gate.provider.com:10000
 */
export function residentialProxyUrl() {
  return (
    process.env.RESIDENTIAL_PROXY_URL ||
    process.env.HTTPS_PROXY ||
    process.env.HTTP_PROXY ||
    ""
  )
    .trim()
    .replace(/\/$/, "");
}

export function homeProxyEnabled() {
  return (
    process.env.ENABLE_HOME_PROXY === "1" ||
    process.env.ENABLE_HOME_PROXY === "true"
  );
}

/** True on Netlify / typical serverless hosts. */
export function isCloudRuntime() {
  return Boolean(
    process.env.NETLIFY ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.VERCEL
  );
}
