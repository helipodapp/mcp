// VPS paid tools against a FAKE API (fetch stub): dry run (price only, no Idempotency-Key), the real call with the
// caller's Idempotency-Key or a generated one, autoRenew on create, set_vps_auto_renew. No network.
import { describe, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createHelipodServer } from "../src/index";

const VPS = "1f757fd5-98d1-490a-81a0-58b5798a5815";
const PROJECT = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

function fakeApi() {
    const calls: { method: string; url: URL; headers: Record<string, string>; body: any }[] = [];
    const f = (async (input: any, init: any = {}) => {
        const url = new URL(String(input instanceof URL ? input.href : input));
        calls.push({ method: init.method ?? "GET", url, headers: init.headers ?? {}, body: init.body ? JSON.parse(init.body) : undefined });
        const ok = (data: unknown) => new Response(JSON.stringify({ success: true, data }), { headers: { "content-type": "application/json" } });
        if (url.searchParams.get("dryRun") === "true") return ok({ dryRun: true, price: 64900, currency: "IDR", walletBalance: 100000, walletBalanceAfter: 35100, enoughBalance: true });
        if (url.pathname === "/api/vps") return ok({ instance: { id: VPS, status: "provisioning" }, password: "x" });
        if (url.pathname === `/api/vps/${VPS}/auto-renew`) return ok({ autoRenew: JSON.parse(init.body).autoRenew });
        return ok({ id: VPS });
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
const create = { projectId: PROJECT, planId: "p1", name: "web-1", osType: "ubuntu", osVersion: "24.04", rootPassword: "Str0ng!Passw0rd" };

describe("VPS paid tools", () => {
    test("described: dry run first; set_vps_auto_renew is listed and idempotent", async () => {
        const tools = Object.fromEntries((await (await connect(fakeApi().f)).listTools()).tools.map(t => [t.name, t]));
        for (const n of ["create_vps", "renew_vps", "upgrade_vps"]) {
            expect(tools[n].description).toContain("dryRun=true");
            expect(Object.keys((tools[n].inputSchema as any).properties)).toEqual(expect.arrayContaining(["dryRun", "idempotencyKey"]));
        }
        expect(Object.keys((tools.create_vps.inputSchema as any).properties)).toContain("autoRenew");
        expect(tools.set_vps_auto_renew.annotations?.idempotentHint).toBe(true);
        expect(tools.toggle_vps_auto_renew).toBeDefined();
    });

    test("create dry run: ?dryRun=true, no Idempotency-Key, dryRun/idempotencyKey not in the body", async () => {
        const { f, calls } = fakeApi();
        const r = await (await connect(f)).callTool({ name: "create_vps", arguments: { ...create, dryRun: true, idempotencyKey: "order-0001-abc" } });
        expect(json(r).price).toBe(64900);
        expect(calls[0].url.searchParams.get("dryRun")).toBe("true");
        expect(calls[0].headers["idempotency-key"]).toBeUndefined();
        expect(calls[0].body).toEqual(create);
    });

    test("create: the caller's Idempotency-Key and autoRenew are sent; the body is the API's create body", async () => {
        const { f, calls } = fakeApi();
        await (await connect(f)).callTool({ name: "create_vps", arguments: { ...create, autoRenew: false, idempotencyKey: "order-0001-abc" } });
        expect(calls[0].url.search).toBe("");
        expect(calls[0].headers["idempotency-key"]).toBe("order-0001-abc");
        expect(calls[0].body).toEqual({ ...create, autoRenew: false });
    });

    test("create without a key: one is generated", async () => {
        const { f, calls } = fakeApi();
        await (await connect(f)).callTool({ name: "create_vps", arguments: create });
        expect(calls[0].headers["idempotency-key"]).toMatch(/^[0-9a-f-]{36}$/);
        expect(calls[0].body).toEqual(create);
    });

    test("renew and upgrade: dry run and real call", async () => {
        const { f, calls } = fakeApi();
        const c = await connect(f);
        await c.callTool({ name: "renew_vps", arguments: { vpsId: VPS, billingPeriod: "monthly", dryRun: true } });
        await c.callTool({ name: "renew_vps", arguments: { vpsId: VPS, billingPeriod: "monthly", idempotencyKey: "renew-0001-abc" } });
        await c.callTool({ name: "upgrade_vps", arguments: { vpsId: VPS, planId: "p2", dryRun: true } });
        await c.callTool({ name: "upgrade_vps", arguments: { vpsId: VPS, planId: "p2" } });
        expect(calls.map(x => `${x.url.pathname}${x.url.search}`)).toEqual([
            `/api/vps/${VPS}/renew?dryRun=true`, `/api/vps/${VPS}/renew`, `/api/vps/${VPS}/upgrade?dryRun=true`, `/api/vps/${VPS}/upgrade`,
        ]);
        expect(calls[0].headers["idempotency-key"]).toBeUndefined();
        expect(calls[1].headers["idempotency-key"]).toBe("renew-0001-abc");
        expect(calls[2].headers["idempotency-key"]).toBeUndefined();
        expect(calls[3].headers["idempotency-key"]).toBeTruthy();
        expect(calls[1].body).toEqual({ billingPeriod: "monthly" });
        expect(calls[3].body).toEqual({ planId: "p2" });
    });

    test("set_vps_auto_renew posts the value", async () => {
        const { f, calls } = fakeApi();
        const r = await (await connect(f)).callTool({ name: "set_vps_auto_renew", arguments: { vpsId: VPS, autoRenew: false } });
        expect(json(r).autoRenew).toBe(false);
        expect(calls[0].method).toBe("POST");
        expect(calls[0].url.pathname).toBe(`/api/vps/${VPS}/auto-renew`);
        expect(calls[0].body).toEqual({ autoRenew: false });
    });
});
