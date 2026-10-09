import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { waitForRemoteReady } from './remote-ready.js';
const base = new URL(process.env.PUBLIC_BASE_URL);
if (base.protocol !== "https:")
  throw new Error("Remote verification requires HTTPS");
await waitForRemoteReady(base);
for (const route of [
  "/healthz",
  "/.well-known/oauth-authorization-server",
  "/.well-known/oauth-protected-resource/mcp",
]) {
  const r = await fetch(new URL(route, base));
  if (!r.ok) throw new Error(`${route}: ${r.status}`);
  const j = await r.json();
  console.log(route, j.status || j.issuer || j.resource);
}
const denied = await fetch(new URL("/mcp", base), {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: "{}",
});
if (denied.status !== 401 || !denied.headers.get("www-authenticate"))
  throw new Error("Unauthenticated MCP must issue an OAuth challenge.");
if (process.env.MCP_ACCESS_TOKEN) {
  const client = new Client({
    name: "kdca-press-deployment-check",
    version: "1.0.0",
  });
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL("/mcp", base), {
        requestInit: {
          headers: { Authorization: `Bearer ${process.env.MCP_ACCESS_TOKEN}` },
        },
      }),
    );
    const tools = await client.listTools();
    const expected = ['kdca_guide', 'kdca_prepare', 'kdca_review', 'kdca_generate', 'kdca_get_artifact'];
    if (tools.tools.length !== expected.length || expected.some(name => !tools.tools.some(t => t.name === name)))
      throw new Error("Unexpected tool listing");
    console.log("Authenticated MCP initialization and tool discovery passed.");
  } finally {
    await client.close();
  }
} else
  console.log(
    "Public discovery passed. Authenticated checks require an OAuth-issued token; never paste it into chat.",
  );
