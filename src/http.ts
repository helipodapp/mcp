/**
 * Hosted MCP over Streamable HTTP (stateless): one server per request, keys from the request headers.
 *   Authorization: Bearer hel_…           Helipod API key
 *   X-Helipod-Email-Key: hel_…            optional, email API key
 * Works with any runtime that speaks web Request/Response (Bun, Elysia, Deno, Node 18+ adapters).
 */
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createHelipodServer } from "./server.js";
import type { HelipodConfig } from "./client.js";

export async function handleMcpRequest(request: Request, base: Omit<HelipodConfig, "apiKey" | "emailApiKey"> = {}): Promise<Response> {
    const auth = request.headers.get("authorization") ?? "";
    const apiKey = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : undefined;
    const emailApiKey = request.headers.get("x-helipod-email-key")?.trim() || undefined;
    if (!apiKey && !emailApiKey) {
        return new Response(JSON.stringify({ jsonrpc: "2.0", error: { code: -32001, message: "Send your Helipod API key as Authorization: Bearer <key>" }, id: null }), {
            status: 401, headers: { "content-type": "application/json", "www-authenticate": "Bearer" },
        });
    }
    const server = createHelipodServer({ ...base, apiKey, emailApiKey });
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    await server.connect(transport);
    try {
        return await transport.handleRequest(request);
    } finally {
        // Stateless: nothing to keep once the response is built.
        void transport.close().catch(() => { });
        void server.close().catch(() => { });
    }
}
