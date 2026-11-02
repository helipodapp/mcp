// 0.5.14 tools against a FAKE API (fetch stub, no network): email keys go out with the Helipod API key even when an
// email key is configured (an email key may not manage keys), with the project header; domain owner on transfer and
// set_domain_owner; project and environment tools on /api/projects (any product's key).
import { describe, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createHelipodServer } from "../src/index";

const PROJECT = "11111111-2222-4333-8444-555555555555";
const KEY_ID = "66666666-7777-4888-8999-000000000000";
const OWNER = { name: "Budi Santoso", phone: "+6281311112222", addressLine1: "Jl. Merdeka 10", city: "Bandung", state: "Jawa Barat", countryCode: "ID", postalCode: "40111" };

function fakeApi() {
    const calls: { method: string; url: string; auth: string; project: string | null; body: any }[] = [];
    const f = (async (input: any, init: any = {}) => {
        const url = String(input instanceof URL ? input.href : input);
        const h = new Headers(init.headers);
        calls.push({ method: init.method ?? "GET", url, auth: h.get("authorization") ?? "", project: h.get("x-helipod-project"), body: init.body ? JSON.parse(init.body) : undefined });
        return new Response(JSON.stringify({ success: true, data: { ok: true } }), { headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    return { f, calls };
}
async function connect(cfg: Record<string, unknown>) {
    const api = fakeApi();
    const server = createHelipodServer({ apiKey: "hel_account", fetch: api.f, ...cfg });
    const [a, b] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test", version: "1" });
    await Promise.all([server.connect(a), client.connect(b)]);
    return { client, calls: api.calls };
}
const call = (c: Client, name: string, args: Record<string, unknown>) => c.callTool({ name, arguments: args });

describe("email key tools", () => {
    test("use the Helipod API key even when an email key is set, with the project header", async () => {
        const { client, calls } = await connect({ emailApiKey: "hel_emailkey" });
        await call(client, "create_email_key", { projectId: PROJECT, name: "Customer Toko Maju" });
        await call(client, "list_email_keys", { projectId: PROJECT });
        await call(client, "revoke_email_key", { projectId: PROJECT, keyId: KEY_ID });
        expect(calls.map(c => `${c.method} ${new URL(c.url).pathname}`)).toEqual(["POST /api/email/keys", "GET /api/email/keys", `DELETE /api/email/keys/${KEY_ID}`]);
        for (const c of calls) {
            expect(c.auth).toBe("Bearer hel_account");
            expect(c.project).toBe(PROJECT);
        }
        expect(calls[0].body).toEqual({ name: "Customer Toko Maju" });
    });
    test("other email tools still prefer the email key (unchanged)", async () => {
        const { client, calls } = await connect({ emailApiKey: "hel_emailkey" });
        await call(client, "list_email_templates", {});
        expect(calls[0].auth).toBe("Bearer hel_emailkey");
    });
    test("revoke is marked destructive, create explains the one-time key and SMTP", async () => {
        const { client } = await connect({});
        const tools = Object.fromEntries((await client.listTools()).tools.map(t => [t.name, t]));
        expect(tools.revoke_email_key.annotations?.destructiveHint).toBe(true);
        expect(tools.list_email_keys.annotations?.readOnlyHint).toBe(true);
        expect(tools.create_email_key.description).toContain("ONCE");
        expect(tools.create_email_key.description).toContain("SMTP");
    });
    test("without a Helipod API key: a clear error, nothing sent", async () => {
        const { client, calls } = await connect({ apiKey: undefined, emailApiKey: "hel_emailkey" });
        const r: any = await call(client, "create_email_key", { projectId: PROJECT, name: "x" });
        expect(r.isError).toBe(true);
        expect(r.content[0].text).toContain("HELIPOD_API_KEY");
        expect(calls.length).toBe(0);
    });
});

describe("domain owner", () => {
    test("transfer_domain sends registrant; set_domain_owner patches the domain", async () => {
        const { client, calls } = await connect({});
        await call(client, "transfer_domain", { name: "tokomaju.id", authCode: "EPP", registrant: OWNER });
        await call(client, "set_domain_owner", { domainId: 42, owner: OWNER });
        expect(new URL(calls[0].url).pathname).toBe("/api/domains/transfer");
        expect(calls[0].body.registrant).toEqual(OWNER);
        expect(calls[0].body.period).toBe(1);
        expect(`${calls[1].method} ${new URL(calls[1].url).pathname}`).toBe("PATCH /api/domains/42/registrant");
        expect(calls[1].body).toEqual(OWNER);
    });
    test("set_domain_owner refuses an incomplete owner before calling the API", async () => {
        const { client, calls } = await connect({});
        const r: any = await call(client, "set_domain_owner", { domainId: 42, owner: { name: "Bu" } });
        expect(r.isError).toBe(true);
        expect(calls.length).toBe(0);
    });
});

describe("projects", () => {
    test("project and environment tools use /api/projects and /api/environments; shared variables stay on /containers", async () => {
        const { client, calls } = await connect({});
        await call(client, "list_projects", {});
        await call(client, "create_project", { name: "Customer one" });
        await call(client, "get_project", { projectId: PROJECT });
        await call(client, "create_environment", { projectId: PROJECT, name: "staging" });
        await call(client, "rename_environment", { environmentId: PROJECT, name: "preview" });
        await call(client, "list_project_variables", { projectId: PROJECT });
        expect(calls.map(c => `${c.method} ${new URL(c.url).pathname}`)).toEqual([
            "GET /api/projects", "POST /api/projects", `GET /api/projects/${PROJECT}`,
            `POST /api/projects/${PROJECT}/environments`, `PATCH /api/environments/${PROJECT}`,
            `GET /api/containers/projects/${PROJECT}/variables`,
        ]);
    });
});
