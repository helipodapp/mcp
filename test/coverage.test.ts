// Tools added or extended in the 2026-10-31 API / MCP / docs audit, against a FAKE API (fetch stub): each sends
// the method, path, body and query the API expects, and a non-JSON answer (CSV export) comes back as text.
import { describe, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createHelipodServer } from "../src/index";

const U = "6a0e7d1c-2b3f-4c5d-8e9f-0a1b2c3d4e5f", V = "7b1f8e2d-3c4a-4d6e-9f0a-1b2c3d4e5f60";
function fakeApi() {
    const calls: { method: string; url: URL; body: any }[] = [];
    const f = (async (input: any, init: any = {}) => {
        const url = new URL(String(input instanceof URL ? input.href : input));
        calls.push({ method: init.method ?? "GET", url, body: init.body ? JSON.parse(init.body) : undefined });
        if (url.pathname.endsWith("/contacts/export")) return new Response("email,firstName\na@x.id,A\n", { headers: { "content-type": "text/csv" } });
        return new Response(JSON.stringify({ success: true, data: { ok: true } }), { headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    return { f, calls };
}
async function connect(f: typeof fetch) {
    const server = createHelipodServer({ apiKey: "hel_test", fetch: f });
    const [a, b] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "t", version: "1" });
    await Promise.all([server.connect(a), client.connect(b)]);
    return client;
}
const last = (c: { calls: any[] }) => c.calls.at(-1)!;

describe("audit additions", () => {
    test("domains: auto-renew, child nameserver, registrant, premium, prices filters, WHOIS dry run", async () => {
        const api = fakeApi(); const c = await connect(api.f);
        await c.callTool({ name: "set_domain_auto_renew", arguments: { domainId: 12, autoRenew: false } });
        expect(last(api).method).toBe("PATCH"); expect(last(api).url.pathname).toBe("/api/domains/12/auto-renew"); expect(last(api).body).toEqual({ autoRenew: false });
        await c.callTool({ name: "get_child_nameserver", arguments: { domainId: 12, hostId: 3 } });
        expect(last(api).url.pathname).toBe("/api/domains/12/hosts/3");
        const registrant = { name: "Budi Santoso", phone: "+6281234567890", addressLine1: "Jl. Merdeka 1", city: "Jakarta", state: "DKI Jakarta", countryCode: "ID", postalCode: "10110" };
        await c.callTool({ name: "register_domain", arguments: { name: "tokobudi.id", registrant, dryRun: true } });
        expect(last(api).body.registrant).toEqual(registrant); expect(last(api).body.includePremium).toBeUndefined(); expect(last(api).body.period).toBe(1);
        expect(last(api).url.searchParams.get("dryRun")).toBe("true");
        await c.callTool({ name: "search_domain", arguments: { domain: "x.id", includePremium: true } });
        expect(last(api).url.searchParams.get("includePremium")).toBe("true");
        await c.callTool({ name: "domain_prices", arguments: { promo: true, page: 2 } });
        expect(last(api).url.searchParams.get("promo")).toBe("true"); expect(last(api).url.searchParams.get("page")).toBe("2");
        await c.callTool({ name: "enable_whois_privacy", arguments: { domainId: 12, dryRun: true } });
        expect(last(api).url.pathname).toBe("/api/domains/12/whois-protection"); expect(last(api).url.searchParams.get("dryRun")).toBe("true");
        await c.callTool({ name: "enable_whois_privacy", arguments: { domainId: 12 } });
        expect(last(api).url.searchParams.get("dryRun")).toBeNull();
    });
    test("containers: custom domain verify, health check timeout on create", async () => {
        const api = fakeApi(); const c = await connect(api.f);
        await c.callTool({ name: "verify_service_domain", arguments: { serviceId: U, domainId: V } });
        expect(last(api).method).toBe("POST"); expect(last(api).url.pathname).toBe(`/api/containers/services/${U}/domains/${V}/verify`);
        await c.callTool({ name: "create_service", arguments: { environmentId: U, name: "web", image: "nginx", healthcheckPath: "/health", healthcheckTimeout: 300, dryRun: true } });
        expect(last(api).body.healthcheck).toEqual({ path: "/health", timeout: 300 });
    });
    test("email: send extras, contacts, segments, broadcasts, inbound, inbox, jobs", async () => {
        const api = fakeApi(); const c = await connect(api.f);
        await c.callTool({ name: "send_email", arguments: { from: "a@x.id", to: ["b@y.id"], text: "hi", headers: { "X-Tag": "1" }, metadata: { orderId: "A1" }, sensitive: true } });
        expect(last(api).body).toMatchObject({ headers: { "X-Tag": "1" }, metadata: { orderId: "A1" }, sensitive: true });
        await c.callTool({ name: "send_email_batch", arguments: { messages: [{ from: "a@x.id", to: ["b@y.id"], text: "hi", metadata: { k: "v" } }] } });
        expect(JSON.stringify(last(api).body)).toContain('"metadata":{"k":"v"}');
        await c.callTool({ name: "add_contact", arguments: { email: "c@y.id", status: "subscribed", properties: { plan: "pro" }, consentConfirmed: true, consentSource: "signup_form" } });
        expect(last(api).body).toEqual({ email: "c@y.id", status: "subscribed", properties: { plan: "pro" }, consentConfirmed: true, consentSource: "signup_form" });
        await c.callTool({ name: "list_emails", arguments: { from: "2026-10-01T00:00:00Z", to: "2026-11-01T00:00:00Z" } });
        expect(last(api).url.searchParams.get("from")).toBe("2026-10-01T00:00:00Z");
        const cases: [string, Record<string, unknown>, string, string, unknown?][] = [
            ["add_email_contacts", { contacts: [{ email: "d@y.id" }], consentConfirmed: true }, "POST", "/api/email/contacts", { contacts: [{ email: "d@y.id" }], consentConfirmed: true }],
            ["import_email_contacts", { csv: "email\nd@y.id\n" }, "POST", "/api/email/contacts/import", { csv: "email\nd@y.id\n" }],
            ["set_email_contact_properties", { contactId: U, properties: { a: "b" } }, "PUT", `/api/email/contacts/${U}/properties`, { properties: { a: "b" } }],
            ["set_email_contact_topics", { contactId: U, topicIds: [V] }, "PUT", `/api/email/contacts/${U}/topics`, { topicIds: [V] }],
            ["get_email_segment", { segmentId: U }, "GET", `/api/email/segments/${U}`],
            ["recalculate_email_segment", { segmentId: U }, "POST", `/api/email/segments/${U}/recalculate`],
            ["delete_email_broadcast", { broadcastId: U }, "DELETE", `/api/email/broadcasts/${U}`],
            ["check_email_inbound", { domainId: U, host: "mail.x.id" }, "GET", `/api/email/domains/${U}/inbound/check`],
            ["set_email_inbound", { domainId: U, enabled: true, host: "mail.x.id" }, "POST", `/api/email/domains/${U}/inbound`, { enabled: true, host: "mail.x.id" }],
            ["inbox_stats", {}, "GET", "/api/email/inbound/stats"],
            ["update_inbox_message", { messageId: U, isRead: true, folder: "archive" }, "PATCH", `/api/email/inbound/messages/${U}`, { isRead: true, folder: "archive" }],
            ["bulk_inbox_messages", { messageIds: [U, V], action: "trash" }, "POST", "/api/email/inbound/messages/bulk", { ids: [U, V], action: "trash" }],
            ["get_inbox_message_raw", { messageId: U }, "GET", `/api/email/inbound/messages/${U}/raw`],
            ["get_inbox_attachment", { messageId: U, index: 0 }, "GET", `/api/email/inbound/messages/${U}/attachments/0`],
            ["list_email_jobs", {}, "GET", "/api/email/jobs"],
            ["get_email_job", { jobId: "job-123" }, "GET", "/api/email/jobs/job-123"],
        ];
        for (const [name, args, method, path, body] of cases) {
            const r: any = await c.callTool({ name, arguments: args });
            expect(r.isError, name).toBeFalsy();
            expect(last(api).method, name).toBe(method);
            expect(last(api).url.pathname, name).toBe(path);
            if (body !== undefined) expect(last(api).body, name).toEqual(body);
        }
        expect(last(api).url.searchParams.get("host") ?? "").toBe("");
        const csv: any = await c.callTool({ name: "export_email_contacts", arguments: {} });
        expect(csv.content[0].text).toContain("a@x.id");
    });
    test("destructive annotations on the new destructive tools", async () => {
        const tools = Object.fromEntries((await (await connect(fakeApi().f)).listTools()).tools.map(t => [t.name, t]));
        for (const n of ["delete_email_broadcast", "bulk_inbox_messages"]) expect(tools[n].annotations?.destructiveHint, n).toBe(true);
        for (const n of ["export_email_contacts", "get_email_job", "inbox_stats", "check_email_inbound", "get_child_nameserver"]) expect(tools[n].annotations?.readOnlyHint, n).toBe(true);
    });
});
