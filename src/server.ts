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
import { accountTools } from "./tools/account.js";
import { aiTools } from "./tools/ai.js";
import { generalTools } from "./tools/general.js";

export const VERSION = "0.5.7";

export const INSTRUCTIONS = `Helipod is a cloud platform (Indonesia): containers, managed Postgres databases, VPS, domains, email and an AI gateway, billed from a prepaid wallet in Rupiah.
- Start with list_projects to find projects and environment ids. Account tools (get_wallet, invoices, statements, notifications, get_project_activity, support tickets) cover the account; AI tools (list_ai_models, get_ai_overview, get_ai_usage, AI keys, top-ups) cover the AI gateway.
- Anything that costs money (create/deploy/scale services, resize volumes, upgrade a database plan, create/renew/upgrade VPS, VPS backups, register/renew/transfer domains, email plans and inbox add-ons, AI top-ups and auto top-up): call it with dryRun=true first (or the price lookup when it has no dry run), tell the user the cost in IDR and the wallet balance after, and wait for an explicit yes before the real call. Never treat silence or an earlier general OK as a yes.
- Destructive tools (delete, terminate, reinstall, rollback, restore a backup or an import, copy a backup onto another VPS, replace DNS, revoke a key, remove an SSH key or port forward, send a broadcast, execute_database_sql): confirm with the user and name what will be lost. Before execute_database_sql, run classify_database_sql.
- Email: when a project has no email yet (email_status shows activated false) or its plan ended, start it with buy_email_plan (dryRun first; the FREE plan costs nothing, still confirm). That also sets email up for the project; then add and verify a sending domain.
- Before replacing all DNS records (set_dns_records), read list_dns_records and keep every record the user still needs. Before sending or scheduling a broadcast, tell the user how many contacts it reaches. Before deleting or replacing code, files or variables, read the current value. After renaming a service, fix the variable references listed in warnings.
- Databases: get_database_connection returns a password; put it in a secret variable (DATABASE_URL) instead of code or chat.
- Migrate (free): create_vps_import returns a one-time command for the USER to run as root on their old server (never run it yourself); before the first restore_vps_import, show fetchedIp and ask the user to confirm it is their server.
- Deploys and VPS actions run in the background: poll get_deployment / get_vps until they settle; on a failed deploy read get_deployment_logs.
- Never print secrets (passwords, secret variable values, secret files) unless the user asks for them. Domain owner details are personal data: use only what the user gave.
- Errors come back as { status, code, error }: 401/403 means the key lacks access (keys choose products and projects in Settings → API keys; wallet, invoices, tickets and AI money need a whole-account key: with a sign-in, reconnect and choose Whole account), 402 means plan limit or low balance.
Docs: https://docs.helipod.io`;

export const ALL_TOOLS = [...containerTools, ...databaseTools, ...vpsTools, ...domainTools, ...emailTools, ...accountTools, ...aiTools, ...generalTools];

export function createHelipodServer(config: HelipodConfig): McpServer {
    const server = new McpServer({ name: "helipod", version: VERSION, title: "Helipod" }, { instructions: INSTRUCTIONS });
    const api = new HelipodClient({ userAgent: `helipod-mcp/${VERSION}`, ...config });
    register(server, api, ALL_TOOLS);
    return server;
}
