// VPS API tools: plans, servers, power, reinstall, credentials, billing, firewall, snapshots.
import { z } from "zod";
import { defineTool } from "../tool.js";

const vpsId = z.string().describe("VPS id");
const password = z.string().min(12).max(30).describe("12-30 characters with upper and lower case letters, a digit and one of ! @ # $ % ^ *");
const period = z.enum(["monthly", "3month", "6month", "yearly"]);

export const vpsTools = [
    defineTool({
        name: "list_vps_plans", title: "List VPS plans", kind: "read",
        description: "VPS plans with CPU, RAM, disk, OS templates and the price this account pays (effectiveMonthly, IDR).",
        input: { regionId: z.string().optional() },
        run: (a, api) => api.api("GET", "/vps/plans", { query: { regionId: a.regionId } }),
    }),
    defineTool({
        name: "list_vps", title: "List VPS", kind: "read",
        description: "Servers this key can reach, with status and public IP.",
        input: { status: z.string().optional().describe("e.g. running, stopped"), projectId: z.string().uuid().optional() },
        run: (a, api) => api.api("GET", "/vps", { query: { status: a.status, projectId: a.projectId } }),
    }),
    defineTool({
        name: "get_vps", title: "Get VPS", kind: "read",
        description: "One server: status, IP, size, plan, expiry, last job. Poll it after an action until status is running, stopped, terminated or error.",
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
        description: "Power action on a server. stop and restart interrupt whatever runs on it: confirm with the user.",
        input: { vpsId, action: z.enum(["start", "stop", "restart"]) },
        run: (a, api) => api.api("POST", `/vps/${a.vpsId}/${a.action}`),
    }),
    defineTool({
        name: "reinstall_vps", title: "Reinstall VPS", kind: "destructive",
        description: "Wipe the disk and install an operating system. ALL DATA ON THE SERVER IS LOST. Get explicit confirmation.",
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
        description: "Login details: host, user (root, or Administrator on Windows), port, protocol (ssh or rdp) and password. Treat the password as a secret: don't echo it unless the user asks.",
        input: { vpsId },
        run: (a, api) => api.api("GET", `/vps/${a.vpsId}/credentials`),
    }),
    defineTool({
        name: "terminate_vps", title: "Terminate VPS", kind: "destructive",
        description: "Delete a server permanently. ALL DATA IS LOST and there is no refund for the remaining period. Get explicit confirmation.",
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
        description: "Move a server to a larger plan in the same family and region. COSTS MONEY (the difference for the days left) and restarts the server. Confirm with the user.",
        input: { vpsId, planId: z.string() },
        run: (a, api) => api.api("POST", `/vps/${a.vpsId}/upgrade`, { body: { planId: a.planId } }),
    }),
    defineTool({
        name: "toggle_vps_auto_renew", title: "Toggle VPS auto-renew", kind: "write",
        description: "Flip auto-renew on or off; the response gives the new value.",
        input: { vpsId },
        run: (a, api) => api.api("POST", `/vps/${a.vpsId}/auto-renew-toggle`),
    }),
    defineTool({
        name: "list_firewall_rules", title: "List firewall rules", kind: "read",
        description: "Inbound firewall rules of a server.",
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
        name: "list_snapshots", title: "List snapshots", kind: "read",
        description: "Disk snapshots of a server.",
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
        description: "Roll the server's disk back to a snapshot. Everything written since is lost. Get explicit confirmation.",
        input: { vpsId, snapshotId: z.string() },
        run: (a, api) => api.api("POST", `/vps/${a.vpsId}/snapshots/${a.snapshotId}/apply`),
    }),
    defineTool({
        name: "delete_snapshot", title: "Delete snapshot", kind: "destructive",
        description: "Delete a snapshot permanently (it can no longer be rolled back to).",
        input: { snapshotId: z.string() },
        run: (a, api) => api.api("DELETE", `/vps/snapshots/${a.snapshotId}`),
    }),
];
