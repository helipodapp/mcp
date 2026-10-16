// Domain API tools: search, prices, register/transfer/renew, DNS, nameservers, WHOIS privacy.
import { z } from "zod";
import { defineTool } from "../tool.js";

const domainId = z.number().int().positive().describe("Domain id (number, from list_my_domains)");
const record = z.object({
    name: z.string().describe('"@" for the domain itself, or a label like "www"'),
    type: z.enum(["A", "AAAA", "MX", "MXE", "CNAME", "SPF", "TXT"]),
    content: z.string(),
    ttl: z.number().int().optional(),
});

export const domainTools = [
    defineTool({
        name: "search_domain", title: "Check domain availability", kind: "read",
        description: "Is a domain name available to register? No key needed.",
        input: { domain: z.string().describe("e.g. tokosaya.id") },
        run: (a, api) => api.api("GET", "/domains/search", { query: { domain: a.domain }, auth: false }),
    }),
    defineTool({
        name: "domain_prices", title: "Domain prices", kind: "read",
        description: "Registration, renewal and transfer prices per extension (IDR, VAT included) and the yearly WHOIS privacy price.",
        input: { extension: z.string().optional().describe("e.g. .id or .com"), limit: z.number().int().min(1).max(100).optional() },
        run: (a, api) => api.api("GET", "/domains/prices", { query: { extension: a.extension, limit: a.limit ?? 50 }, auth: false }),
    }),
    defineTool({
        name: "list_my_domains", title: "List my domains", kind: "read",
        description: "Domains registered on this account, with status, expiry and nameservers. Needs a whole-account key with the Domain API.",
        input: {},
        run: (_a, api) => api.api("GET", "/domains/mine"),
    }),
    defineTool({
        name: "get_domain", title: "Get domain", kind: "read",
        description: "One registered domain.",
        input: { domainId },
        run: (a, api) => api.api("GET", `/domains/${a.domainId}`),
    }),
    defineTool({
        name: "check_registrant", title: "Check owner details", kind: "read",
        description: "Whether the account's domain owner details are complete (required before the first registration; completed in the dashboard).",
        input: {},
        run: (_a, api) => api.api("GET", "/domains/registrant"),
    }),
    defineTool({
        name: "register_domain", title: "Register domain", kind: "write",
        description: "Register a domain for 1 year. COSTS MONEY from the wallet: check search_domain and domain_prices, tell the user the price (plus WHOIS privacy if wanted) and get explicit OK first.",
        input: {
            name: z.string().describe("Full domain, e.g. tokosaya.id"),
            nameservers: z.array(z.string()).min(2).max(5).optional(),
            whoisProtection: z.boolean().optional(),
        },
        run: (a, api) => api.api("POST", "/domains/register", { body: { name: a.name, period: 1, nameservers: a.nameservers, whoisProtection: a.whoisProtection } }),
    }),
    defineTool({
        name: "transfer_domain", title: "Transfer domain in", kind: "write",
        description: "Transfer a domain from another registrar (adds 1 year). COSTS MONEY: show the transfer price and get the user's OK. Needs the domain's auth code.",
        input: { name: z.string(), authCode: z.string(), nameservers: z.array(z.string()).min(2).max(5).optional() },
        run: (a, api) => api.api("POST", "/domains/transfer", { body: { name: a.name, authCode: a.authCode, period: 1, nameservers: a.nameservers } }),
    }),
    defineTool({
        name: "renew_domain", title: "Renew domain", kind: "write",
        description: "Renew a domain for 1 year. COSTS MONEY: show the renewal price and get the user's OK.",
        input: { domainId },
        run: (a, api) => api.api("POST", `/domains/${a.domainId}/renew`, { body: { period: 1 } }),
    }),
    defineTool({
        name: "list_dns_records", title: "List DNS records", kind: "read",
        description: "DNS records of a registered domain.",
        input: { domainId },
        run: (a, api) => api.api("GET", `/domains/${a.domainId}/dns`),
    }),
    defineTool({
        name: "set_dns_records", title: "Replace DNS records", kind: "destructive",
        description: "Replace ALL DNS records of the domain with this list. Read list_dns_records first and include every record to keep.",
        input: { domainId, records: z.array(record).min(1) },
        run: (a, api) => api.api("POST", `/domains/${a.domainId}/dns`, { body: { records: a.records } }),
    }),
    defineTool({
        name: "delete_dns_record", title: "Delete DNS record", kind: "destructive",
        description: "Delete one DNS record (name, type and current content must match).",
        input: { domainId, name: z.string(), type: record.shape.type, content: z.string() },
        run: (a, api) => api.api("DELETE", `/domains/${a.domainId}/dns`, { body: { name: a.name, type: a.type, content: a.content } }),
    }),
    defineTool({
        name: "set_nameservers", title: "Set nameservers", kind: "write", idempotent: true,
        description: "Point the domain to other nameservers (2 to 5). Helipod DNS records stop applying while external nameservers are set.",
        input: { domainId, nameservers: z.array(z.string()).min(2).max(5) },
        run: (a, api) => api.api("PUT", `/domains/${a.domainId}/nameservers`, { body: { nameservers: a.nameservers } }),
    }),
    defineTool({
        name: "enable_whois_privacy", title: "Enable WHOIS privacy", kind: "write",
        description: "Hide the owner's details in WHOIS. COSTS MONEY (the whois_protection price per year). Confirm with the user.",
        input: { domainId },
        run: (a, api) => api.api("POST", `/domains/${a.domainId}/whois-protection`),
    }),
];
