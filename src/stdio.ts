#!/usr/bin/env node
/**
 * Local MCP server over stdio: `npx -y helipod-mcp`.
 *   HELIPOD_API_KEY        Helipod API key (VPS, Container, Domain APIs)
 *   HELIPOD_EMAIL_API_KEY  optional, a separate email key (else HELIPOD_API_KEY with the Email API enabled)
 *   HELIPOD_API_URL / HELIPOD_EMAIL_API_URL  optional, other base URLs
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createHelipodServer, VERSION } from "./server.js";

if (process.argv.includes("--version")) { console.log(VERSION); process.exit(0); }

const server = createHelipodServer({
    apiKey: process.env.HELIPOD_API_KEY,
    emailApiKey: process.env.HELIPOD_EMAIL_API_KEY,
    apiUrl: process.env.HELIPOD_API_URL,
    emailApiUrl: process.env.HELIPOD_EMAIL_API_URL,
});
if (!process.env.HELIPOD_API_KEY && !process.env.HELIPOD_EMAIL_API_KEY) {
    console.error("helipod-mcp: set HELIPOD_API_KEY (enable the Email API on it for the email tools). Create keys in the Helipod dashboard: Project → Settings → API keys.");
}
await server.connect(new StdioServerTransport());
