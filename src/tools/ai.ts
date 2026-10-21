// AI API tools: the AI Gateway account of the key owner: model prices, balance, usage, metrics, AI keys
// (list / revoke; creating or revealing a key stays in the dashboard), top-up from the wallet and auto top-up,
// and image generation (billed to the AI balance; images are kept 7 days).
import { z } from "zod";
import type { HelipodClient } from "../client.js";
import { defineTool, purchaseKey, type Extra } from "../tool.js";

const projectId = z.string().uuid().optional().describe("Limit to one project (a project key is always limited to its own)");
const keyId = z.string().uuid().optional().describe("Limit to one AI key (id from list_ai_keys)");
const model = z.string().max(100).optional().describe("Limit to one model id");
const dryRun = z.boolean().optional().describe("true = only check and show the result; nothing is charged or changed");
const ACCOUNT_KEY = "Needs a whole-account key (a key limited to one project gets 403 ACCOUNT_KEY_REQUIRED).";
const imageProject = z.string().uuid().optional().describe("Project the images belong to (required with a whole-account key; a project key uses its own)");

/** Shown inline so the model (and the user, in clients that render it) can see the result; bigger ones are links. */
const INLINE_MAX_BYTES = 1_500_000, INLINE_TOTAL_BYTES = 4_000_000, INLINE_MAX_IMAGES = 4;
const POLL_MS = 3_000;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** The finished images of one request: inline when small enough (budgeted), otherwise a link. */
async function showImages(job: any, api: HelipodClient): Promise<Extra[]> {
    if (job?.status !== "succeeded" || !Array.isArray(job.data)) return [];
    const out: Extra[] = [];
    let total = 0;
    for (const [i, img] of job.data.entries()) {
        const name = `${job.id}-${i + 1}`;
        const inline = out.filter(x => x.type === "image").length < INLINE_MAX_IMAGES ? await api.image(img.url, Math.min(INLINE_MAX_BYTES, INLINE_TOTAL_BYTES - total)) : null;
        if (inline) { total += Math.ceil(inline.data.length * 3 / 4); out.push({ type: "image", ...inline }); }
        out.push({ type: "resource_link", uri: img.url, name, description: `Generated image ${i + 1} (link valid until the image is deleted, ${job.expires_at ? new Date(job.expires_at * 1000).toISOString().slice(0, 10) : "in 7 days"})` });
    }
    return out;
}

export const aiTools = [
    defineTool({
        name: "list_ai_models", title: "List AI models and prices", kind: "read",
        description: "Models available through the Helipod AI Gateway with the price this account pays (IDR per 1M input / cached / output tokens) and any promos running. imageModels lists the image models (generate_ai_image) with their sizes and price per image.",
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
        name: "generate_ai_image", title: "Generate images", kind: "write",
        description: "Generate images with a Helipod AI Gateway image model (list_ai_models shows them under imageModels, with sizes and the price per image). COSTS MONEY from the AI balance: call with dryRun=true first to get the price, tell the user, and wait for a yes. The real call waits up to `wait` seconds (default 50) and returns the images (shown inline when small, plus links); if it is still running it returns the id: call get_ai_image. Images are kept 7 days, then deleted: tell the user to download the ones they keep. Failed images are not charged.",
        input: {
            model: z.string().min(1).max(100).describe("Image model code from list_ai_models imageModels"),
            prompt: z.string().min(1).max(4000),
            size: z.string().max(20).optional().describe("One of the model's sizes, e.g. 1024x1024 (default: the model's default size)"),
            n: z.number().int().min(1).max(10).optional().describe("Images in this request (up to the model's maxN; default 1)"),
            images: z.array(z.string().url().startsWith("https://")).max(10).optional().describe("Reference images as https:// links (only models with refImages > 0)"),
            projectId: imageProject,
            dryRun,
            wait: z.number().int().min(0).max(55).optional().describe("Seconds to wait for the result (default 50; 0 = return the id at once)"),
            idempotencyKey: z.string().regex(/^[A-Za-z0-9_.:-]{8,128}$/).optional().describe("Idempotency-Key for the real request. Generated when omitted; pass the same value when retrying so it is never charged twice"),
        },
        run: async (a, api) => {
            const body = { model: a.model, prompt: a.prompt, size: a.size, n: a.n, images: a.images, projectId: a.projectId };
            if (a.dryRun) return api.api("POST", "/ai/images", { body, query: { dryRun: "true" } });
            const started: any = await api.api("POST", "/ai/images", { body, idempotencyKey: purchaseKey(false, a.idempotencyKey) });
            const deadline = Date.now() + (a.wait ?? 50) * 1000;
            let job: any = { ...started };
            while (job.status === "processing" && Date.now() + POLL_MS < deadline) {
                await sleep(POLL_MS);
                job = await api.api("GET", `/ai/images/${started.id}`);
            }
            if (job.status === "processing") return { ...started, next: `Still generating: call get_ai_image with id ${started.id} in a few seconds.` };
            return job;
        },
        present: (data, api, a) => (a.dryRun ? Promise.resolve([]) : showImages(data, api)),
    }),
    defineTool({
        name: "get_ai_image", title: "Get an image request", kind: "read",
        description: "One image request by id (from generate_ai_image): status (processing / succeeded / failed), the images (shown inline when small, plus fresh links), the date they are deleted, or the error.",
        input: { id: z.string().regex(/^req_[0-9a-f-]{36}$/).describe("Request id, req_…") },
        run: (a, api) => api.api("GET", `/ai/images/${a.id}`),
        present: (data, api) => showImages(data, api),
    }),
    defineTool({
        name: "list_ai_images", title: "List generated images", kind: "read",
        description: "Image requests of a project from the last 7 days (older ones are deleted), newest first: id, model, prompt, size, status, fresh links. Page with `before` (the last id of the previous page).",
        input: {
            projectId: imageProject,
            limit: z.number().int().min(1).max(50).optional(),
            before: z.string().regex(/^req_[0-9a-f-]{36}$/).optional().describe("last_id of the previous page"),
        },
        run: (a, api) => api.api("GET", "/ai/images", { query: { projectId: a.projectId, limit: a.limit, before: a.before } }),
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
