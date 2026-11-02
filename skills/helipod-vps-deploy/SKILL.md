---
name: helipod-vps-deploy
description: Run an application on a Helipod VPS - pick a ready app image (WordPress, n8n, EasyPanel, aaPanel, Dify, ...) or a plain OS, open the right ports, add an SSH key, point a domain at it and serve HTTPS. Use when the user wants their app on a server with root access instead of containers, or asks to host WordPress / n8n / a panel on a VPS.
---

# Deploy on a Helipod VPS

Follow the `helipod` skill rules (price first, confirm destructive actions, never print passwords). Containers are usually simpler and cheaper for one web app (`helipod-deploy`); choose a VPS when the user needs root, a panel, long-running software they manage themselves, or asks for it.

## 1. Pick the server

1. `list_vps_plans` → plans and their `osTemplates`. App plans list ready images: `wordpress-…`, `woocommerce-…`, `n8n-…`, `easypanel-…`, `aapanel-…`, `1panel-…`, `dify-…`, `lamp-…`, `cloudreve-…`, `srs-…`, AI agents (`openclaw-…`, `opencode-…`, `hermes-…`). An app image is ready to use; a plain OS (`ubuntu-24.04`, `debian-…`) is for the user's own setup.
2. Match the app's minimum RAM (WordPress 1 GB, n8n and Dify 2 GB, DeepSeek 4 GB): an image the plan cannot run is not listed.
3. `list_projects` → the project. `create_vps` with `dryRun: true` → tell the user the price and the wallet after it, and wait for a yes.
4. `create_vps` for real with an `idempotencyKey` and a strong generated password (do not print it back unless asked). Poll `get_vps` every 10 s until `running`.

## 2. Reach it

- SSH key instead of the password: ask for the user's PUBLIC key (`~/.ssh/id_ed25519.pub`), `add_vps_ssh_key`. Never ask for or accept a private key.
- `get_vps` → `providerCode` and `access`:
  - `providerCode` 2 or 3 (own public IP): ports are opened with `list_firewall_rules` / `add_firewall_rules`. App images open their own ports at create; check before adding.
  - `providerCode` 1 (shared address): the server is reached through port forwards. `list_vps_ports` shows the allowed `portRange`; `add_vps_port` with `protocol: "tcp"` for a raw port, or `protocol: "https"` (port 443) with a `domain` and the app's `internalPort` to route a domain to the app (point the domain's DNS at the server's IP first).
- Login details: `get_vps_credentials` (Linux `ssh root@<host> -p <port>`; Windows RDP).

## 3. Domain and HTTPS

1. A domain on Helipod: `list_my_domains` → `update_dns_record` with an `A` record (`@` and/or `www`) to the server's IP. Elsewhere: tell the user the exact `A` record to add at their DNS provider.
2. App images with a panel (EasyPanel, aaPanel, 1Panel) issue certificates from the panel once DNS points at the server. On a plain OS, suggest Caddy (automatic HTTPS): `apt install caddy`, then a Caddyfile `example.com { reverse_proxy localhost:3000 }`.
3. Shared-address servers (`providerCode` 1): `add_vps_port` with `protocol: "https"`, the `domain` and the app's `internalPort` serves HTTPS for it.

## 4. First login of an app image

The dashboard's VPS page has an **Application** tab with the app's URL, the ports it needs and how to get its admin login; send the user there. Typical first steps: WordPress and n8n open on `http://<ip>` (n8n on port 5678) and ask to create the admin user; EasyPanel opens on port 3000 and asks to create the admin user; aaPanel and 1Panel print their login with a command shown in that tab.

## 5. Keep it safe

- `create_snapshot` before risky changes; `run_vps_backup` / `activate_vps_backup` (paid, price first) for daily backups.
- Never remove the SSH rule (port 22) or the user's only SSH key without asking.
- Email from the app: SMTP with an email key (`helipod-email`), not a mail server on the VPS.
