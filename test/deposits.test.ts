// Deposit tools against a FAKE API (fetch stub): create (body, dry run without Idempotency-Key, real call with one),
// get and list. No network.
import { describe, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createHelipodServer } from "../src/index";

const DEP = "3b0f6c2e-8f4a-4c55-9a51-2f1d0e7c9a10";
function fakeApi() {
    const calls: { method: string; url: URL; headers: Record<string, string>; body: any }[] = [];
    const f = (async (input: any, init: any = {}) => {
        const url = new URL(String(input instanceof URL ? input.href : input));
        calls.push({ method: init.method ?? "GET", url, headers: init.headers ?? {}, body: init.body ? JSON.parse(init.body) : undefined });
        const ok = (data: unknown) => new Response(JSON.stringify({ success: true, data }), { headers: { "content-type": "application/json" } });
        if (url.searchParams.get("dryRun") === "true") return ok({ dryRun: true, amount: 50000, allowed: true, paymentMethods: ["QRIS"] });
        if (url.pathname === "/api/account/deposits" && init.method === "POST") return ok({ id: DEP, status: "pending", paymentUrl: "https://pay.test/x" });
        if (url.pathname === "/api/account/deposits") return ok([{ id: DEP, status: "paid" }]);
        return ok({ id: DEP, status: "paid" });
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

describe("deposit tools", () => {
    test("listed: create is a write that tells the agent to hand over paymentUrl; get and list are reads", async () => {
        const tools = Object.fromEntries((await (await connect(fakeApi().f)).listTools()).tools.map(t => [t.name, t]));
        expect(tools.create_deposit.annotations?.readOnlyHint).toBe(false);
        expect(tools.create_deposit.description).toContain("paymentUrl");
        expect(tools.create_deposit.description).toContain("never try to pay it yourself");
        expect(tools.get_deposit.annotations?.readOnlyHint).toBe(true);
        expect(tools.list_deposits.annotations?.readOnlyHint).toBe(true);
    });
    test("create: dry run without a key, real call with the caller's key", async () => {
        const { f, calls } = fakeApi();
        const c = await connect(f);
        expect(json(await c.callTool({ name: "create_deposit", arguments: { amount: 50000, dryRun: true } })).allowed).toBe(true);
        const r = json(await c.callTool({ name: "create_deposit", arguments: { amount: 50000, idempotencyKey: "topup-0001-abc" } }));
        expect(r.paymentUrl).toBe("https://pay.test/x");
        expect(calls[0].url.search).toBe("?dryRun=true");
        expect(calls[0].headers["idempotency-key"]).toBeUndefined();
        expect(calls[1].url.search).toBe("");
        expect(calls[1].headers["idempotency-key"]).toBe("topup-0001-abc");
        expect(calls[1].body).toEqual({ amount: 50000 });
    });
    test("create: amount out of range is refused before any call", async () => {
        const { f, calls } = fakeApi();
        const r: any = await (await connect(f)).callTool({ name: "create_deposit", arguments: { amount: 5000 } });
        expect(r.isError).toBe(true);
        expect(calls.length).toBe(0);
    });
    test("get and list", async () => {
        const { f, calls } = fakeApi();
        const c = await connect(f);
        expect(json(await c.callTool({ name: "get_deposit", arguments: { depositId: DEP } })).status).toBe("paid");
        await c.callTool({ name: "list_deposits", arguments: { limit: 5 } });
        expect(calls.map(x => `${x.method} ${x.url.pathname}${x.url.search}`)).toEqual([`GET /api/account/deposits/${DEP}`, "GET /api/account/deposits?limit=5"]);
    });
});
