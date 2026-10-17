// Database API tools (managed Postgres): plans, databases, connection, branches per environment, compute settings,
// upgrade, suspend/resume, usage, stats, credit balance, tables and SQL (with a classify step before writes).
import { z } from "zod";
import { defineTool } from "../tool.js";

const databaseId = z.string().uuid().describe("Database id (from list_databases)");
const environmentId = z.string().uuid().describe("Environment id (from list_projects). Omit for the primary (production) branch.");
const dryRun = z.boolean().optional().describe("true = only check and show the result or price; nothing changes");

export const databaseTools = [
    defineTool({
        name: "list_database_plans", title: "List database plans", kind: "read",
        description: "Managed Postgres plans: price (IDR), included compute hours and storage, maximum CU. Free is the default; paid plans are prepaid credits that never expire.",
        input: {},
        run: (_a, api) => api.api("GET", "/databases/plans"),
    }),
    defineTool({
        name: "list_databases", title: "List databases", kind: "read",
        description: "Managed Postgres databases in the projects this key can reach: status, plan and remaining credits, region, branches per environment.",
        input: {},
        run: (_a, api) => api.api("GET", "/databases"),
    }),
    defineTool({
        name: "get_database", title: "Get database", kind: "read",
        description: "One database with its plan, compute settings and branches.",
        input: { databaseId },
        run: (a, api) => api.api("GET", `/databases/${a.databaseId}`),
    }),
    defineTool({
        name: "create_database", title: "Create database", kind: "write", idempotent: true,
        description: "Create the managed Postgres database of a project (free plan; one database per project, one branch per environment). Returns the existing one if the project already has it.",
        input: { projectId: z.string().uuid(), idempotencyKey: z.string().max(128).optional() },
        run: (a, api) => api.api("POST", "/databases", { body: { projectId: a.projectId }, idempotencyKey: a.idempotencyKey }),
    }),
    defineTool({
        name: "delete_database", title: "Delete database", kind: "destructive",
        description: "Delete a database with ALL its data and branches. Irreversible. Only after the user confirms; confirm must be the database name.",
        input: { databaseId, confirm: z.string().describe("The database name, exactly") },
        run: (a, api) => api.api("DELETE", `/databases/${a.databaseId}`, { body: { confirm: a.confirm } }),
    }),
    defineTool({
        name: "get_database_connection", title: "Get database connection", kind: "read",
        description: "Connection string (postgresql://…, pooled, SSL) and its parts for an environment's branch. Contains the password: store it as a secret variable (e.g. DATABASE_URL via set_variables secrets), never print it unless asked.",
        input: { databaseId, environmentId: environmentId.optional() },
        run: (a, api) => api.api("GET", `/databases/${a.databaseId}/connection`, { query: { environmentId: a.environmentId } }),
    }),
    defineTool({
        name: "list_database_branches", title: "List database branches", kind: "read",
        description: "Branches of a database, one per environment (production is the primary).",
        input: { databaseId },
        run: (a, api) => api.api("GET", `/databases/${a.databaseId}/branches`),
    }),
    defineTool({
        name: "create_database_branch", title: "Create database branch", kind: "write", idempotent: true,
        description: "Give an environment (e.g. staging) its own branch: a copy of the source environment's data at this moment (the primary when omitted).",
        input: { databaseId, environmentId: z.string().uuid(), sourceEnvironmentId: z.string().uuid().optional() },
        run: (a, api) => api.api("POST", `/databases/${a.databaseId}/branches`, { body: { environmentId: a.environmentId, sourceEnvironmentId: a.sourceEnvironmentId } }),
    }),
    defineTool({
        name: "delete_database_branch", title: "Delete database branch", kind: "destructive",
        description: "Delete an environment's branch and its data. The primary (production) branch cannot be deleted.",
        input: { databaseId, environmentId: z.string().uuid() },
        run: (a, api) => api.api("DELETE", `/databases/${a.databaseId}/branches/${a.environmentId}`),
    }),
    defineTool({
        name: "get_database_settings", title: "Get database compute settings", kind: "read",
        description: "Compute settings (paid plans): minCu (floor), maxCu (autoscaling ceiling), suspendTimeoutSeconds (idle time before scaling to zero), the plan's maximum CU.",
        input: { databaseId },
        run: (a, api) => api.api("GET", `/databases/${a.databaseId}/settings`),
    }),
    defineTool({
        name: "update_database_settings", title: "Update database compute settings", kind: "write",
        description: "Change compute for every branch (paid plans). A minCu above zero keeps compute running and uses credits while idle: run with dryRun first and show idleComputeHoursPerMonth.",
        input: {
            databaseId,
            minCu: z.number().min(0.25).max(10).optional(), maxCu: z.number().min(0.25).max(10).optional(),
            suspendTimeoutSeconds: z.number().int().min(0).max(604800).optional().describe("0 = never suspend, or 60-604800"),
            dryRun,
        },
        run: (a, api) => api.api("PATCH", `/databases/${a.databaseId}/settings`, {
            body: { minCu: a.minCu, maxCu: a.maxCu, suspendTimeoutSeconds: a.suspendTimeoutSeconds },
            query: { dryRun: a.dryRun ? "true" : undefined },
        }),
    }),
    defineTool({
        name: "upgrade_database", title: "Upgrade database plan / top up", kind: "write",
        description: "Buy a paid plan or top up credits. COSTS MONEY from the wallet: call with dryRun first, show price and wallet balance after, and get the user's explicit OK.",
        input: { databaseId, plan: z.string().describe("Plan code (e.g. STARTER) or id from list_database_plans"), dryRun, idempotencyKey: z.string().max(128).optional() },
        run: (a, api) => api.api("POST", `/databases/${a.databaseId}/upgrade`, { body: { plan: a.plan }, query: { dryRun: a.dryRun ? "true" : undefined }, idempotencyKey: a.idempotencyKey }),
    }),
    defineTool({
        name: "suspend_database", title: "Suspend database", kind: "destructive",
        description: "Stop the database's compute (connections fail until resumed).",
        input: { databaseId },
        run: (a, api) => api.api("POST", `/databases/${a.databaseId}/suspend`),
    }),
    defineTool({
        name: "resume_database", title: "Resume database", kind: "write",
        description: "Start a suspended database again.",
        input: { databaseId },
        run: (a, api) => api.api("POST", `/databases/${a.databaseId}/resume`),
    }),
    defineTool({
        name: "get_database_usage", title: "Database usage", kind: "read",
        description: "This period's compute (CU-hours), storage, history and network, plus the plan's remaining credits.",
        input: { databaseId },
        run: (a, api) => api.api("GET", `/databases/${a.databaseId}/usage`),
    }),
    defineTool({
        name: "get_database_stats", title: "Database live stats", kind: "read",
        description: "Live compute stats of an environment's branch over the last hours: CPU, memory, rows read/written, cache hit rate, connections. grouping min/hour/day sets the point size.",
        input: {
            databaseId, environmentId: environmentId.optional(),
            grouping: z.enum(["min", "hour", "day"]).optional().describe("Default min"),
            hours: z.number().int().min(1).max(720).optional().describe("How far back, default 1"),
        },
        run: (a, api) => api.api("GET", `/databases/${a.databaseId}/stats`, { query: { environmentId: a.environmentId, grouping: a.grouping, hours: a.hours } }),
    }),
    defineTool({
        name: "get_database_balance", title: "Database credit balance", kind: "read",
        description: "Credit left on the paid plan: compute (CU-hours) and storage remaining. Zero on the free plan. Top up with upgrade_database.",
        input: { databaseId },
        run: (a, api) => api.api("GET", `/databases/${a.databaseId}/balance`),
    }),
    defineTool({
        name: "list_database_tables", title: "List database tables", kind: "read",
        description: "Tables and views in the public schema of an environment's branch.",
        input: { databaseId, environmentId: environmentId.optional() },
        run: (a, api) => api.api("GET", `/databases/${a.databaseId}/tables`, { query: { environmentId: a.environmentId } }),
    }),
    defineTool({
        name: "describe_database_table", title: "Describe database table", kind: "read",
        description: "Columns of a table (name, type, nullable, default).",
        input: { databaseId, table: z.string().min(1).max(63), environmentId: environmentId.optional() },
        run: (a, api) => api.api("GET", `/databases/${a.databaseId}/tables/${encodeURIComponent(a.table)}/columns`, { query: { environmentId: a.environmentId } }),
    }),
    defineTool({
        name: "browse_database_table", title: "Browse table rows", kind: "read",
        description: "Rows of a table, a page at a time (limit up to 200, offset to page). Read-only. Rows are returned as stored, including any sensitive columns.",
        input: {
            databaseId, table: z.string().min(1).max(63), environmentId: environmentId.optional(),
            limit: z.number().int().min(1).max(200).optional(), offset: z.number().int().min(0).optional(),
        },
        run: (a, api) => api.api("GET", `/databases/${a.databaseId}/tables/${encodeURIComponent(a.table)}/rows`, { query: { environmentId: a.environmentId, limit: a.limit, offset: a.offset } }),
    }),
    defineTool({
        name: "query_database", title: "Query database (read-only)", kind: "read",
        description: "Run a read-only SQL statement (SELECT, EXPLAIN, SHOW…) in a read-only transaction; up to 200 rows. Use $1, $2… placeholders with params. Statements that change data are refused (execute_database_sql runs those).",
        input: { databaseId, sql: z.string().min(1).max(10000), params: z.array(z.any()).max(100).optional(), environmentId: environmentId.optional() },
        run: (a, api) => api.api("POST", `/databases/${a.databaseId}/query`, { body: { sql: a.sql, params: a.params, environmentId: a.environmentId } }),
    }),
    defineTool({
        name: "classify_database_sql", title: "Classify SQL (no run)", kind: "read",
        description: "What a SQL statement is (command, e.g. select / update / drop) and whether it writes, WITHOUT running it. It reports what a statement would change before execute_database_sql runs it; readOnly statements can run with query_database.",
        input: { databaseId, sql: z.string().min(1).max(10000) },
        run: (a, api) => api.api("POST", `/databases/${a.databaseId}/query/classify`, { body: { sql: a.sql } }),
    }),
    defineTool({
        name: "execute_database_sql", title: "Execute SQL (writes)", kind: "destructive",
        description: "Run a statement that changes data or schema (INSERT, UPDATE, DELETE, CREATE, ALTER, DROP…). classify_database_sql reports what a statement does without running it. It runs on the chosen environment's branch.",
        input: { databaseId, sql: z.string().min(1).max(10000), params: z.array(z.any()).max(100).optional(), environmentId: environmentId.optional() },
        run: (a, api) => api.api("POST", `/databases/${a.databaseId}/query`, { body: { sql: a.sql, params: a.params, environmentId: a.environmentId, allowWrite: true } }),
    }),
];
