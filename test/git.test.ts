// Git connection tools against a FAKE API (fetch stub): get_git_connections, list_git_repos (query mapping), and the
// 409 refusals keeping details.connectUrl so the agent can hand the link to the user. No network.
import { describe, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createHelipodServer } from "../src/index";

const CONNECT = "https://helipod.io/connect/git?host=github";
const ENV = "11111111-2222-4333-8444-555555555555";

function fakeApi() {
    const calls: { method: string; url: string; body: any }[] = [];
    const f = (async (input: any, init: any = {}) => {
        const url = String(input instanceof URL ? input.href : input);
        calls.push({ method: init.method ?? "GET", url, body: init.body ? JSON.parse(init.body) : undefined });
        const u = new URL(url);
        const ok = (data: unknown) => new Response(JSON.stringify({ success: true, data }), { headers: { "content-type": "application/json" } });
        const refuse = (code: string, error: string, details: unknown) =>
            new Response(JSON.stringify({ success: false, code, error, details }), { status: 409, headers: { "content-type": "application/json" } });
        if (u.pathname === "/api/containers/git/connections") return ok({ github: { connected: false, ready: false, installations: [] }, gitlab: { connected: false }, connectUrl: "https://helipod.io/connect/git" });
        if (u.pathname === "/api/containers/git/repos") {
            if (u.searchParams.get("host") === "gitlab") return refuse("GITLAB_NOT_CONNECTED", "GitLab is not connected.", { connectUrl: "https://helipod.io/connect/git?host=gitlab" });
            return ok({ host: "github", total: 1, offset: 0, limit: 50, repos: [{ host: "github", fullName: "acme/app", url: "https://github.com/acme/app", private: true, defaultBranch: "main", updatedAt: "", installationId: 42 }] });
        }
        if (u.pathname === `/api/containers/environments/${ENV}/services`) return refuse("GITHUB_NOT_CONNECTED", "acme/secret is private or does not exist.", { connectUrl: CONNECT, repo: "acme/secret" });
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

describe("git connection tools", () => {
    test("listed as reads; create_service explains private repos and the 409s", async () => {
        const c = await connect(fakeApi().f);
        const tools = Object.fromEntries((await c.listTools()).tools.map(t => [t.name, t]));
        expect(tools.get_git_connections.annotations?.readOnlyHint).toBe(true);
        expect(tools.list_git_repos.annotations?.readOnlyHint).toBe(true);
        expect(tools.get_git_connections.description).toContain("connectUrl");
        expect(tools.create_service.description).toContain("GITHUB_NOT_CONNECTED");
        expect(tools.create_service.description).not.toContain("a public Git repository");
    });

    test("get_git_connections returns the API data", async () => {
        const { f, calls } = fakeApi();
        const r: any = await (await connect(f)).callTool({ name: "get_git_connections", arguments: {} });
        expect(r.isError).toBeFalsy();
        expect(json(r).connectUrl).toBe("https://helipod.io/connect/git");
        expect(calls[0].method).toBe("GET");
    });

    test("list_git_repos maps its arguments to the query", async () => {
        const { f, calls } = fakeApi();
        const r: any = await (await connect(f)).callTool({ name: "list_git_repos", arguments: { installationId: 42, search: "app", limit: 10, offset: 5 } });
        expect(json(r).repos[0].url).toBe("https://github.com/acme/app");
        const u = new URL(calls[0].url);
        expect(u.searchParams.get("installationId")).toBe("42");
        expect(u.searchParams.get("search")).toBe("app");
        expect(u.searchParams.get("limit")).toBe("10");
        expect(u.searchParams.get("offset")).toBe("5");
        expect(u.searchParams.has("host")).toBe(false);
    });

    test("not connected: the error keeps details.connectUrl", async () => {
        const r: any = await (await connect(fakeApi().f)).callTool({ name: "list_git_repos", arguments: { host: "gitlab" } });
        expect(r.isError).toBe(true);
        const e = json(r);
        expect(e.status).toBe(409);
        expect(e.code).toBe("GITLAB_NOT_CONNECTED");
        expect(e.details.connectUrl).toBe("https://helipod.io/connect/git?host=gitlab");
    });

    test("create_service from a private repo nobody connected: 409 with the link, the repo sent as given", async () => {
        const { f, calls } = fakeApi();
        const r: any = await (await connect(f)).callTool({ name: "create_service", arguments: { environmentId: ENV, name: "app", repo: "acme/secret", dryRun: true } });
        expect(r.isError).toBe(true);
        const e = json(r);
        expect(e.code).toBe("GITHUB_NOT_CONNECTED");
        expect(e.details).toEqual({ connectUrl: CONNECT, repo: "acme/secret" });
        expect(calls[0].body.source).toEqual({ repo: "acme/secret" });
    });

    test("instructions tell the agent to hand over connectUrl, never ask for a token", async () => {
        const c = await connect(fakeApi().f);
        const text = c.getInstructions() ?? "";
        expect(text).toContain("details.connectUrl");
        expect(text).toContain("Never ask for a GitHub token");
    });
});
