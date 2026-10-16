// Account API tools: wallet and its transactions, invoices, monthly statements, notifications, a project's activity
// feed and support tickets. Read-only for money: nothing here spends from the wallet.
import { z } from "zod";
import { defineTool } from "../tool.js";

const uid = (what: string) => z.string().uuid().describe(`${what} id`);
const limit = z.number().int().min(1).max(100).optional();
const offset = z.number().int().min(0).max(100000).optional();
const ACCOUNT_KEY = "Needs a whole-account key (a key limited to one project gets 403 ACCOUNT_KEY_REQUIRED).";

export const accountTools = [
    defineTool({
        name: "get_wallet", title: "Get wallet balance", kind: "read",
        description: `The account's wallet balance (IDR) that every purchase is paid from. Check it before buying something. ${ACCOUNT_KEY}`,
        input: {},
        run: (_a, api) => api.api("GET", "/account/wallet"),
    }),
    defineTool({
        name: "list_wallet_transactions", title: "List wallet transactions", kind: "read",
        description: `Wallet history, newest first: amount (negative = debit), source, description, date. Page with limit/offset (total is returned). ${ACCOUNT_KEY}`,
        input: { limit, offset },
        run: (a, api) => api.api("GET", "/account/wallet/transactions", { query: { limit: a.limit, offset: a.offset } }),
    }),
    defineTool({
        name: "list_invoices", title: "List invoices", kind: "read",
        description: `Invoices of the account: number, title, amount (IDR), status (pending, paid, expired, ...), dates; a pending one has the customer's own paymentUrl. ${ACCOUNT_KEY}`,
        input: {},
        run: (_a, api) => api.api("GET", "/account/invoices"),
    }),
    defineTool({
        name: "get_invoice", title: "Get invoice", kind: "read",
        description: `One PAID invoice as document data: seller, customer, line and totals (409 INVOICE_NOT_PAID while unpaid). ${ACCOUNT_KEY}`,
        input: { invoiceId: uid("Invoice") },
        run: (a, api) => api.api("GET", `/account/invoices/${a.invoiceId}`),
    }),
    defineTool({
        name: "list_statements", title: "List monthly statements", kind: "read",
        description: `Months (YYYY-MM) that have a monthly statement. ${ACCOUNT_KEY}`,
        input: {},
        run: (_a, api) => api.api("GET", "/account/statements"),
    }),
    defineTool({
        name: "get_statement", title: "Get monthly statement", kind: "read",
        description: `Monthly statement (WIB): what was paid, wallet charges, refunds and credits with totals, and the balance now. The current month is month to date (partial). ${ACCOUNT_KEY}`,
        input: { month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).describe("YYYY-MM, e.g. 2026-09") },
        run: (a, api) => api.api("GET", `/account/statements/${a.month}`),
    }),
    defineTool({
        name: "list_notifications", title: "List notifications", kind: "read",
        description: "In-app notifications, newest first (deploy results, renewals, low balance, ...). A project key sees its own project's only.",
        input: { unreadOnly: z.boolean().optional(), limit, offset },
        run: (a, api) => api.api("GET", "/account/notifications", { query: { unreadOnly: a.unreadOnly ? "true" : undefined, limit: a.limit, offset: a.offset } }),
    }),
    defineTool({
        name: "get_unread_notification_count", title: "Unread notification count", kind: "read",
        description: "How many notifications are unread.",
        input: {},
        run: (_a, api) => api.api("GET", "/account/notifications/unread-count"),
    }),
    defineTool({
        name: "mark_notification_read", title: "Mark notification read", kind: "write", idempotent: true,
        description: "Mark one notification as read.",
        input: { notificationId: uid("Notification") },
        run: (a, api) => api.api("POST", `/account/notifications/${a.notificationId}/read`),
    }),
    defineTool({
        name: "mark_all_notifications_read", title: "Mark all notifications read", kind: "write", idempotent: true,
        description: "Mark every unread notification as read (a project key: its project's only). Ask the user first: they may want to read them in the dashboard.",
        input: {},
        run: (_a, api) => api.api("POST", "/account/notifications/read-all"),
    }),
    defineTool({
        name: "get_project_activity", title: "Project activity", kind: "read",
        description: "Activity feed of a project, newest first: who did what (action, entity, by the key owner or someone else / the system) and when. Filter by environmentId or action.",
        input: {
            projectId: uid("Project"), environmentId: uid("Environment").optional(),
            action: z.string().regex(/^[a-z0-9_.:-]{1,64}$/).optional().describe("e.g. deploy, service.create"),
            limit, offset,
        },
        run: (a, api) => api.api("GET", `/account/projects/${a.projectId}/activity`, { query: { environmentId: a.environmentId, action: a.action, limit: a.limit, offset: a.offset } }),
    }),
    defineTool({
        name: "list_support_tickets", title: "List support tickets", kind: "read",
        description: `Support tickets of the account with subject, category, priority and status. ${ACCOUNT_KEY}`,
        input: {},
        run: (_a, api) => api.api("GET", "/account/tickets"),
    }),
    defineTool({
        name: "get_support_ticket", title: "Get support ticket", kind: "read",
        description: `One support ticket with its conversation (from: you or support). ${ACCOUNT_KEY}`,
        input: { ticketId: uid("Ticket") },
        run: (a, api) => api.api("GET", `/account/tickets/${a.ticketId}`),
    }),
    defineTool({
        name: "create_support_ticket", title: "Open support ticket", kind: "write",
        description: `Open a ticket with Helipod support (at most 5 an hour; reply to an open ticket instead of opening another). Show the user the subject and message before sending, and never include passwords, API keys or other secrets. ${ACCOUNT_KEY}`,
        input: {
            subject: z.string().min(3).max(255),
            category: z.enum(["billing", "technical", "feature_request", "other"]),
            message: z.string().min(10).max(10000),
            priority: z.enum(["low", "normal", "high", "urgent"]).optional().describe("Default normal"),
        },
        run: (a, api) => api.api("POST", "/account/tickets", { body: a }),
    }),
    defineTool({
        name: "reply_support_ticket", title: "Reply to support ticket", kind: "write",
        description: `Add a message to an open ticket (409 TICKET_CLOSED when closed: open a new one). Never include secrets. ${ACCOUNT_KEY}`,
        input: { ticketId: uid("Ticket"), message: z.string().min(1).max(10000) },
        run: (a, api) => api.api("POST", `/account/tickets/${a.ticketId}/messages`, { body: { message: a.message } }),
    }),
    defineTool({
        name: "close_support_ticket", title: "Close support ticket", kind: "write", idempotent: true,
        description: `Close a support ticket once the issue is solved (a closed ticket takes no more replies). Ask the user first. ${ACCOUNT_KEY}`,
        input: { ticketId: uid("Ticket") },
        run: (a, api) => api.api("POST", `/account/tickets/${a.ticketId}/close`),
    }),
];
