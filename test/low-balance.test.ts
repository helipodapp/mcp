// Low balance alert tools against a FAKE API (fetch stub): get reads, set sends only the given fields with PUT and
// validates the minimum threshold before calling. No network.
import { describe, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createHelipodServer } from "../src/index";

function fakeApi() {
    const calls: { method: string; url: URL; body: any }[] = [];
    const f = (async (input: any, init: any = {}) => {
        const url = new URL(String(input instanceof URL ? input.href : input));
        calls.push({ method: init.method ?? "GET", url, body: init.body ? JSON.parse(init.body) : undefined });
        return new Response(JSON.stringify({ success: true, data: { enabled: true, threshold: 100000, minimumThreshold: 50000, lastAlertAt: null } }),
            { headers: { "content-type": "application/json" } });
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

describe("low balance alert tools", () => {
    test("get is a read on /account/wallet/low-balance-alert", async () => {
        const api = fakeApi(), c = await connect(api.f);
        const tools = Object.fromEntries((await c.listTools()).tools.map(t => [t.name, t]));
        expect(tools.get_low_balance_alert.annotations?.readOnlyHint).toBe(true);
        expect(tools.set_low_balance_alert.annotations?.readOnlyHint).toBe(false);
        expect(tools.set_low_balance_alert.description).toContain("at most once a day");
        await c.callTool({ name: "get_low_balance_alert", arguments: {} });
        expect(api.calls[0].method).toBe("GET");
        expect(api.calls[0].url.pathname).toBe("/api/account/wallet/low-balance-alert");
    });
    test("set sends PUT with only the given fields", async () => {
        const api = fakeApi(), c = await connect(api.f);
        await c.callTool({ name: "set_low_balance_alert", arguments: { enabled: true, threshold: 100000 } });
        expect(api.calls[0].method).toBe("PUT");
        expect(api.calls[0].body).toEqual({ enabled: true, threshold: 100000 });
        await c.callTool({ name: "set_low_balance_alert", arguments: { enabled: false } });
        expect(api.calls[1].body).toEqual({ enabled: false });
    });
    test("a threshold below 50000 is refused before any call", async () => {
        const api = fakeApi(), c = await connect(api.f);
        const r: any = await c.callTool({ name: "set_low_balance_alert", arguments: { enabled: true, threshold: 40000 } });
        expect(r.isError).toBe(true);
        expect(api.calls.length).toBe(0);
    });
});
