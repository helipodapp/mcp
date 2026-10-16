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

The server runs with `npx -y github:helipodapp/mcp` (Node.js 18 or newer). Every config below starts it that way and passes `HELIPOD_API_KEY` from your environment.

### Claude Code (plugin: MCP server + skills)

```sh
/plugin marketplace add helipodapp/mcp
/plugin install helipod@mcp
```

MCP server only:

```sh
claude mcp add helipod --env HELIPOD_API_KEY=$HELIPOD_API_KEY -- npx -y github:helipodapp/mcp
```

### Codex

`~/.codex/config.toml`:

```toml
[mcp_servers.helipod]
command = "npx"
args = ["-y", "github:helipodapp/mcp"]
env_vars = ["HELIPOD_API_KEY", "HELIPOD_EMAIL_API_KEY"]
```

### Cursor

`~/.cursor/mcp.json` (all projects) or `.cursor/mcp.json` (one project):

```json
{
  "mcpServers": {
    "helipod": {
      "command": "npx",
      "args": ["-y", "github:helipodapp/mcp"],
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
      "args": ["-y", "github:helipodapp/mcp"],
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
      "command": ["npx", "-y", "github:helipodapp/mcp"],
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
      "args": ["-y", "github:helipodapp/mcp"],
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
      "args": ["-y", "github:helipodapp/mcp"],
      "env": { "HELIPOD_API_KEY": "hel_..." }
    }
  }
}
```

### Other clients

Run `npx -y github:helipodapp/mcp` as a stdio MCP server with `HELIPOD_API_KEY` (and optionally `HELIPOD_EMAIL_API_KEY`) in its environment.

## Skills for other agents

Claude Code gets the skills with the plugin. For Codex, Cursor, Gemini CLI, opencode, GitHub Copilot and other agents that read `SKILL.md` files:

```sh
npx skills add helipodapp/mcp -g
```

Pick your agents when asked (or pass `-a codex cursor gemini-cli opencode -y`). Without `-g` the skills go into the current project only.

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
