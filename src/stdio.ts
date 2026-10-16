#!/usr/bin/env node
/**
 * Local MCP server over stdio: `npx -y helipod-mcp`.
 *   HELIPOD_API_KEY        Helipod API key (VPS, Container, Domain APIs)
 *   HELIPOD_EMAIL_API_KEY  optional, email API key (Email API)
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
    console.error("helipod-mcp: set HELIPOD_API_KEY (and optionally HELIPOD_EMAIL_API_KEY). Create keys in the Helipod dashboard.");
}
await server.connect(new StdioServerTransport());
