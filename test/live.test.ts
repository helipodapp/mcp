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
