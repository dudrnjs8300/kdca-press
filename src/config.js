import path from "node:path";

export function loadConfig(env = process.env) {
  const base = new URL(env.PUBLIC_BASE_URL || "http://127.0.0.1:3000");
  const local = ["127.0.0.1", "localhost", "[::1]"].includes(base.hostname);
  if (
    base.pathname !== "/" ||
    base.search ||
    base.hash ||
    base.username ||
    base.password
  )
    throw new Error("PUBLIC_BASE_URL must be an origin without a path.");
  if (!local && base.protocol !== "https:")
    throw new Error("Public deployments require HTTPS.");
  const demo = env.DEMO_MODE === "true";
  if (demo && (!local || env.NODE_ENV === "production"))
    throw new Error("Demo mode is restricted to local development.");
  if (!demo && (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET))
    throw new Error(
      "Configure GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET, or run the local demo.",
    );
  const number = (key, fallback, min, max) => {
    const n = Number(env[key] ?? fallback);
    if (!Number.isInteger(n) || n < min || n > max)
      throw new Error(`Invalid ${key}`);
    return n;
  };
  return {
    baseUrl: base.origin,
    resource: `${base.origin}/mcp`,
    local,
    demo,
    port: number("PORT", base.port || 3000, 1, 65535),
    host: demo ? "127.0.0.1" : "0.0.0.0",
    dataDir: path.resolve(env.DATA_DIR || "data"),
    githubClientId: env.GITHUB_CLIENT_ID,
    githubClientSecret: env.GITHUB_CLIENT_SECRET,
    allowedGithubIds: (env.ALLOWED_GITHUB_IDS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    trustProxy: number("TRUST_PROXY", 0, 0, 3),
    maxDocuments: number("MAX_DOCUMENTS_PER_USER", 100, 1, 1000),
    maxSourceChars: number("MAX_SOURCE_CHARS", 24000, 500, 50000),
    secureCookie: base.protocol === "https:",
  };
}
