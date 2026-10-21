---
name: helipod-vps
description: Create and manage Helipod VPS servers - pick a plan and OS, order, power on/off, reinstall, get SSH/RDP login, firewall rules, snapshots, renewals and upgrades, and migrate a server from another provider (or copy between VPS). Use when the user wants a virtual server with root access on Helipod, or to move a server to Helipod.
---

# Helipod VPS

Follow the `helipod` skill rules. A VPS is prepaid per period: creating one charges the wallet immediately.

## Create

1. `list_vps_plans` → present 2 or 3 fitting plans with CPU, RAM, disk and `effectiveMonthly` (IDR). Note `osTemplates`.
2. `list_projects` → the project it belongs to (required).
3. Confirm with the user: plan, OS, billing period (`monthly`, `3month`, `6month`, `yearly`) and the total price.
4. Generate a strong password (12 to 30 chars, upper, lower, digit, one of `!@#$%^*`) unless the user gives one; do not print it back unless asked.
5. `create_vps` → poll `get_vps` every 10 s until `running` (a few minutes) or `error` (`lastJobError` says why; a failed create is refunded).
6. Login: `get_vps_credentials` (Linux: `ssh root@<ip>`; Windows: RDP as Administrator, port 3389).

## Manage

- Power: `vps_power` (`start`, `stop`, `restart`). While a job runs the server is busy (`409 VPS_BUSY`): wait and retry.
- Firewall: `list_firewall_rules`, `add_firewall_rules` (e.g. `{ "Protocol": "TCP", "Port": "443", "CidrBlock": "0.0.0.0/0", "Action": "ACCEPT" }`), `remove_firewall_rules` by id. Never remove the SSH rule (port 22) without asking.
- Snapshots: `create_snapshot` before risky changes; `apply_snapshot` rolls the disk back (data after it is lost: confirm).
- Reinstall: `reinstall_vps` wipes the disk: confirm explicitly.
- Billing: `get_vps_renewal_options` → `renew_vps`; `upgrade_vps` to a larger plan (charges the difference, restarts); `toggle_vps_auto_renew`.
- Terminate: `terminate_vps` is permanent, no refund: confirm explicitly.

## Migrate a server to Helipod (free)

For a server at another provider (Zeabur, DigitalOcean, any Linux server with root):

1. The target is a running Helipod VPS with enough disk for the old server's data (create one first if needed). Whole-server restores need the same OS and version as the old server: ask which OS it runs before picking one.
2. Ask for the old server's public IP (`curl -4 ifconfig.me` there), then `create_vps_import` with `sourceIp`. Give the user the returned command to run as root on the OLD server. It works once, for 1 hour; never run it yourself. Lost or expired: `new_vps_migration_command`.
3. `get_vps_migration` every 15-30 s: `waiting` → `uploading` (progress, sent bytes; pause / resume / stop with `control_vps_migration`) → `inspecting` → `uploaded` (`sourceOs`, `sourceBytes`, `fetchedIp`).
4. Show the user `fetchedIp` and the server's hostname and ask whether that is their old server. Only then `restore_vps_import` with `confirmSource: true`. Suggest folders first (`/var/www`, `/home`, `/etc/nginx`, `/var/backups/helipod-db` for database dumps) into a new folder (`target: "folder"`); `inplace` overwrites and `mode: "full"` replaces the whole VPS: confirm explicitly.
5. The upload is kept 7 days, so the user can restore again; `delete_vps_migration` removes it sooner.

Copy between Helipod VPS: `list_vps_restore_points` on the source, then `copy_vps_backup` with `targetVpsId` (folders onto any VPS; whole server only between the same kind and OS), then follow `list_vps_migrations` on the target.

Backups (paid add-on) have dedicated tools; to read anything else use `helipod_api_get` with paths from https://docs.helipod.io/docs/vps-api
