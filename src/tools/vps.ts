// VPS API tools: plans, servers, power, reinstall, credentials, billing, upgrades, metrics, firewall, port forwarding,
// SSH keys, snapshots, backups, migrate (imports from outside servers, copies between VPS).
import { z } from "zod";
import { defineTool } from "../tool.js";

const vpsId = z.string().describe("VPS id from list_vps (not the name or hostname)");
const password = z.string().min(12).max(30).describe("12-30 characters with upper and lower case letters, a digit and one of ! @ # $ % ^ *");
const period = z.enum(["monthly", "3month", "6month", "yearly"]);
const pointId = z.string().describe("Restore point id (from list_vps_restore_points)");
const backupPath = z.string().max(1024).describe("Absolute path inside the backup, e.g. /etc/nginx or /var/www/index.html");
const migrationId = z.string().describe("Migration id (from list_vps_migrations)");

export const vpsTools = [
    defineTool({
        name: "list_vps_plans", title: "List VPS plans", kind: "read",
        description: "VPS plans with CPU, RAM, disk, OS templates and the price this account pays (effectiveMonthly, IDR).",
        input: { regionId: z.string().optional() },
        run: (a, api) => api.api("GET", "/vps/plans", { query: { regionId: a.regionId } }),
    }),
    defineTool({
        name: "list_vps", title: "List VPS", kind: "read",
        description: "Every server this key can reach (all kinds), with status, providerCode (1 = shares a public address, 2/3 = own IP) and access: the host and SSH port to connect to.",
        input: { status: z.string().optional().describe("e.g. running, stopped"), projectId: z.string().uuid().optional() },
        run: (a, api) => api.api("GET", "/vps", { query: { status: a.status, projectId: a.projectId } }),
    }),
    defineTool({
        name: "get_vps", title: "Get VPS", kind: "read",
        description: "One server: status, access (host and SSH port), providerCode, size, plan, expiry, last job. Poll it after an action until status is running, stopped, terminated or error.",
        input: { vpsId },
        run: (a, api) => api.api("GET", `/vps/${a.vpsId}`),
    }),
    defineTool({
        name: "create_vps", title: "Create VPS", kind: "write",
        description: "Order a server. COSTS MONEY right away (the whole billing period is charged from the wallet; refunded if provisioning fails). Show the plan price from list_vps_plans and get the user's explicit OK first. Provisioning takes a few minutes: poll get_vps.",
        input: {
            projectId: z.string().uuid(), planId: z.string(), name: z.string().min(3).max(50),
            osType: z.string().describe("From the plan's osTemplates, e.g. ubuntu"), osVersion: z.string().describe("e.g. 24.04"),
            rootPassword: password, billingPeriod: period.optional().describe("Default monthly"),
        },
        run: (a, api) => api.api("POST", "/vps", { body: a }),
    }),
    defineTool({
        name: "vps_power", title: "Start / stop / restart VPS", kind: "destructive",
        description: "Power action on a server. stop and restart interrupt whatever runs on it.",
        input: { vpsId, action: z.enum(["start", "stop", "restart"]) },
        run: (a, api) => api.api("POST", `/vps/${a.vpsId}/${a.action}`),
    }),
    defineTool({
        name: "reinstall_vps", title: "Reinstall VPS", kind: "destructive",
        description: "Wipe the disk and install an operating system. ALL DATA ON THE SERVER IS LOST.",
        input: { vpsId, osType: z.string(), osVersion: z.string(), rootPassword: password },
        run: (a, api) => api.api("POST", `/vps/${a.vpsId}/reinstall`, { body: { osType: a.osType, osVersion: a.osVersion, rootPassword: a.rootPassword } }),
    }),
    defineTool({
        name: "reset_vps_password", title: "Reset VPS password", kind: "write",
        description: "Set a new root (or Administrator) password. Stored only when the reset succeeds.",
        input: { vpsId, rootPassword: password },
        run: (a, api) => api.api("POST", `/vps/${a.vpsId}/reset-password`, { body: { rootPassword: a.rootPassword } }),
    }),
    defineTool({
        name: "get_vps_credentials", title: "Get VPS login", kind: "read",
        description: "Login details: host, user (root, or Administrator on Windows), port, protocol (ssh or rdp) and password. The response contains the root password. Only servers with providerCode 2 keep it (others: 409 FEATURE_NOT_AVAILABLE; the password is the one set at create or reset).",
        input: { vpsId },
        run: (a, api) => api.api("GET", `/vps/${a.vpsId}/credentials`),
    }),
    defineTool({
        name: "terminate_vps", title: "Terminate VPS", kind: "destructive",
        description: "Delete a server permanently. ALL DATA IS LOST and there is no refund for the remaining period.",
        input: { vpsId },
        run: (a, api) => api.api("DELETE", `/vps/${a.vpsId}`),
    }),
    defineTool({
        name: "get_vps_renewal_options", title: "VPS renewal options", kind: "read",
        description: "Prices to renew a server for each billing period.",
        input: { vpsId },
        run: (a, api) => api.api("GET", `/vps/${a.vpsId}/renewal-options`),
    }),
    defineTool({
        name: "renew_vps", title: "Renew VPS", kind: "write",
        description: "Extend a server's paid period. COSTS MONEY: show the price from get_vps_renewal_options and get the user's OK.",
        input: { vpsId, billingPeriod: period },
        run: (a, api) => api.api("POST", `/vps/${a.vpsId}/renew`, { body: { billingPeriod: a.billingPeriod } }),
    }),
    defineTool({
        name: "upgrade_vps", title: "Upgrade VPS plan", kind: "write",
        description: "Move a server to a larger plan in the same family and region. COSTS MONEY (the difference for the days left) and restarts the server. planId must be one listed by get_vps_upgrade_options, which also gives the price in IDR; the server restarts during the upgrade. Servers with providerCode 2 only.",
        input: { vpsId, planId: z.string() },
        run: (a, api) => api.api("POST", `/vps/${a.vpsId}/upgrade`, { body: { planId: a.planId } }),
    }),
    defineTool({
        name: "get_vps_upgrade_options", title: "VPS upgrade options", kind: "read",
        description: "Plans this server can move to (same family and region) with the price to pay now for the days left (IDR). upgrade_vps accepts only a planId from this list. Servers with providerCode 2 only.",
        input: { vpsId },
        run: (a, api) => api.api("GET", `/vps/${a.vpsId}/upgrade-options`),
    }),
    defineTool({
        name: "rename_vps", title: "Rename VPS", kind: "write", idempotent: true,
        description: "Change a server's display name (3-50 characters). Nothing on the server changes.",
        input: { vpsId, name: z.string().min(3).max(50) },
        run: (a, api) => api.api("PATCH", `/vps/${a.vpsId}`, { body: { name: a.name } }),
    }),
    defineTool({
        name: "get_vps_metrics", title: "VPS metrics", kind: "read",
        description: "CPU, memory, disk and network use of a server. range (1h default, 6h, 24h, 7d, 30d) applies to servers with history; others return their latest reading.",
        input: { vpsId, range: z.enum(["1h", "6h", "24h", "7d", "30d"]).optional() },
        run: (a, api) => api.api("GET", `/vps/${a.vpsId}/metrics`, { query: { range: a.range } }),
    }),
    defineTool({
        name: "toggle_vps_auto_renew", title: "Toggle VPS auto-renew", kind: "write",
        description: "Flip auto-renew on or off; the response gives the new value.",
        input: { vpsId },
        run: (a, api) => api.api("POST", `/vps/${a.vpsId}/auto-renew-toggle`),
    }),
    defineTool({
        name: "list_firewall_rules", title: "List firewall rules", kind: "read",
        description: "Inbound firewall rules of a server. Servers with their own IP only (providerCode 2 or 3); shared-address servers use port forwards.",
        input: { vpsId },
        run: (a, api) => api.api("GET", `/vps/${a.vpsId}/firewall`),
    }),
    defineTool({
        name: "add_firewall_rules", title: "Add firewall rules", kind: "write",
        description: "Add inbound rules. Port: a number, a range a-b, a comma list, or ALL.",
        input: {
            vpsId,
            rules: z.array(z.object({
                Protocol: z.enum(["TCP", "UDP", "ICMP", "ALL"]), Port: z.string(), CidrBlock: z.string().describe("e.g. 0.0.0.0/0"),
                Action: z.enum(["ACCEPT", "DROP"]), FirewallRuleDescription: z.string().optional(),
            })).min(1).max(50),
        },
        run: (a, api) => api.api("POST", `/vps/${a.vpsId}/firewall`, { body: { rules: a.rules } }),
    }),
    defineTool({
        name: "remove_firewall_rules", title: "Remove firewall rules", kind: "destructive",
        description: "Remove rules by id (from list_firewall_rules). All must match or nothing is removed.",
        input: { vpsId, ids: z.array(z.string()).min(1).max(100) },
        run: (a, api) => api.api("DELETE", `/vps/${a.vpsId}/firewall`, { body: { ids: a.ids } }),
    }),
    defineTool({
        name: "list_vps_ports", title: "List port forwards", kind: "read",
        description: "Port forwards of a server (servers on a shared IP): the public port range it may use and each forward (protocol, public port, internal port, domain for http/https routes). Not available on every server type.",
        input: { vpsId },
        run: (a, api) => api.api("GET", `/vps/${a.vpsId}/ports`),
    }),
    defineTool({
        name: "add_vps_port", title: "Add port forward", kind: "write",
        description: "Forward a public port to the server: protocol tcp/udp/both uses a port inside the server's portRange (from list_vps_ports); protocol http/https routes a domain on port 80/443 to internalPort (point the domain's DNS at the server's IP first). The server must be running.",
        input: {
            vpsId,
            port: z.number().int().min(1).max(65535).describe("Public port (tcp/udp: inside portRange; http=80, https=443)"),
            protocol: z.enum(["tcp", "udp", "both", "http", "https"]).optional().describe("Default tcp"),
            internalPort: z.number().int().min(1).max(65535).optional().describe("Port on the server (default: same as port)"),
            domain: z.string().min(1).max(253).optional().describe("http/https only: the domain to route, e.g. app.example.com"),
            description: z.string().max(200).optional(),
        },
        run: ({ vpsId: id, ...body }, api) => api.api("POST", `/vps/${id}/ports`, { body }),
    }),
    defineTool({
        name: "remove_vps_port", title: "Remove port forward", kind: "destructive",
        description: "Remove a port forward (id from list_vps_ports). Whatever reaches the server through it stops working.",
        input: { vpsId, allocationId: z.string().uuid().describe("Port forward id from list_vps_ports") },
        run: (a, api) => api.api("DELETE", `/vps/${a.vpsId}/ports/${a.allocationId}`),
    }),
    defineTool({
        name: "list_vps_ssh_keys", title: "List SSH keys", kind: "read",
        description: "SSH public keys allowed to log in as root, by fingerprint (SHA256:…), with type and comment. Not available on every server type.",
        input: { vpsId },
        run: (a, api) => api.api("GET", `/vps/${a.vpsId}/ssh-keys`),
    }),
    defineTool({
        name: "add_vps_ssh_key", title: "Add SSH key", kind: "write",
        description: "Allow an SSH PUBLIC key (e.g. the contents of ~/.ssh/id_ed25519.pub) to log in as root; at most 10 per server. Never send a private key: it is refused. The server must be running.",
        input: { vpsId, publicKey: z.string().min(10).max(8192).describe('One line like "ssh-ed25519 AAAA… user@host"') },
        run: (a, api) => api.api("POST", `/vps/${a.vpsId}/ssh-keys`, { body: { publicKey: a.publicKey } }),
    }),
    defineTool({
        name: "remove_vps_ssh_key", title: "Remove SSH key", kind: "destructive",
        description: "Remove an SSH key by fingerprint (from list_vps_ssh_keys). Whoever logs in with it loses access (another key or the root password still works).",
        input: { vpsId, fingerprint: z.string().min(8).max(100).describe("e.g. SHA256:abc…+/= as listed") },
        // The fingerprint is base64 ('/' and '+'): sent in base64url form, which the API accepts, so the path stays one segment.
        run: (a, api) => api.api("DELETE", `/vps/${a.vpsId}/ssh-keys/${a.fingerprint.trim().replace(/^SHA256:/, "").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`),
    }),
    defineTool({
        name: "set_vps_ssh", title: "Turn SSH on / off", kind: "write", idempotent: true,
        description: "Turn SSH access to the server on or off (no change when it is already in that state). Turning it off locks out every SSH session and key. The server must be running.",
        input: { vpsId, enabled: z.boolean() },
        run: (a, api) => api.api("POST", `/vps/${a.vpsId}/ssh`, { body: { enabled: a.enabled } }),
    }),
    defineTool({
        name: "list_snapshots", title: "List snapshots", kind: "read",
        description: "Disk snapshots of a server. Servers with their own IP only (providerCode 2 or 3).",
        input: { vpsId },
        run: (a, api) => api.api("GET", `/vps/${a.vpsId}/snapshots`),
    }),
    defineTool({
        name: "create_snapshot", title: "Create snapshot", kind: "write",
        description: "Take a snapshot of the server's disk (free; the plan limits how many you keep).",
        input: { vpsId, name: z.string().max(60).optional() },
        run: (a, api) => api.api("POST", `/vps/${a.vpsId}/snapshots`, { body: { name: a.name } }),
    }),
    defineTool({
        name: "apply_snapshot", title: "Roll back to snapshot", kind: "destructive",
        description: "Roll the server's disk back to a snapshot. Everything written since is lost.",
        input: { vpsId, snapshotId: z.string() },
        run: (a, api) => api.api("POST", `/vps/${a.vpsId}/snapshots/${a.snapshotId}/apply`),
    }),
    defineTool({
        name: "delete_snapshot", title: "Delete snapshot", kind: "destructive",
        description: "Delete a snapshot permanently (it can no longer be rolled back to).",
        input: { snapshotId: z.string() },
        run: (a, api) => api.api("DELETE", `/vps/snapshots/${a.snapshotId}`),
    }),
    defineTool({
        name: "list_backup_plans", title: "List VPS backup plans", kind: "read",
        description: "Daily VPS backup plans: storage quota, priceMonthly and priceYearly (IDR), how many daily/weekly/monthly restore points are kept. Use it for the price before activate_vps_backup.",
        input: {},
        run: (_a, api) => api.api("GET", "/backup/plans"),
    }),
    defineTool({
        name: "get_vps_backup", title: "Get VPS backup status", kind: "read",
        description: "Backup of one server: plan, period and price, auto-renew, storage used vs quota, last backup, next run, manual runs left today, the job running now. null when backups are off; eligible/reason say whether this server can have them (Linux only).",
        input: { vpsId },
        run: (a, api) => api.api("GET", `/vps/${a.vpsId}/backup`),
    }),
    defineTool({
        name: "activate_vps_backup", title: "Turn on VPS backups", kind: "write",
        description: "Turn on daily backups for a running Linux server. COSTS MONEY right away: the whole period (1 or 12 months) is charged from the wallet and there is no dry run. Prices (priceMonthly / priceYearly, IDR) are in list_backup_plans. The server must be running.",
        input: {
            vpsId, planCode: z.string().max(30).describe("Plan code from list_backup_plans"),
            months: z.union([z.literal(1), z.literal(12)]).describe("1 = monthly, 12 = yearly"),
            scheduleHour: z.number().int().min(0).max(23).optional().describe("Hour of the daily backup, 0-23 WIB (UTC+7)"),
            alignWithVps: z.boolean().optional().describe("Monthly only: make the first period end with the server's own expiry (prorated price)"),
        },
        run: ({ vpsId: id, ...body }, api) => api.api("POST", `/vps/${id}/backup`, { body }),
    }),
    defineTool({
        name: "update_vps_backup", title: "Change VPS backup plan / schedule", kind: "write",
        description: "Change the backup plan, the daily hour or auto-renew. A larger plan COSTS MONEY now (the difference for the days left, charged from the wallet): show the new plan's price from list_backup_plans and get the user's OK. A smaller plan starts at the next renewal.",
        input: {
            vpsId, planCode: z.string().max(30).optional(),
            scheduleHour: z.number().int().min(0).max(23).optional().describe("0-23 WIB (UTC+7)"),
            autoRenew: z.boolean().optional(),
        },
        run: ({ vpsId: id, ...body }, api) => api.api("PATCH", `/vps/${id}/backup`, { body }),
    }),
    defineTool({
        name: "cancel_vps_backup", title: "Cancel VPS backups", kind: "destructive",
        description: "Stop renewing the server's backups. Backups keep running until the paid period ends; after that and a grace period the backups are DELETED and can no longer be restored. (update_vps_backup autoRenew=true undoes it before the end.)",
        input: { vpsId },
        run: (a, api) => api.api("DELETE", `/vps/${a.vpsId}/backup`),
    }),
    defineTool({
        name: "run_vps_backup", title: "Back up VPS now", kind: "write",
        description: "Start a backup now, in addition to the daily one (limited per day: see manualRunsLeft in get_vps_backup). Runs in the background: follow it with list_vps_backup_runs.",
        input: { vpsId },
        run: (a, api) => api.api("POST", `/vps/${a.vpsId}/backup/run`),
    }),
    defineTool({
        name: "list_vps_backup_runs", title: "List VPS backup runs", kind: "read",
        description: "Recent backup, restore and download jobs of a server with status, timing and errors.",
        input: { vpsId },
        run: (a, api) => api.api("GET", `/vps/${a.vpsId}/backup/runs`),
    }),
    defineTool({
        name: "list_vps_restore_points", title: "List VPS restore points", kind: "read",
        description: "Restore points (backups kept) of a server: id, time taken, kind (daily/weekly/monthly/manual), size added, file count.",
        input: { vpsId },
        run: (a, api) => api.api("GET", `/vps/${a.vpsId}/backup/points`),
    }),
    defineTool({
        name: "browse_vps_backup_files", title: "Browse files in a backup", kind: "read",
        description: "List the files and folders at a path inside a restore point (names, types, sizes, dates; not file contents). Use it to pick paths for restore_vps_backup or prepare_vps_backup_download.",
        input: { vpsId, pointId, path: backupPath.optional().describe("Folder to list, default /") },
        run: (a, api) => api.api("GET", `/vps/${a.vpsId}/backup/points/${a.pointId}/files`, { query: { path: a.path } }),
    }),
    defineTool({
        name: "restore_vps_backup", title: "Restore VPS from backup", kind: "destructive",
        description: "Restore from a restore point. mode=full puts the WHOLE disk back to that moment: everything written since is LOST and the server is offline while it restores. mode=files restores 1-50 paths: target=folder (default) puts them in a separate folder on the server, target=inplace OVERWRITES the current files. Files at those paths are overwritten. Runs in the background: follow it with list_vps_backup_runs.",
        input: {
            vpsId, pointId, mode: z.enum(["files", "full"]),
            paths: z.array(backupPath).min(1).max(50).optional().describe("mode=files: files or folders to restore"),
            target: z.enum(["folder", "inplace"]).optional().describe("mode=files: folder (default, safe) or inplace (overwrite)"),
        },
        run: (a, api) => api.api("POST", `/vps/${a.vpsId}/backup/points/${a.pointId}/restore`, { body: { mode: a.mode, paths: a.paths, target: a.target } }),
    }),
    defineTool({
        name: "prepare_vps_backup_download", title: "Prepare backup download", kind: "write",
        description: "Pack up to 20 files or folders from a restore point into a download (a few per day). Returns a download id and status; poll get_vps_backup_download until status is ready, then give the user the link. Never fetch or print the file contents.",
        input: { vpsId, pointId, paths: z.array(backupPath).min(1).max(20) },
        run: (a, api) => api.api("POST", `/vps/${a.vpsId}/backup/points/${a.pointId}/download`, { body: { paths: a.paths } }),
    }),
    defineTool({
        name: "get_vps_backup_download", title: "Get backup download link", kind: "read",
        description: "Status of a prepared backup download; when ready, a short-lived url for the user to open (it expires at expiresAt). The link is for the user to download in a browser.",
        input: { vpsId, downloadId: z.string() },
        run: (a, api) => api.api("GET", `/vps/${a.vpsId}/backup/downloads/${a.downloadId}`),
    }),

    // ── Migrate: bring a server from outside Helipod onto a VPS, or copy a restore point onto another VPS (free) ──
    defineTool({
        name: "list_vps_migrations", title: "List VPS migrations", kind: "read",
        description: "Migrations onto this VPS, newest first: imports from servers outside Helipod (kind=import) and copies from another VPS's restore point (kind=copy). Each has status (waiting, uploading, inspecting, uploaded, awaiting_command, restoring, restored, failed, expired, cancelled), the uploaded server's OS and size, who ran the command (fetchedIp), progress and pause state of a running job, and the result.",
        input: { vpsId },
        run: (a, api) => api.api("GET", `/vps/${a.vpsId}/migrations`),
    }),
    defineTool({
        name: "get_vps_migration", title: "Get a VPS migration", kind: "read",
        description: "One migration onto this VPS (see list_vps_migrations). While an upload or restore runs, result.progress has percent (of data read), bytesDone/bytesTotal, sentBytes and sendRate; result.stored the bytes confirmed in storage; result.control the pause state (want vs the job's reported state). Poll it every 15-30 s while it runs.",
        input: { vpsId, migrationId },
        run: (a, api) => api.api("GET", `/vps/${a.vpsId}/migrations/${a.migrationId}`),
    }),
    defineTool({
        name: "create_vps_import", title: "Start a server import (Migrate to Helipod)", kind: "write",
        description: "Start moving a server from OUTSIDE Helipod (any Linux server with root) onto this running VPS. Free; one import per VPS, at most 3 per account, kept 7 days, the upload is capped at this VPS's disk. Returns a one-time command (curl ... | sudo bash) that works ONCE and expires in 1 hour: give it to the user to run as root on the OLD server; never run it yourself and do not store it. Pass sourceIp (the old server's public IP, e.g. from curl -4 ifconfig.me there) so the command only works from that server; recommended. Then follow it with get_vps_migration: waiting → uploading → inspecting → uploaded.",
        input: { vpsId, sourceIp: z.string().max(64).optional().describe("The old server's public IP: the command then only works from it (recommended)") },
        run: ({ vpsId: id, sourceIp }, api) => api.api("POST", `/vps/${id}/migrations/import`, { body: { sourceIp: sourceIp ?? null } }),
    }),
    defineTool({
        name: "new_vps_migration_command", title: "Get a new migration command", kind: "write",
        description: "A fresh one-time command for an import (status waiting, uploading or failed before an upload finished) or for a restore that waits for its command (awaiting_command). The previous command stops working, and a job still running with it is told to stop. Shown once: give it to the user to run as root on the right server.",
        input: { vpsId, migrationId },
        run: (a, api) => api.api("POST", `/vps/${a.vpsId}/migrations/${a.migrationId}/command`),
    }),
    defineTool({
        name: "restore_vps_import", title: "Restore an import onto the VPS", kind: "destructive",
        description: "Restore an uploaded import (status uploaded, restored, or failed after an upload) onto its VPS. mode=files restores 1-50 paths (e.g. /home, /var/www, /etc/nginx, /var/backups/helipod-db for database dumps): target=folder (default) into /root/restore-<date>, target=inplace OVERWRITES files at the same paths. mode=full turns the whole VPS into a copy of the old server: EVERYTHING on the VPS is replaced, only allowed when the VPS runs the same OS as the upload (sourceOs) and is of the full-VM kind. The first restore needs confirmSource=true: before setting it, show the user fetchedIp (and the uploaded server's hostname) from get_vps_migration and ask whether that is their old server; if not, delete the import instead. Runs in the background: follow it with get_vps_migration.",
        input: {
            vpsId, migrationId, mode: z.enum(["files", "full"]),
            paths: z.array(backupPath).min(1).max(50).optional().describe("mode=files: files or folders to restore"),
            target: z.enum(["folder", "inplace"]).optional().describe("mode=files: folder (default, safe) or inplace (overwrite)"),
            confirmSource: z.boolean().optional().describe("true only after the user confirmed fetchedIp is their old server (needed once)"),
        },
        run: (a, api) => api.api("POST", `/vps/${a.vpsId}/migrations/${a.migrationId}/restore`, { body: { mode: a.mode, paths: a.paths, target: a.target, confirmSource: a.confirmSource } }),
    }),
    defineTool({
        name: "control_vps_migration", title: "Pause, resume or stop a migration job", kind: "write",
        description: "Pause, resume or stop an upload or restore that runs from a one-time command on a server (it must have checked in: result.control is set). The job follows within about 5 seconds; result.control.state shows when it did. Stop is final: the job ends as failed (stopped); a new command (new_vps_migration_command) starts the upload again and reuses what was already uploaded where possible. The user can do the same on that server with sudo helipod-migrate pause | resume | stop.",
        input: { vpsId, migrationId, action: z.enum(["pause", "resume", "stop"]) },
        run: (a, api) => api.api("POST", `/vps/${a.vpsId}/migrations/${a.migrationId}/control`, { body: { action: a.action } }),
    }),
    defineTool({
        name: "delete_vps_migration", title: "Delete a VPS migration", kind: "destructive",
        description: "Delete a migration; an import's uploaded files are deleted from storage and cannot be restored any more. A running upload is told to stop. Not while a restore or the upload check runs.",
        input: { vpsId, migrationId },
        run: (a, api) => api.api("DELETE", `/vps/${a.vpsId}/migrations/${a.migrationId}`),
    }),
    defineTool({
        name: "copy_vps_backup", title: "Copy a restore point to another VPS", kind: "destructive",
        description: "Copy a restore point of one VPS (vpsId, pointId from list_vps_restore_points) onto ANOTHER VPS of the same account (targetVpsId; to bring the same VPS back use restore_vps_backup). Free. mode=files copies 1-50 paths onto any running VPS: target=folder (default) into /root/restore-<date>, target=inplace OVERWRITES files at the same paths. mode=full turns the target into a full copy: everything on it is replaced; only between two VPS of the same kind running the same OS and version. Runs in the background: follow it with list_vps_migrations on the TARGET VPS. If the result has a command, the target's management agent was unreachable: give the user that one-time command to run as root on the target.",
        input: {
            vpsId, pointId, targetVpsId: z.string().describe("The VPS to copy onto (id from list_vps), not vpsId"),
            mode: z.enum(["files", "full"]),
            paths: z.array(backupPath).min(1).max(50).optional().describe("mode=files: files or folders to copy"),
            target: z.enum(["folder", "inplace"]).optional().describe("mode=files: folder (default, safe) or inplace (overwrite)"),
        },
        run: (a, api) => api.api("POST", `/vps/${a.vpsId}/backup/points/${a.pointId}/copy`, { body: { targetVpsId: a.targetVpsId, mode: a.mode, paths: a.paths, target: a.target } }),
    }),
];
