// End-to-end: an MCP client talks to the Helipod MCP server (in memory) which calls the LIVE public API.
// Needs HELIPOD_TEST_KEY (a throwaway key with containers/vps/domains) and HELIPOD_TEST_ENV (an environment id).
// Only reads and dry runs: nothing is created or charged.
import { describe, expect, test, beforeAll } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createHelipodServer, ALL_TOOLS } from "../src/index";

const KEY = process.env.HELIPOD_TEST_KEY, ENV = process.env.HELIPOD_TEST_ENV;
const connect = async (cfg: Parameters<typeof createHelipodServer>[0]) => {
    const server = createHelipodServer(cfg);
    const [a, b] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test", version: "1" });
    await Promise.all([server.connect(a), client.connect(b)]);
    return client;
};
const json = (r: any) => JSON.parse(r.content[0].text);

describe("tool catalog", () => {
    test("every tool is listed with annotations and a schema", async () => {
        const c = await connect({ apiKey: "hel_x" });
        const { tools } = await c.listTools();
        expect(tools.length).toBe(ALL_TOOLS.length);
        expect(new Set(tools.map(t => t.name)).size).toBe(tools.length);
        for (const t of tools) {
            expect(t.description!.length).toBeGreaterThan(20);
            expect(t.inputSchema.type).toBe("object");
            expect(typeof t.annotations?.readOnlyHint).toBe("boolean");
        }
        const byName = Object.fromEntries(tools.map(t => [t.name, t]));
        expect(byName.list_services.annotations?.readOnlyHint).toBe(true);
        expect(byName.delete_service.annotations?.destructiveHint).toBe(true);
        expect(byName.terminate_vps.annotations?.destructiveHint).toBe(true);
        for (const n of ["restore_vps_backup", "send_email_broadcast", "disable_whois_privacy"]) expect(byName[n].annotations?.destructiveHint).toBe(true);
        for (const n of ["create_service", "deploy_service", "create_vps", "register_domain", "renew_vps", "activate_vps_backup"]) expect(byName[n].description).toMatch(/COSTS MONEY/);
    });
    test("money tools dry-run first, deletes are destructive, new routes are covered", async () => {
        const c = await connect({ apiKey: "hel_x" });
        const { tools } = await c.listTools();
        const byName = Object.fromEntries(tools.map(t => [t.name, t]));
        // Every tool with a dry run that spends money says so, and tells the model to dry-run first.
        const money = [
            "create_service", "deploy_service", "scale_service", "resize_volume", "create_stack", "upgrade_database",
            "register_domain", "transfer_domain", "renew_domain",
            "buy_email_plan", "renew_email_plan", "change_email_plan", "buy_email_inbox_addon",
            "topup_ai_balance", "set_ai_auto_topup",
        ];
        for (const n of money) {
            expect(byName[n], n).toBeDefined();
            expect(byName[n].description, n).toMatch(/COSTS MONEY/);
            expect(byName[n].description, n).toMatch(/dryRun/);
            expect(Object.keys(byName[n].inputSchema.properties ?? {}), n).toContain("dryRun");
            expect(byName[n].annotations?.readOnlyHint, n).toBe(false);
        }
        // Any tool whose description says COSTS MONEY and that has a dryRun input must tell the model to use it.
        for (const t of tools) {
            if (/COSTS MONEY/.test(t.description!) && "dryRun" in (t.inputSchema.properties ?? {})) expect(t.description, t.name).toMatch(/dryRun/);
        }
        // Every delete / remove / revoke / terminate tool is marked destructive.
        for (const t of tools) {
            if (/^(delete|remove|revoke|terminate)_/.test(t.name)) expect(t.annotations?.destructiveHint, t.name).toBe(true);
        }
        for (const n of ["delete_project", "delete_environment", "delete_project_variable", "delete_secret_file", "remove_vps_port", "remove_vps_ssh_key", "revoke_ai_key"]) {
            expect(byName[n].annotations?.destructiveHint, n).toBe(true);
        }
        for (const n of [
            "get_wallet", "list_wallet_transactions", "list_invoices", "get_invoice", "list_statements", "get_statement", "list_notifications",
            "get_unread_notification_count", "get_project_activity", "list_support_tickets", "get_support_ticket", "list_ai_models", "get_ai_overview",
            "get_ai_usage", "get_ai_metrics", "list_ai_keys", "classify_database_sql", "get_database_stats", "get_database_balance", "get_email_plan",
            "list_email_plans", "get_vps_upgrade_options", "get_vps_metrics", "list_vps_ports", "list_vps_ssh_keys", "list_project_variables",
            "get_function_code", "list_secret_files",
        ]) expect(byName[n].annotations?.readOnlyHint, n).toBe(true);
        expect(byName.upgrade_vps.description).toMatch(/get_vps_upgrade_options/);
        expect(byName.execute_database_sql.description).toMatch(/classify_database_sql/);
        expect(byName.update_service.inputSchema.properties).toHaveProperty("name");
        expect(byName.update_service.description).toMatch(/warnings/);
    });
    test("paid calls send an Idempotency-Key, dry runs don't; ids stay one path segment", async () => {
        const seen: { url: string; method: string; idem: string | null; body: any }[] = [];
        const fake = (async (url: URL, init: RequestInit) => {
            const h = init.headers as Record<string, string>;
            seen.push({ url: String(url), method: String(init.method), idem: h["idempotency-key"] ?? null, body: init.body ? JSON.parse(String(init.body)) : undefined });
            return new Response(JSON.stringify({ success: true, data: { ok: true } }), { status: 200 });
        }) as unknown as typeof fetch;
        const c = await connect({ apiKey: "hel_x", fetch: fake });
        await c.callTool({ name: "topup_ai_balance", arguments: { amount: 50000, dryRun: true } });
        await c.callTool({ name: "topup_ai_balance", arguments: { amount: 50000 } });
        await c.callTool({ name: "topup_ai_balance", arguments: { packId: "p1", idempotencyKey: "retry-key-123" } });
        await c.callTool({ name: "buy_email_plan", arguments: { planCode: "STARTER", dryRun: true } });
        await c.callTool({ name: "buy_email_inbox_addon", arguments: { extraMailboxes: 2, extraStorageGb: 0 } });
        await c.callTool({ name: "register_domain", arguments: { name: "example.id", dryRun: true } });
        await c.callTool({ name: "remove_vps_ssh_key", arguments: { vpsId: "v1", fingerprint: "SHA256:ab+c/d=" } });
        await c.callTool({ name: "delete_project", arguments: { projectId: "00000000-0000-4000-8000-000000000000", confirm: "My app" } });
        expect(seen[0].url).toBe("https://api.helipod.io/api/ai/topup?dryRun=true");
        expect(seen[0].idem).toBeNull();
        expect(seen[1].url).toBe("https://api.helipod.io/api/ai/topup");
        expect(seen[1].idem).toMatch(/^[0-9a-f-]{36}$/);
        expect(seen[2].idem).toBe("retry-key-123");
        expect(seen[3].url).toBe("https://mail.helipod.io/api/email/plan?dryRun=true");
        expect(seen[3].idem).toBeNull();
        expect(seen[4].url).toBe("https://mail.helipod.io/api/email/plan/addons");
        expect(seen[4].idem).toMatch(/^[0-9a-f-]{36}$/);
        expect(seen[5].url).toBe("https://api.helipod.io/api/domains/register?dryRun=true");
        expect(seen[6].url).toBe("https://api.helipod.io/api/vps/v1/ssh-keys/ab-c_d");
        expect(seen[6].method).toBe("DELETE");
        expect(seen[7].body).toEqual({ confirm: "My app" });
    });
    test("helipod_request reaches the Account and AI APIs", async () => {
        const urls: string[] = [];
        const fake = (async (url: URL) => { urls.push(String(url)); return new Response(JSON.stringify({ success: true, data: {} })); }) as unknown as typeof fetch;
        const c = await connect({ apiKey: "hel_x", fetch: fake });
        for (const path of ["/account/wallet", "/ai/usage"]) {
            const r: any = await c.callTool({ name: "helipod_request", arguments: { api: "core", method: "GET", path } });
            expect(r.isError).toBeFalsy();
        }
        expect(urls).toEqual(["https://api.helipod.io/api/account/wallet", "https://api.helipod.io/api/ai/usage"]);
    });
    test("server instructions are sent to the client", async () => {
        const c = await connect({ apiKey: "hel_x" });
        expect(c.getInstructions()).toContain("dryRun");
    });
});

describe("errors an agent can act on", () => {
    test("bad key → isError with status 401", async () => {
        const c = await connect({ apiKey: "hel_" + "0".repeat(48) });
        const r: any = await c.callTool({ name: "list_projects", arguments: {} });
        expect(r.isError).toBe(true);
        expect(json(r).status).toBe(401);
    });
    test("email tool with no key at all → NO_API_KEY", async () => {
        const c = await connect({});
        const r: any = await c.callTool({ name: "email_status", arguments: {} });
        expect(r.isError).toBe(true);
        expect(json(r).code).toBe("NO_API_KEY");
    });
    test("email tool falls back to the Helipod key (here an invalid one → 401 from the Email API)", async () => {
        const c = await connect({ apiKey: "hel_" + "0".repeat(48) });
        const r: any = await c.callTool({ name: "email_status", arguments: {} });
        expect(r.isError).toBe(true);
        expect(json(r).status).toBe(401);
    });
    test("helipod_request refuses paths outside the APIs", async () => {
        const c = await connect({ apiKey: "hel_x" });
        const r: any = await c.callTool({ name: "helipod_request", arguments: { api: "core", method: "GET", path: "/internal/cache" } });
        expect(r.isError).toBe(true);
    });
    test("create_service needs exactly one source", async () => {
        const c = await connect({ apiKey: "hel_x" });
        const r: any = await c.callTool({ name: "create_service", arguments: { environmentId: "00000000-0000-4000-8000-000000000000", name: "web" } });
        expect(r.isError).toBe(true);
        expect(json(r).error).toMatch(/exactly one source/);
    });
});

describe.skipIf(!KEY || !ENV)("live API (read-only + dry runs)", () => {
    let c: Client;
    beforeAll(async () => { c = await connect({ apiKey: KEY, apiUrl: process.env.HELIPOD_TEST_API_URL }); });
    test("list_projects", async () => {
        const r: any = await c.callTool({ name: "list_projects", arguments: {} });
        expect(r.isError).toBeFalsy();
        expect(Array.isArray(json(r))).toBe(true);
        expect(json(r)[0].environments.some((e: any) => e.id === ENV)).toBe(true);
    });
    test("list_services", async () => {
        const r: any = await c.callTool({ name: "list_services", arguments: { environmentId: ENV } });
        expect(r.isError).toBeFalsy();
    });
    test("create_service dry run returns a cost and creates nothing", async () => {
        const r: any = await c.callTool({ name: "create_service", arguments: { environmentId: ENV, name: "web", image: "nginx:alpine", ports: [{ port: 80 }], dryRun: true } });
        expect(r.isError).toBeFalsy();
        expect(json(r).dryRun).toBe(true);
        expect(json(r).dailyCost).toBeGreaterThan(0);
        const s: any = await c.callTool({ name: "list_services", arguments: { environmentId: ENV } });
        expect(json(s).length).toBe(0);
    });
    test("list_templates", async () => {
        const r: any = await c.callTool({ name: "list_templates", arguments: { search: "postgres" } });
        expect(json(r).some((t: any) => t.slug === "postgres")).toBe(true);
    });
    test("list_vps_plans", async () => {
        const r: any = await c.callTool({ name: "list_vps_plans", arguments: {} });
        expect(r.isError).toBeFalsy();
        expect(JSON.stringify(json(r))).not.toMatch(/tencent|contabo/i);
    });
    test("list_vps", async () => {
        const r: any = await c.callTool({ name: "list_vps", arguments: {} });
        expect(r.isError).toBeFalsy();
    });
    test("domain_prices (no key needed)", async () => {
        const r: any = await c.callTool({ name: "domain_prices", arguments: { limit: 3 } });
        expect(r.isError).toBeFalsy();
        expect(json(r).data[0].whois_protection).toBe(20000);
    });
    test("list_my_domains", async () => {
        const r: any = await c.callTool({ name: "list_my_domains", arguments: {} });
        expect(r.isError).toBeFalsy();
    });
});
