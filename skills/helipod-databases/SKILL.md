---
name: helipod-databases
description: Create and use a managed Postgres database on Helipod - activate it for a project, connect an app through a secret DATABASE_URL, give each environment its own branch, inspect tables, run migrations safely, scale and upgrade plans. Use when the user needs a Postgres database for a Helipod project or wants to query or change one.
---

# Helipod managed Postgres

Follow the `helipod` skill rules (price first, confirm destructive actions, never print secrets). The key needs the **Database API** product.

## Create and connect

1. `list_projects` → the project. One database per project; each environment gets its own branch (production is the primary).
2. `create_database` with the projectId (free plan; returns the existing database if there is one).
3. `get_database_connection` (add `environmentId` for a non-production environment) → `uri`. Never paste it into code or chat.
4. Give it to the app as a secret variable: `set_variables` on the service with `secrets: { "DATABASE_URL": "<uri>" }`, then `deploy_service`. The URI is pooled and requires SSL (already in the string).

## Environments

- `create_database_branch` gives staging (or any environment) its own copy of production's data at that moment. Then `get_database_connection` with that environmentId.
- Run migrations on staging first, check, then production.
- `delete_database_branch` removes a non-primary branch and its data (confirm first).

## Inspect and change data

- `list_database_tables`, `describe_database_table`, `query_database` (read-only, up to 200 rows, `$1` placeholders with `params`).
- `execute_database_sql` for INSERT/UPDATE/DELETE/CREATE/ALTER/DROP: show the exact statement and the environment, wait for a clear yes. Prefer the app's own migration tool for schema changes when the project has one.

## Plans, credits, scaling

- Free plan: fixed small limits. Paid plans (`list_database_plans`): prepaid compute hours and storage that never expire; when credits run out the database is suspended until topped up.
- `upgrade_database` with `dryRun: true` first → show price and wallet balance after → only then without dryRun.
- `get_database_usage` shows what is used and what is left.
- Paid plans: `update_database_settings` (dryRun first). A `minCu` above 0 keeps compute warm but uses credits even when idle; `maxCu` caps autoscaling; `suspendTimeoutSeconds` is the idle time before scaling to zero.

## Errors

`PLAN_REQUIRED` (settings need a paid plan), `INSUFFICIENT_BALANCE` (top up the wallet), `ENVIRONMENT_BRANCH_MISSING` (create the branch first), `WRITE_NOT_ALLOWED` (use execute_database_sql), `SQL_ERROR` (the database's own message).
