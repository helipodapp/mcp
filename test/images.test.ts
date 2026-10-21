// Image generation tools against a FAKE API (fetch stub): dry run, start + polling, inline images within the size
// budget and links for the rest, only https helipod.io links fetched, the Idempotency-Key, wait=0, list. No network.
import { describe, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createHelipodServer } from "../src/index";

const ID = "req_11111111-2222-4333-8444-555555555555";
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const small = `https://ai.helipod.io/v1/images/files/${ID}_0-png?e=1&s=x`;
const big = `https://ai.helipod.io/v1/images/files/${ID}_1-png?e=1&s=y`;
const foreign = "https://evil.example.com/a.png";

function fakeApi(opts: { pollsBeforeDone?: number; urls?: string[] } = {}) {
    const calls: { method: string; url: string; headers: Record<string, string>; body: any }[] = [];
    let polls = 0;
    const job = (status: string) => ({ id: ID, object: "image.generation", model: "m1", status, created: 1, prompt: "boat", size: "1024x1024", n: 1,
        ...(status === "succeeded" ? { expires_at: 1_900_000_000, data: (opts.urls ?? [small]).map(url => ({ url })), notice: "Images are kept for 7 days" } : {}) });
    const f = (async (input: any, init: any = {}) => {
        const url = String(input instanceof URL ? input.href : input);
        calls.push({ method: init.method ?? "GET", url, headers: init.headers ?? {}, body: init.body ? JSON.parse(init.body) : undefined });
        const ok = (data: unknown) => new Response(JSON.stringify({ success: true, data }), { headers: { "content-type": "application/json" } });
        if (url === small) return new Response(PNG, { headers: { "content-type": "image/png", "content-length": String(PNG.length) } });
        if (url === big) return new Response(PNG, { headers: { "content-type": "image/png", "content-length": "9000000" } });
        if (url.startsWith(foreign)) throw new Error("must never be fetched");
        const u = new URL(url);
        if (u.pathname === "/api/ai/images" && init.method === "POST") {
            if (u.searchParams.get("dryRun") === "true") return ok({ dryRun: true, model: "m1", size: "1024x1024", n: 1, pricePerImage: 320, price: 320, currency: "IDR", notice: "kept 7 days" });
            return ok({ dryRun: false, id: ID, status: "processing", estimatedPrice: 320 });
        }
        if (u.pathname === `/api/ai/images/${ID}`) return ok(job(++polls > (opts.pollsBeforeDone ?? 1) ? "succeeded" : "processing"));
        if (u.pathname === "/api/ai/images") return ok({ object: "list", data: [job("succeeded")], has_more: false, last_id: ID });
        return new Response(JSON.stringify({ success: false, error: "no route", code: "NOT_FOUND" }), { status: 404 });
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

describe("image generation tools", () => {
    test("listed: generate is a paid write, get and list are reads", async () => {
        const c = await connect(fakeApi().f);
        const tools = Object.fromEntries((await c.listTools()).tools.map(t => [t.name, t]));
        expect(tools.generate_ai_image.annotations?.readOnlyHint).toBe(false);
        expect(tools.generate_ai_image.description).toContain("dryRun=true");
        expect(tools.generate_ai_image.description).toContain("7 days");
        expect(tools.get_ai_image.annotations?.readOnlyHint).toBe(true);
        expect(tools.list_ai_images.annotations?.readOnlyHint).toBe(true);
    });

    test("dry run: the quote only, no images, no Idempotency-Key", async () => {
        const { f, calls } = fakeApi();
        const r: any = await (await connect(f)).callTool({ name: "generate_ai_image", arguments: { model: "m1", prompt: "boat", dryRun: true, projectId: "11111111-2222-4333-8444-555555555555" } });
        expect(json(r).price).toBe(320);
        expect(r.content.length).toBe(1);
        expect(calls[0].url).toContain("dryRun=true");
        expect(calls[0].headers["idempotency-key"]).toBeUndefined();
        expect(calls[0].body.projectId).toBe("11111111-2222-4333-8444-555555555555");
    });

    test("real call: Idempotency-Key, polls until done, the image inline plus its link", async () => {
        const { f, calls } = fakeApi({ pollsBeforeDone: 1 });
        const r: any = await (await connect(f)).callTool({ name: "generate_ai_image", arguments: { model: "m1", prompt: "boat" } });
        expect(json(r).status).toBe("succeeded");
        expect(calls[0].headers["idempotency-key"]).toMatch(/^[0-9a-f-]{36}$/);
        expect(calls.filter(c => c.url.includes(`/api/ai/images/${ID}`)).length).toBe(2);
        const img = r.content.find((x: any) => x.type === "image");
        expect(img.mimeType).toBe("image/png");
        expect(Buffer.from(img.data, "base64")).toEqual(Buffer.from(PNG));
        const link = r.content.find((x: any) => x.type === "resource_link");
        expect(link.uri).toBe(small);
    }, 15_000);

    test("a retry with the caller's Idempotency-Key sends that key", async () => {
        const { f, calls } = fakeApi({ pollsBeforeDone: 0 });
        await (await connect(f)).callTool({ name: "generate_ai_image", arguments: { model: "m1", prompt: "boat", idempotencyKey: "my-key-123456" } });
        expect(calls[0].headers["idempotency-key"]).toBe("my-key-123456");
    });

    test("too big to show: a link only; a foreign link is never fetched", async () => {
        const { f, calls } = fakeApi({ pollsBeforeDone: 0, urls: [big, foreign] });
        const r: any = await (await connect(f)).callTool({ name: "get_ai_image", arguments: { id: ID } });
        expect(r.content.filter((x: any) => x.type === "image").length).toBe(0);
        expect(r.content.filter((x: any) => x.type === "resource_link").map((x: any) => x.uri)).toEqual([big, foreign]);
        expect(calls.some(c => c.url.startsWith(foreign))).toBe(false);
    });

    test("wait=0: returns the id and how to continue, no polling", async () => {
        const { f, calls } = fakeApi({ pollsBeforeDone: 5 });
        const r: any = await (await connect(f)).callTool({ name: "generate_ai_image", arguments: { model: "m1", prompt: "boat", wait: 0 } });
        expect(json(r).id).toBe(ID);
        expect(json(r).next).toContain("get_ai_image");
        expect(calls.length).toBe(1);
    });

    test("list: JSON only (no images pulled in)", async () => {
        const { f, calls } = fakeApi();
        const r: any = await (await connect(f)).callTool({ name: "list_ai_images", arguments: { limit: 5 } });
        expect(json(r).data[0].id).toBe(ID);
        expect(r.content.length).toBe(1);
        expect(calls[0].url).toContain("limit=5");
    });

    test("a bad id is refused before any request", async () => {
        const { f, calls } = fakeApi();
        const r: any = await (await connect(f)).callTool({ name: "get_ai_image", arguments: { id: "../../account" } });
        expect(r.isError).toBe(true);
        expect(calls.length).toBe(0);
    });
});
