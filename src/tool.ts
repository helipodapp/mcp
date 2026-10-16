/**
 * tool.ts — one helper to register a tool: input schema, MCP annotations, JSON output, and errors that an
 * agent can act on (status + code + message) instead of a thrown exception.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ZodRawShape, z } from "zod";
import { HelipodError, type HelipodClient } from "./client.js";

export type Kind = "read" | "write" | "destructive";

export interface ToolDef<S extends ZodRawShape> {
    name: string;
    title: string;
    description: string;
    kind: Kind;
    /** Calling it again with the same input has no further effect. */
    idempotent?: boolean;
    input: S;
    run: (args: z.infer<z.ZodObject<S>>, api: HelipodClient) => Promise<unknown>;
}

export function defineTool<S extends ZodRawShape>(def: ToolDef<S>) { return def; }

export function register(server: McpServer, api: HelipodClient, defs: ToolDef<any>[]) {
    for (const d of defs) {
        server.registerTool(d.name, {
            title: d.title,
            description: d.description,
            inputSchema: d.input,
            annotations: {
                title: d.title,
                readOnlyHint: d.kind === "read",
                destructiveHint: d.kind === "destructive",
                idempotentHint: d.kind === "read" || !!d.idempotent,
                openWorldHint: true,
            },
        }, async (args: any) => {
            try {
                const data = await d.run(args, api);
                return { content: [{ type: "text" as const, text: data === undefined ? "OK" : JSON.stringify(data, null, 2) }] };
            } catch (e) {
                const err = e instanceof HelipodError ? e : new HelipodError(0, "CLIENT_ERROR", String((e as any)?.message ?? e));
                return {
                    isError: true,
                    content: [{ type: "text" as const, text: JSON.stringify({ status: err.status, code: err.code ?? null, error: err.message }, null, 2) }],
                };
            }
        });
    }
}
