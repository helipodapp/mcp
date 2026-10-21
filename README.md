# Helipod MCP server and skills

Use [Helipod](https://helipod.io) from AI coding tools: deploy apps and databases, run VPS servers, buy domains and edit DNS, and send email, by asking in plain language.

- **MCP server** (`helipod-mcp`): 229 tools over the Container, Database, VPS, Domain, Email, Account and AI APIs. Works in Claude Code, Codex, Cursor, VS Code, Windsurf, Claude Desktop and any MCP client.
- **Skills** (`skills/`): step-by-step playbooks so the agent deploys, prices and confirms the way Helipod expects (price first, confirm before deleting, read build logs on failure).

Step-by-step guides for each tool (Claude Code, Codex, Cursor, VS Code, Gemini CLI, opencode, Windsurf, Claude Desktop, Cline and others): **https://docs.helipod.io/docs/helipod/ai-agents**

## Quick start: sign in (no key)

Add the hosted server and sign in to Helipod in the browser; you choose which products (Container, VPS, Domain API) and which project the tool may use, and can disconnect it any time in **Settings → API keys → Connected apps**.

| Tool | Add | Sign in |
|---|---|---|
| Claude Code | `/plugin marketplace add helipodapp/mcp` then `/plugin install helipod@mcp` (or `claude mcp add --transport http helipod https://api.helipod.io/mcp`) | `/mcp` → helipod → Authenticate |
| Codex | `[mcp_servers.helipod]` `url = "https://api.helipod.io/mcp"` in `~/.codex/config.toml` | `codex mcp login helipod` |
| Cursor | `{"mcpServers":{"helipod":{"url":"https://api.helipod.io/mcp"}}}` in `~/.cursor/mcp.json` | Settings → MCP → Needs login |
| opencode | `{"mcp":{"helipod":{"type":"remote","url":"https://api.helipod.io/mcp"}}}` | `opencode mcp auth helipod` |
| Gemini CLI | `{"mcpServers":{"helipod":{"httpUrl":"https://api.helipod.io/mcp"}}}` | `/mcp auth helipod` |
| VS Code | `{"servers":{"helipod":{"type":"http","url":"https://api.helipod.io/mcp"}}}` in `.vscode/mcp.json` | prompted when the server starts |
| Claude.ai, ChatGPT | Add a custom connector with the URL `https://api.helipod.io/mcp` | prompted when connecting |

Prefer a key, a local server, or a tool not listed? Read on.

## 1. Get a key

In the [dashboard](https://helipod.io/project) open a project, then **Settings → API keys**. Choose the products (Container API, Database API, VPS API, Domain API) and the reach (one project, or the whole account; the Domain API needs a whole-account key). The key starts with `hel_`.

For the email tools, enable **Email API** on the key (or sign in with it ticked). An email key from the project's **Email** section also still works, as `HELIPOD_EMAIL_API_KEY`.

```sh
export HELIPOD_API_KEY=hel_...
export HELIPOD_EMAIL_API_KEY=...   # optional: only if you use a separate email key
```

Start with a key limited to one project while you try things out.

## 2. Connect your tool

The server is the npm package `helipod-mcp` (Node.js 18 or newer). The configs below run it with `npx -y helipod-mcp` (or the installed `helipod-mcp` command) and pass `HELIPOD_API_KEY` from your environment.

### Claude Code

The plugin (above) uses the hosted server with sign-in. Local server with a key instead:

```sh
claude mcp add helipod --env HELIPOD_API_KEY=$HELIPOD_API_KEY -- npx -y helipod-mcp
```

### Codex

Install once (Codex does not wait for MCP servers to start, so an installed server is ready for the first message while `npx` can miss it):

```sh
npm install -g helipod-mcp
```

`~/.codex/config.toml`:

```toml
[mcp_servers.helipod]
command = "helipod-mcp"
env_vars = ["HELIPOD_API_KEY", "HELIPOD_EMAIL_API_KEY"]
```

### Cursor

`~/.cursor/mcp.json` (all projects) or `.cursor/mcp.json` (one project):

```json
{
  "mcpServers": {
    "helipod": {
      "command": "npx",
      "args": ["-y", "helipod-mcp"],
      "env": { "HELIPOD_API_KEY": "${env:HELIPOD_API_KEY}" }
    }
  }
}
```

### Gemini CLI

`~/.gemini/settings.json`:

```json
{
  "mcpServers": {
    "helipod": {
      "command": "npx",
      "args": ["-y", "helipod-mcp"],
      "env": { "HELIPOD_API_KEY": "$HELIPOD_API_KEY" }
    }
  }
}
```

Gemini CLI only starts MCP servers in folders you have trusted.

### opencode

`~/.config/opencode/opencode.json`:

```json
{
  "mcp": {
    "helipod": {
      "type": "local",
      "command": ["npx", "-y", "helipod-mcp"],
      "environment": { "HELIPOD_API_KEY": "{env:HELIPOD_API_KEY}" }
    }
  }
}
```

### VS Code (Copilot agent mode)

`.vscode/mcp.json`:

```json
{
  "inputs": [{ "id": "helipod-key", "type": "promptString", "description": "Helipod API key", "password": true }],
  "servers": {
    "helipod": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "helipod-mcp"],
      "env": { "HELIPOD_API_KEY": "${input:helipod-key}" }
    }
  }
}
```

### Windsurf

`~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "helipod": {
      "command": "npx",
      "args": ["-y", "helipod-mcp"],
      "env": { "HELIPOD_API_KEY": "hel_..." }
    }
  }
}
```

### Other clients

Run `npx -y helipod-mcp` as a stdio MCP server with `HELIPOD_API_KEY` in its environment (enable the Email API on it for the email tools, or add `HELIPOD_EMAIL_API_KEY`).

## Hosted server (nothing to install)

Clients that connect by URL can use `https://api.helipod.io/mcp` (Streamable HTTP) with `Authorization: Bearer hel_...` (the same key or sign-in serves the email tools when it has the Email API enabled; `X-Helipod-Email-Key` still works). Same tools; the key is used per request and never stored.

```sh
claude mcp add --transport http helipod https://api.helipod.io/mcp --header "Authorization: Bearer $HELIPOD_API_KEY"
```

```toml
# Codex: ~/.codex/config.toml
[mcp_servers.helipod]
url = "https://api.helipod.io/mcp"
bearer_token_env_var = "HELIPOD_API_KEY"
```

## Skills for other agents

Claude Code gets the skills with the plugin. For Codex, Cursor, Gemini CLI, opencode, GitHub Copilot and other agents that read `SKILL.md` files:

```sh
npx skills add helipodapp/mcp -g
```

Pick your agents when asked (or pass `-a codex cursor gemini-cli opencode -y`). Without `-g` the skills go into the current project only.

## 3. Ask

- "Deploy this repo to my Helipod project and give me the URL."
- "Create a Postgres database for this project and connect it to the api service."
- "Why did the last deploy fail?"
- "Is tokosaya.id available, and how much is it?"
- "Point www.tokosaya.id at my web service."
- "Create a 2 GB Ubuntu VPS and open port 443."
- "Send a test email from hello@mail.example.com to me."

## Tools

| Area | Tools |
|---|---|
| Containers | projects and environments (create, rename, delete), shared project variables, services (create from image, Git or Dockerfile, rename), deploy, deployments and build logs, restart, variables, domains and their ports, scale, volumes (with resize), function code, secret files, logs, metrics, templates, multi-service stacks |
| Databases | managed Postgres: create, connection string, branches per environment, compute settings, plan upgrades, usage, live stats, credit balance, tables, read-only queries, SQL classification and confirmed writes |
| VPS | plans, create, rename, power, reinstall, password, login details, terminate, renew, upgrade options and upgrade, auto-renew, metrics, firewall, port forwarding, SSH keys and SSH on/off, snapshots, backups |
| Domains | search, prices, owner details, register, transfer, renew (each with a dry run), DNS records, nameservers, child nameservers, WHOIS privacy |
| Email | status, plan (buy, renew, change, inbox add-ons, with dry runs), send, sent log, sending domains, templates, contacts, segments, topics, broadcasts, suppressions, webhooks, inbox |
| Account | wallet and transactions, invoices, monthly statements, notifications, project activity, support tickets |
| AI | models and prices, balance, usage, metrics, AI keys (list, revoke), top-up and auto top-up |
| Other | `helipod_api_get` to read any other documented endpoint (read only) |

Each tool is marked read-only, write or destructive, so clients can ask before running the risky ones. Calls that cost money support a dry run, and the server tells the agent to show the price and wait for your OK.

## Safety

- The agent can only do what the key allows. Use a project-limited key and only the products you need.
- Paid actions (new services, VPS, domains, scaling, email plans, AI top-ups) charge your Helipod wallet; the tools dry-run first and ask before the real call. Keep tool approvals on for write and destructive tools.
- Revoke a key in the dashboard at any time.

## Configuration

| Variable | Default |
|---|---|
| `HELIPOD_API_KEY` | (required for containers, VPS, domains) |
| `HELIPOD_EMAIL_API_KEY` | (optional; the email tools use `HELIPOD_API_KEY` when it has the Email API enabled) |
| `HELIPOD_API_URL` | `https://api.helipod.io/api` |
| `HELIPOD_EMAIL_API_URL` | `https://mail.helipod.io/api/email` |

## Development

```sh
bun install
bun run typecheck
bun test                       # catalog tests; live tests need HELIPOD_TEST_KEY
bun run build                  # dist/stdio.js, dist/index.js, dist/http.js
```

Docs: https://docs.helipod.io
