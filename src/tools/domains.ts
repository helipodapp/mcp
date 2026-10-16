// Domain API tools: search, prices, WHOIS, owner details, register/transfer/renew (with dry runs), DNS, nameservers, child nameservers, WHOIS privacy.
import { z } from "zod";
import { defineTool } from "../tool.js";

const domainId = z.number().int().positive().describe("Domain id (number, from list_my_domains)");
const hostId = z.number().int().positive().describe("Child nameserver id (from list_child_nameservers)");
const dryRun = z.boolean().optional().describe("true = return the exact price (IDR, VAT included) and the wallet balance after it; nothing is charged or registered");
const DRY = "Call with dryRun=true first, tell the user the price and walletBalanceAfter, and wait for an explicit yes before the real call.";
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
        description: "Whether the account's domain owner details are complete (required before the first registration) and which fields are missing. Fill them with update_registrant.",
        input: {},
        run: (_a, api) => api.api("GET", "/domains/registrant"),
    }),
    defineTool({
        name: "update_registrant", title: "Update owner details", kind: "write", idempotent: true,
        description: "Set the account's domain owner (registrant) details the registrar needs: name, phone, addressLine1, city, state, countryCode and postalCode are required for a complete profile (organization, addressLine2 and fax are optional). Send only fields to change. This is personal data: use only what the user gave you, never invent or guess it, and don't repeat it back needlessly. The answer says whether the details are now complete and which fields are still missing (it never echoes them).",
        input: {
            name: z.string().min(1).max(255).optional().describe("Owner's full name"),
            organization: z.string().max(255).optional().describe("Company / organization (optional)"),
            phone: z.string().min(9).max(20).optional().describe("Phone number, 9-20 characters, e.g. +6281234567890"),
            addressLine1: z.string().max(500).optional().describe("Street address"),
            addressLine2: z.string().max(500).optional(),
            city: z.string().max(100).optional(),
            state: z.string().max(100).optional().describe("State / province"),
            countryCode: z.string().regex(/^[A-Z]{2}$/).optional().describe("ISO 3166-1 alpha-2, e.g. ID"),
            postalCode: z.string().max(20).optional(),
            fax: z.string().max(50).optional(),
        },
        run: (a, api) => {
            if (!Object.values(a).some(v => v !== undefined)) throw new Error("Send at least one field to change.");
            return api.api("PATCH", "/domains/registrant", { body: a });
        },
    }),
    defineTool({
        name: "register_domain", title: "Register domain", kind: "write",
        description: `Register a domain for 1 year. COSTS MONEY from the wallet. Check search_domain, and that the owner details are complete (check_registrant / update_registrant). ${DRY} The dry run includes WHOIS privacy when whoisProtection is true.`,
        input: {
            name: z.string().describe("Full domain, e.g. tokosaya.id"),
            nameservers: z.array(z.string()).min(2).max(5).optional(),
            whoisProtection: z.boolean().optional(),
            dryRun,
        },
        run: (a, api) => api.api("POST", "/domains/register", { body: { name: a.name, period: 1, nameservers: a.nameservers, whoisProtection: a.whoisProtection }, query: { dryRun: a.dryRun ? "true" : undefined } }),
    }),
    defineTool({
        name: "transfer_domain", title: "Transfer domain in", kind: "write",
        description: `Transfer a domain from another registrar (adds 1 year). COSTS MONEY from the wallet. Needs the domain's auth code. ${DRY}`,
        input: { name: z.string(), authCode: z.string(), nameservers: z.array(z.string()).min(2).max(5).optional(), dryRun },
        run: (a, api) => api.api("POST", "/domains/transfer", { body: { name: a.name, authCode: a.authCode, period: 1, nameservers: a.nameservers }, query: { dryRun: a.dryRun ? "true" : undefined } }),
    }),
    defineTool({
        name: "renew_domain", title: "Renew domain", kind: "write",
        description: `Renew a domain for 1 year (plus WHOIS privacy when it is on). COSTS MONEY from the wallet. ${DRY}`,
        input: { domainId, dryRun },
        run: (a, api) => api.api("POST", `/domains/${a.domainId}/renew`, { body: { period: 1 }, query: { dryRun: a.dryRun ? "true" : undefined } }),
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
    defineTool({
        name: "get_domain_price", title: "Domain price detail", kind: "read",
        description: "Registration, renewal and transfer price (IDR, VAT included) and WHOIS privacy price of one extension, by the price id from domain_prices.",
        input: { priceId: z.number().int().positive().describe("Price id (the id of a domain_prices row)") },
        run: (a, api) => api.api("GET", `/domains/prices/${a.priceId}`),
    }),
    defineTool({
        name: "whois_lookup", title: "WHOIS lookup", kind: "read",
        description: "Public WHOIS record of any domain name: registrar, dates, status, nameservers. Use search_domain to check availability instead.",
        input: { domain: z.string().describe("e.g. example.com") },
        run: (a, api) => api.api("GET", "/domains/whois", { query: { domain: a.domain } }),
    }),
    defineTool({
        name: "update_dns_record", title: "Update one DNS record", kind: "write", idempotent: true,
        description: "Set one DNS record (by name and type) to new content, leaving the other records as they are. Safer than set_dns_records for a single change; read list_dns_records first.",
        input: { domainId, ...record.shape },
        run: (a, api) => api.api("PUT", `/domains/${a.domainId}/dns`, { body: { name: a.name, type: a.type, content: a.content, ttl: a.ttl } }),
    }),
    defineTool({
        name: "list_child_nameservers", title: "List child nameservers", kind: "read",
        description: "Child nameservers (glue records like ns1.yourdomain.com) of a registered domain, with their IP addresses.",
        input: { domainId },
        run: (a, api) => api.api("GET", `/domains/${a.domainId}/hosts`),
    }),
    defineTool({
        name: "create_child_nameserver", title: "Create child nameserver", kind: "write",
        description: "Create a child nameserver (glue record) under the domain, e.g. hostname ns1 → ns1.yourdomain.com pointing to an IP. Only needed to run your own nameservers on this domain.",
        input: { domainId, hostname: z.string().describe('Prefix, e.g. "ns1"'), ipAddress: z.string().describe("IPv4 or IPv6 address") },
        run: (a, api) => api.api("POST", `/domains/${a.domainId}/hosts`, { body: { hostname: a.hostname, ipAddress: a.ipAddress } }),
    }),
    defineTool({
        name: "update_child_nameserver", title: "Update child nameserver", kind: "write", idempotent: true,
        description: "Change a child nameserver's name or IP address. Domains using it as a nameserver follow the new IP.",
        input: { domainId, hostId, hostname: z.string().optional(), ipAddress: z.string().optional() },
        run: (a, api) => api.api("PUT", `/domains/${a.domainId}/hosts/${a.hostId}`, { body: { hostname: a.hostname, ipAddress: a.ipAddress } }),
    }),
    defineTool({
        name: "delete_child_nameserver", title: "Delete child nameserver", kind: "destructive",
        description: "Delete a child nameserver. Any domain still using it as a nameserver stops resolving: check with the user first.",
        input: { domainId, hostId },
        run: (a, api) => api.api("DELETE", `/domains/${a.domainId}/hosts/${a.hostId}`),
    }),
    defineTool({
        name: "get_whois_privacy", title: "WHOIS privacy status", kind: "read",
        description: "Whether WHOIS privacy (hiding the owner's details) is on for a domain.",
        input: { domainId },
        run: (a, api) => api.api("GET", `/domains/${a.domainId}/whois-protection`),
    }),
    defineTool({
        name: "disable_whois_privacy", title: "Disable WHOIS privacy", kind: "destructive",
        description: "Turn WHOIS privacy off: the owner's name, address, email and phone become PUBLIC in WHOIS (no refund; turning it back on with enable_whois_privacy costs money). Get explicit confirmation.",
        input: { domainId },
        run: (a, api) => api.api("DELETE", `/domains/${a.domainId}/whois-protection`),
    }),
];
