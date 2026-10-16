/**
 * server.ts — builds the Helipod MCP server: every tool, plus instructions the client shows the model.
 * Used by the stdio entry (npx helipod-mcp) and by the hosted HTTP endpoint (https://api.helipod.io/mcp).
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { HelipodClient, type HelipodConfig } from "./client.js";
import { register } from "./tool.js";
import { containerTools } from "./tools/containers.js";
import { vpsTools } from "./tools/vps.js";
import { domainTools } from "./tools/domains.js";
import { emailTools } from "./tools/email.js";
import { databaseTools } from "./tools/databases.js";
import { generalTools } from "./tools/general.js";

export const VERSION = "0.3.0";

export const INSTRUCTIONS = `Helipod is a cloud platform (Indonesia): containers, managed Postgres databases, VPS, domains, email and an AI gateway, billed from a prepaid wallet in Rupiah.
- Start with list_projects to find projects and environment ids.
- Anything that costs money (create/deploy/scale services, upgrade a database plan, create/renew/upgrade VPS, register/renew/transfer domains): run the dryRun or price lookup first, tell the user the cost in IDR and wait for an explicit yes.
- Destructive tools (delete, terminate, reinstall, rollback, replace DNS, execute_database_sql): confirm with the user and name what will be lost.
- Databases: get_database_connection returns a password; put it in a secret variable (DATABASE_URL) instead of code or chat.
- Deploys and VPS actions run in the background: poll get_deployment / get_vps until they settle; on a failed deploy read get_deployment_logs.
- Never print secrets (passwords, secret variable values) unless the user asks for them.
- Errors come back as { status, code, error }: 401/403 means the key lacks access (keys choose products and projects in Settings → API keys), 402 means plan limit or low balance.
Docs: https://docs.helipod.io`;

export const ALL_TOOLS = [...containerTools, ...databaseTools, ...vpsTools, ...domainTools, ...emailTools, ...generalTools];

export function createHelipodServer(config: HelipodConfig): McpServer {
    const server = new McpServer({ name: "helipod", version: VERSION, title: "Helipod" }, { instructions: INSTRUCTIONS });
    const api = new HelipodClient({ userAgent: `helipod-mcp/${VERSION}`, ...config });
    register(server, api, ALL_TOOLS);
    return server;
}
