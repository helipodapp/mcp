/**
 * client.ts — a small HTTP client for the Helipod public APIs.
 *
 * Two keys, two bases:
 *   - the Helipod API key (hel_…) for the VPS, Container and Domain APIs at https://api.helipod.io/api
 *   - the email API key (also hel_…, made in the dashboard Email section) for https://mail.helipod.io/api/email
 * Every response uses the envelope { success, data } / { success: false, error, code }.
 */

export interface HelipodConfig {
    apiKey?: string;
    emailApiKey?: string;
    apiUrl?: string;
    emailApiUrl?: string;
    /** Sent as User-Agent so requests from agents can be told apart. */
    userAgent?: string;
    fetch?: typeof fetch;
}

export class HelipodError extends Error {
    constructor(public status: number, public code: string | undefined, message: string) {
        super(message);
        this.name = "HelipodError";
    }
}

type Query = Record<string, string | number | boolean | undefined | null>;

export class HelipodClient {
    readonly apiUrl: string;
    readonly emailApiUrl: string;
    private f: typeof fetch;

    constructor(private cfg: HelipodConfig) {
        this.apiUrl = (cfg.apiUrl || "https://api.helipod.io/api").replace(/\/+$/, "");
        this.emailApiUrl = (cfg.emailApiUrl || "https://mail.helipod.io/api/email").replace(/\/+$/, "");
        this.f = cfg.fetch ?? fetch;
    }

    get hasApiKey() { return !!this.cfg.apiKey; }
    get hasEmailKey() { return !!this.cfg.emailApiKey; }

    /** VPS, Container and Domain APIs. */
    api<T = unknown>(method: string, path: string, opts: { query?: Query; body?: unknown; idempotencyKey?: string; auth?: boolean } = {}) {
        if (opts.auth !== false && !this.cfg.apiKey) {
            throw new HelipodError(401, "NO_API_KEY", "HELIPOD_API_KEY is not set. Create a key in the Helipod dashboard: Project → Settings → API keys.");
        }
        return this.request<T>(this.apiUrl, opts.auth === false ? undefined : this.cfg.apiKey, method, path, opts);
    }

    /** Email API (its own key). */
    email<T = unknown>(method: string, path: string, opts: { query?: Query; body?: unknown } = {}) {
        if (!this.cfg.emailApiKey) {
            throw new HelipodError(401, "NO_EMAIL_API_KEY", "HELIPOD_EMAIL_API_KEY is not set. Create an email API key in the Helipod dashboard Email section.");
        }
        return this.request<T>(this.emailApiUrl, this.cfg.emailApiKey, method, path, opts);
    }

    private async request<T>(base: string, key: string | undefined, method: string, path: string, opts: { query?: Query; body?: unknown; idempotencyKey?: string }): Promise<T> {
        const url = new URL(base + (path.startsWith("/") ? path : `/${path}`));
        for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
        const headers: Record<string, string> = { accept: "application/json", "user-agent": this.cfg.userAgent ?? "helipod-mcp" };
        if (key) headers.authorization = `Bearer ${key}`;
        if (opts.body !== undefined) headers["content-type"] = "application/json";
        if (opts.idempotencyKey) headers["idempotency-key"] = opts.idempotencyKey;
        let res: Response;
        try {
            res = await this.f(url, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
        } catch (e: any) {
            throw new HelipodError(0, "NETWORK_ERROR", `Could not reach ${url.host}: ${e?.message ?? e}`);
        }
        const text = await res.text();
        let json: any = null;
        try { json = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
        if (!res.ok || json?.success === false) {
            const retry = res.headers.get("retry-after");
            const msg = json?.error ?? (text.slice(0, 300) || res.statusText);
            throw new HelipodError(res.status, json?.code, retry ? `${msg} (retry after ${retry}s)` : String(msg));
        }
        return (json && "data" in json ? json.data : json) as T;
    }
}
