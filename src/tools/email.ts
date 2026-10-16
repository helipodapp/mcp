// Email API tools: send, logs, domains, templates, contacts. They use the email key when one is set,
// else the Helipod API key / sign-in token (needs the Email API enabled; projectId picks the project
// for a whole-account key).
import { z } from "zod";
import { defineTool } from "../tool.js";

const projectId = z.string().uuid().optional().describe("Project whose email to use. Only needed with a whole-account key that reaches several projects with email.");

export const emailTools = [
    defineTool({
        name: "email_status", title: "Email status", kind: "read",
        description: "Email service of the key's project: plan, usage today and this month, limits, counts.",
        input: { projectId },
        run: (a, api) => api.email("GET", "/status", { project: a.projectId }),
    }),
    defineTool({
        name: "send_email", title: "Send email", kind: "write",
        description: "Send one email from a verified domain of the project (counts against the plan's quota). Use templateId + templateData, or subject + html/text. Pass an idempotencyKey when retrying.",
        input: {
            projectId,
            from: z.string().describe('"hello@example.com" or "Acme <hello@example.com>"'),
            to: z.array(z.string()).min(1).max(50),
            cc: z.array(z.string()).max(50).optional(), bcc: z.array(z.string()).max(50).optional(),
            subject: z.string().max(500).optional(), html: z.string().optional(), text: z.string().optional(),
            replyTo: z.string().optional(),
            templateId: z.string().optional(), templateData: z.record(z.string(), z.string()).optional(),
            variables: z.record(z.string(), z.string()).optional(),
            idempotencyKey: z.string().max(128).optional(),
        },
        run: ({ projectId: project, ...a }, api) => api.email("POST", "/send", { body: a, project }),
    }),
    defineTool({
        name: "list_emails", title: "List sent emails", kind: "read",
        description: "Email log, newest first, with delivery status.",
        input: { projectId, status: z.string().optional(), search: z.string().optional(), limit: z.number().int().min(1).max(100).optional(), cursor: z.string().optional() },
        run: ({ projectId: project, ...a }, api) => api.email("GET", "/emails", { query: a, project }),
    }),
    defineTool({
        name: "get_email", title: "Get email", kind: "read",
        description: "One sent email with its status and events.",
        input: { projectId, emailId: z.string() },
        run: (a, api) => api.email("GET", `/emails/${a.emailId}`, { project: a.projectId }),
    }),
    defineTool({
        name: "list_email_domains", title: "List sending domains", kind: "read",
        description: "Sending domains with verification status and the DNS records to add.",
        input: { projectId },
        run: (a, api) => api.email("GET", "/domains", { project: a.projectId }),
    }),
    defineTool({
        name: "add_email_domain", title: "Add sending domain", kind: "write",
        description: "Add a sending domain; the response lists the DNS records the user must create, then call verify_email_domain.",
        input: { projectId, domain: z.string() },
        run: (a, api) => api.email("POST", "/domains", { body: { domain: a.domain }, project: a.projectId }),
    }),
    defineTool({
        name: "verify_email_domain", title: "Verify sending domain", kind: "write",
        description: "Check a sending domain's DNS records again.",
        input: { projectId, domainId: z.string() },
        run: (a, api) => api.email("POST", `/domains/${a.domainId}/verify`, { project: a.projectId }),
    }),
    defineTool({
        name: "list_email_templates", title: "List email templates", kind: "read",
        description: "Email templates of the project.",
        input: { projectId },
        run: (a, api) => api.email("GET", "/templates", { project: a.projectId }),
    }),
    defineTool({
        name: "add_contact", title: "Add contact", kind: "write",
        description: "Add or update an audience contact.",
        input: { projectId, email: z.string(), firstName: z.string().optional(), lastName: z.string().optional() },
        run: ({ projectId: project, ...a }, api) => api.email("POST", "/contacts", { body: a, project }),
    }),
];
