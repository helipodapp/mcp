// A read-only escape hatch for endpoints without a dedicated read tool.
import { z } from "zod";
import { defineTool } from "../tool.js";

const API_PREFIXES = ["/containers/", "/databases", "/vps", "/backup/", "/domains", "/account/", "/ai/"];

export const generalTools = [
    // Read only: Anthropic's directory (and good sense) wants reads and writes in separate tools. Every change has a
    // dedicated tool, so there is no write escape hatch.
    defineTool({
        name: "helipod_api_get", title: "Read any Helipod API endpoint", kind: "read",
        description: "GET an endpoint of the Helipod public API that has no dedicated read tool (Helipod API reference: https://docs.helipod.io/docs/helipod). api=core for the Container, Database, VPS, Domain, Account and AI APIs (paths like /vps/{id}/backup/runs, /account/wallet, /ai/usage), api=email for the Email API (paths like /broadcasts). Read only: it never changes anything.",
        input: {
            api: z.enum(["core", "email"]),
            path: z.string().regex(/^\/[A-Za-z0-9/_.\-:]*$/).describe("Path after the base URL, e.g. /vps/abc/backup/runs"),
            query: z.record(z.string(), z.string()).optional(),
        },
        run: (a, api) => {
            if (a.path.includes("..")) throw new Error("Invalid path");
            if (a.api === "core") {
                if (!API_PREFIXES.some(p => a.path.startsWith(p))) throw new Error(`Core API paths start with one of: ${API_PREFIXES.join(", ")}`);
                return api.api("GET", a.path, { query: a.query });
            }
            return api.email("GET", a.path, { query: a.query });
        },
    }),
];
