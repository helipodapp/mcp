// AI API tools: the AI Gateway account of the key owner: model prices, balance, usage, metrics, AI keys
// (list / revoke; creating or revealing a key stays in the dashboard), top-up from the wallet and auto top-up.
import { z } from "zod";
import { defineTool, purchaseKey } from "../tool.js";

const projectId = z.string().uuid().optional().describe("Limit to one project (a project key is always limited to its own)");
const keyId = z.string().uuid().optional().describe("Limit to one AI key (id from list_ai_keys)");
const model = z.string().max(100).optional().describe("Limit to one model id");
const dryRun = z.boolean().optional().describe("true = only check and show the result; nothing is charged or changed");
const ACCOUNT_KEY = "Needs a whole-account key (a key limited to one project gets 403 ACCOUNT_KEY_REQUIRED).";

export const aiTools = [
    defineTool({
        name: "list_ai_models", title: "List AI models and prices", kind: "read",
        description: "Models available through the Helipod AI Gateway with the price this account pays (IDR per 1M input / cached / output tokens) and any promos running.",
        input: {},
        run: (_a, api) => api.api("GET", "/ai/models"),
    }),
    defineTool({
        name: "get_ai_overview", title: "AI balance overview", kind: "read",
        description: `AI balance (available, held, free credit, model-limited credit), wallet balance, top-up packs (id, amount, bonus), minimum top-up, tax and auto top-up settings. Use it before topup_ai_balance. ${ACCOUNT_KEY}`,
        input: {},
        run: (_a, api) => api.api("GET", "/ai/overview"),
    }),
    defineTool({
        name: "get_ai_usage", title: "AI usage", kind: "read",
        description: "This month's AI spend by model, and request history (model, tokens, charge in IDR, latency, status), newest first; page with page/limit.",
        input: { projectId, keyId, model, limit: z.number().int().min(1).max(100).optional(), page: z.number().int().min(1).max(100).optional() },
        run: (a, api) => api.api("GET", "/ai/usage", { query: { projectId: a.projectId, keyId: a.keyId, model: a.model, limit: a.limit, page: a.page } }),
    }),
    defineTool({
        name: "get_ai_metrics", title: "AI metrics", kind: "read",
        description: "AI requests and spend over time (24h, 7d or 30d) with totals, the previous period and a per-model split.",
        input: { projectId, keyId, model, range: z.enum(["24h", "7d", "30d"]).optional() },
        run: (a, api) => api.api("GET", "/ai/metrics", { query: { projectId: a.projectId, keyId: a.keyId, model: a.model, range: a.range } }),
    }),
    defineTool({
        name: "list_ai_keys", title: "List AI keys", kind: "read",
        description: "Active AI Gateway keys (name, prefix, project, allowed models, monthly spend limit, last used). Secrets are never returned; new keys are created in the dashboard.",
        input: { projectId },
        run: (a, api) => api.api("GET", "/ai/keys", { query: { projectId: a.projectId } }),
    }),
    defineTool({
        name: "revoke_ai_key", title: "Revoke AI key", kind: "destructive",
        description: "Revoke an AI key permanently: every app using it stops working at once and it cannot be restored (a new key must be made in the dashboard and deployed).",
        input: { keyId: z.string().uuid().describe("AI key id from list_ai_keys") },
        run: (a, api) => api.api("DELETE", `/ai/keys/${a.keyId}`),
    }),
    defineTool({
        name: "topup_ai_balance", title: "Top up AI balance", kind: "write",
        description: `Move money from the wallet to the AI balance, by pack (packId from get_ai_overview, may include a bonus) or by amount (IDR, at least minTopup). COSTS MONEY from the wallet. dryRun=true returns the amount, bonus and balances after without charging. ${ACCOUNT_KEY}`,
        input: {
            packId: z.string().min(1).max(64).optional(), amount: z.number().min(1).max(1_000_000_000).optional().describe("IDR"),
            dryRun,
            idempotencyKey: z.string().regex(/^[A-Za-z0-9_.:-]{8,128}$/).optional().describe("Idempotency-Key for the real top-up. Generated when omitted; pass the same value when retrying so it is never charged twice"),
        },
        run: (a, api) => {
            if (!!a.packId === (a.amount !== undefined)) throw new Error("Give packId or amount, not both.");
            return api.api("POST", "/ai/topup", {
                body: { packId: a.packId, amount: a.amount },
                query: { dryRun: a.dryRun ? "true" : undefined }, idempotencyKey: purchaseKey(a.dryRun, a.idempotencyKey),
            });
        },
    }),
    defineTool({
        name: "set_ai_auto_topup", title: "Set AI auto top-up", kind: "write", idempotent: true,
        description: `Automatic top-up: when the AI balance falls below threshold (IDR), amount (IDR) is moved from the wallet. Enabling it COSTS MONEY later: top-ups then run automatically. dryRun=true returns the current and new settings without changing them. enabled=false turns it off. ${ACCOUNT_KEY}`,
        input: {
            enabled: z.boolean(),
            threshold: z.number().min(1).optional().describe("Top up when the AI balance is below this (IDR)"),
            amount: z.number().min(1).optional().describe("How much to top up each time (IDR)"),
            dryRun,
        },
        run: (a, api) => api.api("PUT", "/ai/auto-topup", {
            body: { enabled: a.enabled, threshold: a.threshold, amount: a.amount },
            query: { dryRun: a.dryRun ? "true" : undefined },
        }),
    }),
];
