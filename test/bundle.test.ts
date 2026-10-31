// Bundle-aware container pricing against a FAKE API (fetch stub): get_bundle reads GET /containers/bundle, the paid
// container tools tell the agent to read walletDailyCost / bundle.coversIt before asking for a top-up, deploy_template
// has a dry run, and the server instructions cover the bundle, the FREE plans and the deploy steps. No network.
import { describe, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createHelipodServer, INSTRUCTIONS } from "../src/index";

const ENV = "6a0e7d1c-2b3f-4c5d-8e9f-0a1b2c3d4e5f";
function fakeApi() {
    const calls: { method: string; url: URL }[] = [];
    const f = (async (input: any, init: any = {}) => {
        const url = new URL(String(input instanceof URL ? input.href : input));
        calls.push({ method: init.method ?? "GET", url });
        const ok = (data: unknown) => new Response(JSON.stringify({ success: true, data }), { headers: { "content-type": "application/json" } });
        if (url.pathname === "/api/containers/bundle") return ok({ active: true, code: "STARTER", withinQuota: true });
        if (url.searchParams.get("dryRun") === "true") return ok({ dryRun: true, dailyCost: 1700, walletDailyCost: 0, bundle: { code: "STARTER", coversIt: true } });
        return ok({ services: [] });
    }) as typeof fetch;
    return { f, calls };
}
const connect = async (f: typeof fetch) => {
    const server = createHelipodServer({ apiKey: "hel_test", fetch: f });
    const [a, b] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test", version: "1" });
    await Promise.all([server.connect(a), client.connect(b)]);
    return client;
};
const json = (r: any) => JSON.parse(r.content[0].text);

describe("bundle-aware container pricing", () => {
    test("get_bundle is a read of GET /containers/bundle", async () => {
        const { f, calls } = fakeApi();
        const c = await connect(f);
        const tools = Object.fromEntries((await c.listTools()).tools.map(t => [t.name, t]));
        expect(tools.get_bundle.annotations?.readOnlyHint).toBe(true);
        expect(tools.get_bundle.description).toContain("top up");
        expect(json(await c.callTool({ name: "get_bundle", arguments: {} })).code).toBe("STARTER");
        expect(calls.at(-1)!.method).toBe("GET");
        expect(calls.at(-1)!.url.pathname).toBe("/api/containers/bundle");
    });
    test("paid container tools point the agent at walletDailyCost and the bundle", async () => {
        const tools = Object.fromEntries((await (await connect(fakeApi().f)).listTools()).tools.map(t => [t.name, t]));
        for (const n of ["create_service", "deploy_service", "scale_service", "resize_volume", "deploy_template", "create_stack"]) {
            expect(tools[n].description, n).toContain("walletDailyCost");
            expect(tools[n].description, n).toContain("NO top-up");
            expect(tools[n].description, n).toMatch(/COSTS MONEY/);
        }
        expect(tools.upgrade_database.description).toContain("FREE plan");
    });
    test("deploy_template dry run sends ?dryRun=true and returns the bundle answer", async () => {
        const { f, calls } = fakeApi();
        const c = await connect(f);
        const r = json(await c.callTool({ name: "deploy_template", arguments: { environmentId: ENV, slug: "n8n", dryRun: true } }));
        expect(calls.at(-1)!.url.searchParams.get("dryRun")).toBe("true");
        expect(r.walletDailyCost).toBe(0);
        await c.callTool({ name: "deploy_template", arguments: { environmentId: ENV, slug: "n8n", idempotencyKey: "tpl-0001-abc" } });
        expect(calls.at(-1)!.url.searchParams.get("dryRun")).toBeNull();
    });
    test("instructions: bundle, free plans, deploy steps", () => {
        for (const s of ["get_bundle", "walletDailyCost", "never ask for a top-up", "FREE plan", "create_database", "Deploying an app, step by step"]) expect(INSTRUCTIONS).toContain(s);
    });
});
