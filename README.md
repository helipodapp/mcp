# Helipod MCP server and skills

Use [Helipod](https://helipod.io) from AI coding tools: deploy apps and databases, run VPS servers, buy domains and edit DNS, and send email, by asking in plain language.

- **MCP server** (`helipod-mcp`): 70 tools over the Container, VPS, Domain and Email APIs. Works in Claude Code, Codex, Cursor, VS Code, Windsurf, Claude Desktop and any MCP client.
- **Skills** (`skills/`): step-by-step playbooks so the agent deploys, prices and confirms the way Helipod expects (price first, confirm before deleting, read build logs on failure).

## 1. Get a key

In the [dashboard](https://helipod.io/project) open a project, then **Settings → API keys**. Choose the products (Container API, VPS API, Domain API) and the reach (one project, or the whole account; the Domain API needs a whole-account key). The key starts with `hel_`.

Optional: an **email API key** from the project's **Email** section, for the email tools.

```sh
export HELIPOD_API_KEY=hel_...
export HELIPOD_EMAIL_API_KEY=...   # optional
```

Start with a key limited to one project while you try things out.

## 2. Connect your tool

### Claude Code (plugin: MCP server + skills)

```sh
/plugin marketplace add https://gitlab.com/leoanangmh/helipod-mcp.git
/plugin install helipod@helipod
```

The plugin reads `HELIPOD_API_KEY` and `HELIPOD_EMAIL_API_KEY` from your environment.

MCP server only:

```sh
claude mcp add helipod --env HELIPOD_API_KEY=$HELIPOD_API_KEY -- npx -y helipod-mcp
# or the hosted server, nothing to install:
claude mcp add --transport http helipod https://api.helipod.io/mcp --header "Authorization: Bearer $HELIPOD_API_KEY"
```

### Codex

`~/.codex/config.toml`:

```toml
[mcp_servers.helipod]
command = "npx"
args = ["-y", "helipod-mcp"]
env_vars = ["HELIPOD_API_KEY", "HELIPOD_EMAIL_API_KEY"]
```

Hosted instead:

```toml
[mcp_servers.helipod]
url = "https://api.helipod.io/mcp"
bearer_token_env_var = "HELIPOD_API_KEY"
```

Skills: copy the folders in `skills/` to `~/.codex/skills/` (all projects) or `.agents/skills/` (one repository).

### Cursor

`.cursor/mcp.json` (or `~/.cursor/mcp.json`):

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
      "serverUrl": "https://api.helipod.io/mcp",
      "headers": { "Authorization": "Bearer hel_..." }
    }
  }
}
```

### Claude Desktop and other clients

Run `npx -y helipod-mcp` as a stdio server with `HELIPOD_API_KEY` in its environment, or connect to `https://api.helipod.io/mcp` (Streamable HTTP) with `Authorization: Bearer <key>`. On the hosted server, send the email key as `X-Helipod-Email-Key`.

Other agents that read `SKILL.md` files can use the `skills/` folder as is.

## 3. Ask

- "Deploy this repo to my Helipod project and give me the URL."
- "Add Postgres to production and connect it to the api service."
- "Why did the last deploy fail?"
- "Is tokosaya.id available, and how much is it?"
- "Point www.tokosaya.id at my web service."
- "Create a 2 GB Ubuntu VPS and open port 443."
- "Send a test email from hello@mail.example.com to me."

## Tools

| Area | Tools |
|---|---|
| Containers | projects, services (create from image, Git or Dockerfile), deploy, deployments and build logs, restart, variables, domains, scale, volumes, logs, metrics, templates, multi-service stacks |
| VPS | plans, create, power, reinstall, password, login details, terminate, renew, upgrade, auto-renew, firewall, snapshots |
| Domains | search, prices, register, transfer, renew, DNS records, nameservers, WHOIS privacy |
| Email | status, send, sent log, sending domains, templates, contacts |
| Other | `helipod_request` for any other documented endpoint |

Each tool is marked read-only, write or destructive, so clients can ask before running the risky ones. Calls that cost money support a dry run, and the server tells the agent to show the price and wait for your OK.

## Safety

- The agent can only do what the key allows. Use a project-limited key and only the products you need.
- Paid actions (new services, VPS, domains, scaling) charge your Helipod wallet. Keep tool approvals on for write and destructive tools.
- Revoke a key in the dashboard at any time.

## Configuration

| Variable | Default |
|---|---|
| `HELIPOD_API_KEY` | (required for containers, VPS, domains) |
| `HELIPOD_EMAIL_API_KEY` | (required for email tools) |
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
