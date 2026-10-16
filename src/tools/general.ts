// A guarded escape hatch for endpoints without a dedicated tool (backups, child nameservers, broadcasts, ...).
import { z } from "zod";
import { defineTool } from "../tool.js";

const API_PREFIXES = ["/containers/", "/databases", "/vps", "/backup/", "/domains"];

export const generalTools = [
    defineTool({
        name: "helipod_request", title: "Call any Helipod API endpoint", kind: "destructive",
        description: "Call an endpoint that has no dedicated tool, as documented at https://docs.helipod.io. api=core for the Container, Database, VPS and Domain APIs (paths like /vps/{id}/backup), api=email for the Email API (paths like /broadcasts). Prefer the dedicated tools; ask the user before any call that costs money or deletes something.",
        input: {
            api: z.enum(["core", "email"]),
            method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
            path: z.string().regex(/^\/[A-Za-z0-9/_.\-:]*$/).describe("Path after the base URL, e.g. /vps/abc/backup"),
            query: z.record(z.string(), z.string()).optional(),
            body: z.record(z.string(), z.any()).optional(),
        },
        run: (a, api) => {
            if (a.path.includes("..")) throw new Error("Invalid path");
            if (a.api === "core") {
                if (!API_PREFIXES.some(p => a.path.startsWith(p))) throw new Error(`Core API paths start with one of: ${API_PREFIXES.join(", ")}`);
                return api.api(a.method, a.path, { query: a.query, body: a.body });
            }
            return api.email(a.method, a.path, { query: a.query, body: a.body });
        },
    }),
];
