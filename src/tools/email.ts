// Email API tools (separate email API key): send, logs, domains, templates, contacts.
import { z } from "zod";
import { defineTool } from "../tool.js";

export const emailTools = [
    defineTool({
        name: "email_status", title: "Email status", kind: "read",
        description: "Email service of the key's project: plan, usage today and this month, limits, counts.",
        input: {},
        run: (_a, api) => api.email("GET", "/status"),
    }),
    defineTool({
        name: "send_email", title: "Send email", kind: "write",
        description: "Send one email from a verified domain of the project (counts against the plan's quota). Use templateId + templateData, or subject + html/text. Pass an idempotencyKey when retrying.",
        input: {
            from: z.string().describe('"hello@example.com" or "Acme <hello@example.com>"'),
            to: z.array(z.string()).min(1).max(50),
            cc: z.array(z.string()).max(50).optional(), bcc: z.array(z.string()).max(50).optional(),
            subject: z.string().max(500).optional(), html: z.string().optional(), text: z.string().optional(),
            replyTo: z.string().optional(),
            templateId: z.string().optional(), templateData: z.record(z.string(), z.string()).optional(),
            variables: z.record(z.string(), z.string()).optional(),
            idempotencyKey: z.string().max(128).optional(),
        },
        run: (a, api) => api.email("POST", "/send", { body: a }),
    }),
    defineTool({
        name: "list_emails", title: "List sent emails", kind: "read",
        description: "Email log, newest first, with delivery status.",
        input: { status: z.string().optional(), search: z.string().optional(), limit: z.number().int().min(1).max(100).optional(), cursor: z.string().optional() },
        run: (a, api) => api.email("GET", "/emails", { query: a }),
    }),
    defineTool({
        name: "get_email", title: "Get email", kind: "read",
        description: "One sent email with its status and events.",
        input: { emailId: z.string() },
        run: (a, api) => api.email("GET", `/emails/${a.emailId}`),
    }),
    defineTool({
        name: "list_email_domains", title: "List sending domains", kind: "read",
        description: "Sending domains with verification status and the DNS records to add.",
        input: {},
        run: (_a, api) => api.email("GET", "/domains"),
    }),
    defineTool({
        name: "add_email_domain", title: "Add sending domain", kind: "write",
        description: "Add a sending domain; the response lists the DNS records the user must create, then call verify_email_domain.",
        input: { domain: z.string() },
        run: (a, api) => api.email("POST", "/domains", { body: { domain: a.domain } }),
    }),
    defineTool({
        name: "verify_email_domain", title: "Verify sending domain", kind: "write",
        description: "Check a sending domain's DNS records again.",
        input: { domainId: z.string() },
        run: (a, api) => api.email("POST", `/domains/${a.domainId}/verify`),
    }),
    defineTool({
        name: "list_email_templates", title: "List email templates", kind: "read",
        description: "Email templates of the project.",
        input: {},
        run: (_a, api) => api.email("GET", "/templates"),
    }),
    defineTool({
        name: "add_contact", title: "Add contact", kind: "write",
        description: "Add or update an audience contact.",
        input: { email: z.string(), firstName: z.string().optional(), lastName: z.string().optional() },
        run: (a, api) => api.email("POST", "/contacts", { body: a }),
    }),
];
