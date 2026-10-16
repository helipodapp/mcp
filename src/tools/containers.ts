// Container API tools: projects, environments, shared variables, services, deploys, variables, domains, scale, volumes,
// function code, secret files, logs, templates.
import { z } from "zod";
import { defineTool } from "../tool.js";

const id = (what: string) => z.string().uuid().describe(`${what} id (UUID)`);
const dryRun = z.boolean().optional().describe("true: return the daily cost (IDR) only, change nothing");
const idem = z.string().min(8).max(128).optional().describe("Idempotency-Key: a retry with the same value returns the first result instead of doing it twice");
const C = "/containers";

const port = z.object({
    port: z.number().int().min(1).max(65535),
    protocol: z.enum(["http", "tcp"]).optional().describe("http (default) or tcp"),
    public: z.boolean().optional().describe("http ports: give it a *.helipod.app domain (default true)"),
});

export const containerTools = [
    defineTool({
        name: "list_projects", title: "List projects", kind: "read",
        description: "Projects this API key can reach, each with its environments (production, staging, ...). Start here to find an environmentId.",
        input: {},
        run: (_a, api) => api.api("GET", `${C}/projects`),
    }),
    defineTool({
        name: "get_project", title: "Get project", kind: "read",
        description: "One project with its environments (ids and names). Use it to find an environmentId when you already know the project.",
        input: { projectId: id("Project") },
        run: (a, api) => api.api("GET", `${C}/projects/${a.projectId}`),
    }),
    defineTool({
        name: "create_project", title: "Create project", kind: "write",
        description: "Create a project (free) with its default production environment. Needs a whole-account key (a key limited to one project gets 403). Pass an idempotencyKey when retrying.",
        input: { name: z.string().min(3).max(100), description: z.string().max(500).optional(), idempotencyKey: idem },
        run: (a, api) => api.api("POST", `${C}/projects`, { body: { name: a.name, description: a.description }, idempotencyKey: a.idempotencyKey }),
    }),
    defineTool({
        name: "update_project", title: "Rename project", kind: "write", idempotent: true,
        description: "Change a project's name and/or description.",
        input: { projectId: id("Project"), name: z.string().min(3).max(100).optional(), description: z.string().max(500).optional() },
        run: (a, api) => api.api("PATCH", `${C}/projects/${a.projectId}`, { body: { name: a.name, description: a.description } }),
    }),
    defineTool({
        name: "delete_project", title: "Delete project", kind: "destructive",
        description: "Delete an EMPTY project and its environments and shared variables. Irreversible. Refused (409 PROJECT_NOT_EMPTY) while it still has services, databases, VPS or other resources: those must be deleted first. Needs a whole-account key. Only after the user confirms; confirm must be the project's exact name.",
        input: { projectId: id("Project"), confirm: z.string().max(255).describe("The project name, exactly") },
        run: (a, api) => api.api("DELETE", `${C}/projects/${a.projectId}`, { body: { confirm: a.confirm } }),
    }),
    defineTool({
        name: "create_environment", title: "Create environment", kind: "write",
        description: "Add an environment (e.g. staging) to a project. Free; services in it are billed as usual once deployed.",
        input: { projectId: id("Project"), name: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9 _.-]{0,49}$/).describe("1-50 characters: letters, digits, space _ . -") },
        run: (a, api) => api.api("POST", `${C}/projects/${a.projectId}/environments`, { body: { name: a.name } }),
    }),
    defineTool({
        name: "rename_environment", title: "Rename environment", kind: "write", idempotent: true,
        description: "Rename an environment (names are unique within the project).",
        input: { environmentId: id("Environment"), name: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9 _.-]{0,49}$/) },
        run: (a, api) => api.api("PATCH", `${C}/environments/${a.environmentId}`, { body: { name: a.name } }),
    }),
    defineTool({
        name: "delete_environment", title: "Delete environment", kind: "destructive",
        description: "Delete an EMPTY environment (409 ENVIRONMENT_NOT_EMPTY while it has services: delete them first). Irreversible. Only after the user confirms; confirm must be the environment's exact name.",
        input: { environmentId: id("Environment"), confirm: z.string().max(255).describe("The environment name, exactly") },
        run: (a, api) => api.api("DELETE", `${C}/environments/${a.environmentId}`, { body: { confirm: a.confirm } }),
    }),
    defineTool({
        name: "list_project_variables", title: "List shared project variables", kind: "read",
        description: "Variables shared by every service of a project (referenced as ${{shared.KEY}}). Secret values are never returned (value is null).",
        input: { projectId: id("Project") },
        run: (a, api) => api.api("GET", `${C}/projects/${a.projectId}/variables`),
    }),
    defineTool({
        name: "set_project_variables", title: "Set shared project variables", kind: "write", idempotent: true,
        description: "Create or update shared project variables (other keys are kept). Mark credentials as secrets (once secret, always secret). Services pick them up on their next deploy.",
        input: {
            projectId: id("Project"),
            variables: z.record(z.string().max(255), z.string()).describe("KEY: value pairs"),
            secrets: z.array(z.string().max(255)).max(100).optional().describe("Keys to store as secrets (write-only)"),
        },
        run: (a, api) => api.api("PUT", `${C}/projects/${a.projectId}/variables`, { body: { variables: a.variables, secrets: a.secrets } }),
    }),
    defineTool({
        name: "delete_project_variable", title: "Delete shared project variable", kind: "destructive",
        description: "Remove one shared project variable. Services that reference it lose it on their next deploy: check with the user.",
        input: { projectId: id("Project"), key: z.string().max(255) },
        run: (a, api) => api.api("DELETE", `${C}/projects/${a.projectId}/variables/${encodeURIComponent(a.key)}`),
    }),
    defineTool({
        name: "list_services", title: "List services", kind: "read",
        description: "Services (containers) in an environment: status, source, resources, domains, latest deployment and daily cost.",
        input: { environmentId: id("Environment") },
        run: (a, api) => api.api("GET", `${C}/environments/${a.environmentId}/services`),
    }),
    defineTool({
        name: "get_service", title: "Get service", kind: "read",
        description: "One service with its source, settings, resources, domains, latest deployment and daily cost.",
        input: { serviceId: id("Service") },
        run: (a, api) => api.api("GET", `${C}/services/${a.serviceId}`),
    }),
    defineTool({
        name: "create_service", title: "Create service", kind: "write",
        description: "Create a service from a container image, a public Git repository or an inline Dockerfile, and (unless deploy=false) start its first deploy. COSTS MONEY once deployed (billed daily from the wallet): call with dryRun=true first, show the dailyCost to the user and get their OK.",
        input: {
            environmentId: id("Environment"),
            name: z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,39}$/).describe("Service name (letters, digits, _ -; starts with a letter). Also used in references like ${{name.KEY}}"),
            image: z.string().optional().describe("Container image, e.g. nginx:alpine or ghcr.io/acme/app:1.2"),
            registryUsername: z.string().optional().describe("Private registry user (with registryPassword)"),
            registryPassword: z.string().optional().describe("Private registry password or token"),
            repo: z.string().optional().describe("Public HTTPS Git repository URL (instead of image)"),
            branch: z.string().optional().describe("Git branch (default main)"),
            rootDirectory: z.string().optional().describe("Monorepo: folder to build, e.g. apps/web"),
            dockerfile: z.string().optional().describe("Inline Dockerfile content (instead of image/repo)"),
            ports: z.array(port).max(5).optional().describe("Ports to expose; each public http port gets an HTTPS *.helipod.app domain"),
            variables: z.record(z.string(), z.string()).optional().describe("Environment variables. Values may reference ${{Postgres.DATABASE_URL}}, ${{secret(32)}}, ${{uuid}}"),
            volumes: z.array(z.object({ mountPath: z.string(), sizeGb: z.number().int().min(1).max(50) })).max(3).optional(),
            cpu: z.number().int().min(125).max(4000).optional().describe("Millicores, multiple of 125"),
            ram: z.number().int().min(128).max(8192).optional().describe("MB, multiple of 128"),
            startCommand: z.string().optional(),
            healthcheckPath: z.string().optional().describe("HTTP path answering 2xx when ready, e.g. /health"),
            deploy: z.boolean().optional().describe("false: create without deploying (nothing is charged)"),
            dryRun, idempotencyKey: idem,
        },
        run: (a, api) => {
            const kinds = [a.image, a.repo, a.dockerfile].filter(Boolean).length;
            if (kinds !== 1) throw new Error("Give exactly one source: image, repo or dockerfile.");
            const source = a.image ? { image: a.image, ...(a.registryUsername ? { registryUsername: a.registryUsername, registryPassword: a.registryPassword } : {}) }
                : a.repo ? { repo: a.repo, ...(a.branch ? { branch: a.branch } : {}), ...(a.rootDirectory ? { rootDirectory: a.rootDirectory } : {}) }
                : { dockerfile: a.dockerfile };
            return api.api("POST", `${C}/environments/${a.environmentId}/services`, {
                query: { dryRun: a.dryRun ? "true" : undefined }, idempotencyKey: a.idempotencyKey,
                body: {
                    name: a.name, source, ports: a.ports, variables: a.variables, volumes: a.volumes, cpu: a.cpu, ram: a.ram,
                    startCommand: a.startCommand, healthcheck: a.healthcheckPath ? { path: a.healthcheckPath } : undefined, deploy: a.deploy,
                },
            });
        },
    }),
    defineTool({
        name: "update_service", title: "Update / rename service", kind: "write", idempotent: true,
        description: "Rename a service or change its start command, root directory, health check or startup dependencies. Settings apply on the next deploy (needsRedeploy). Renaming breaks references like ${{oldName.KEY}} in other services' variables: show the user the returned warnings and fix those variables (set_variables / set_project_variables) before redeploying.",
        input: {
            serviceId: id("Service"),
            name: z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,39}$/).optional().describe("New service name (letters, digits, _ -; starts with a letter; unique in the environment)"),
            startCommand: z.string().max(1000).nullable().optional().describe("null removes the override"),
            rootDirectory: z.string().max(255).nullable().optional(),
            healthcheckPath: z.string().max(255).nullable().optional().describe("null removes the health check"),
            healthcheckTimeout: z.number().int().min(1).max(3600).optional(),
            dependsOn: z.array(z.string().uuid()).max(20).optional().describe("Service ids (same environment) to wait for at startup"),
        },
        run: (a, api) => api.api("PATCH", `${C}/services/${a.serviceId}`, {
            body: {
                name: a.name, startCommand: a.startCommand, rootDirectory: a.rootDirectory, dependsOn: a.dependsOn,
                healthcheck: a.healthcheckPath === null ? null : a.healthcheckPath ? { path: a.healthcheckPath, timeout: a.healthcheckTimeout } : undefined,
            },
        }),
    }),
    defineTool({
        name: "delete_service", title: "Delete service", kind: "destructive",
        description: "Stop and delete a service with its domains and volumes. Volume data is lost. Confirm with the user first.",
        input: { serviceId: id("Service") },
        run: (a, api) => api.api("DELETE", `${C}/services/${a.serviceId}`),
    }),
    defineTool({
        name: "deploy_service", title: "Deploy service", kind: "write",
        description: "Start a new deployment (Git services build the latest commit). COSTS MONEY: charges today's cost when the build starts, refunded if it fails. dryRun=true returns the cost only. Then poll get_deployment.",
        input: { serviceId: id("Service"), dryRun, idempotencyKey: idem },
        run: (a, api) => api.api("POST", `${C}/services/${a.serviceId}/deployments`, { query: { dryRun: a.dryRun ? "true" : undefined }, idempotencyKey: a.idempotencyKey }),
    }),
    defineTool({
        name: "list_deployments", title: "List deployments", kind: "read",
        description: "Recent deployments of a service, newest first.",
        input: { serviceId: id("Service"), limit: z.number().int().min(1).max(100).optional() },
        run: (a, api) => api.api("GET", `${C}/services/${a.serviceId}/deployments`, { query: { limit: a.limit } }),
    }),
    defineTool({
        name: "get_deployment", title: "Get deployment", kind: "read",
        description: "Status of one deployment: pending, running, success, failed, cancelled or removed. Poll every few seconds until it settles.",
        input: { serviceId: id("Service"), deploymentId: id("Deployment") },
        run: (a, api) => api.api("GET", `${C}/services/${a.serviceId}/deployments/${a.deploymentId}`),
    }),
    defineTool({
        name: "get_deployment_logs", title: "Get build/deploy log", kind: "read",
        description: "The build and rollout log of a deployment. Read it when a deployment failed.",
        input: { serviceId: id("Service"), deploymentId: id("Deployment") },
        run: (a, api) => api.api("GET", `${C}/services/${a.serviceId}/deployments/${a.deploymentId}/logs`),
    }),
    defineTool({
        name: "restart_service", title: "Restart service", kind: "write",
        description: "Restart a running service's containers without building again.",
        input: { serviceId: id("Service") },
        run: (a, api) => api.api("POST", `${C}/services/${a.serviceId}/restart`),
    }),
    defineTool({
        name: "list_variables", title: "List variables", kind: "read",
        description: "Environment variables of a service. Secret values are never returned (value is null).",
        input: { serviceId: id("Service") },
        run: (a, api) => api.api("GET", `${C}/services/${a.serviceId}/variables`),
    }),
    defineTool({
        name: "set_variables", title: "Set variables", kind: "write", idempotent: true,
        description: "Create or update variables (other keys are kept). Mark credentials as secrets. Applies on the next deploy.",
        input: {
            serviceId: id("Service"),
            variables: z.record(z.string(), z.string()).describe("KEY: value pairs"),
            secrets: z.array(z.string()).optional().describe("Keys to store as secrets (write-only)"),
        },
        run: (a, api) => api.api("PUT", `${C}/services/${a.serviceId}/variables`, { body: { variables: a.variables, secrets: a.secrets } }),
    }),
    defineTool({
        name: "delete_variable", title: "Delete variable", kind: "destructive",
        description: "Remove one variable. Applies on the next deploy.",
        input: { serviceId: id("Service"), key: z.string() },
        run: (a, api) => api.api("DELETE", `${C}/services/${a.serviceId}/variables/${encodeURIComponent(a.key)}`),
    }),
    defineTool({
        name: "list_service_domains", title: "List service domains", kind: "read",
        description: "Public domains and TCP ports of a service, with DNS instructions for custom domains.",
        input: { serviceId: id("Service") },
        run: (a, api) => api.api("GET", `${C}/services/${a.serviceId}/domains`),
    }),
    defineTool({
        name: "add_service_domain", title: "Add domain to service", kind: "write",
        description: "Add a free *.helipod.app domain (kind=helipod) or your own domain (kind=custom) to a port. For custom domains, tell the user to create the DNS record from the response's dns field.",
        input: {
            serviceId: id("Service"),
            kind: z.enum(["helipod", "custom"]),
            domain: z.string().optional().describe("Required for custom, e.g. www.example.com"),
            port: z.number().int().min(1).max(65535),
            protocol: z.enum(["http", "tcp"]).optional(),
        },
        run: (a, api) => api.api("POST", `${C}/services/${a.serviceId}/domains`, { body: { kind: a.kind, domain: a.domain, port: a.port, protocol: a.protocol } }),
    }),
    defineTool({
        name: "remove_service_domain", title: "Remove domain from service", kind: "destructive",
        description: "Remove a domain from a service.",
        input: { serviceId: id("Service"), domainId: id("Domain") },
        run: (a, api) => api.api("DELETE", `${C}/services/${a.serviceId}/domains/${a.domainId}`),
    }),
    defineTool({
        name: "get_scale", title: "Get scale", kind: "read",
        description: "Replicas, CPU, RAM, autoscaling and daily cost of a service.",
        input: { serviceId: id("Service") },
        run: (a, api) => api.api("GET", `${C}/services/${a.serviceId}/scale`),
    }),
    defineTool({
        name: "scale_service", title: "Scale service", kind: "write", idempotent: true,
        description: "Change replicas, CPU or RAM (applies right away). COSTS MONEY on increase: call with dryRun=true first to show currentDailyCost vs newDailyCost and get the user's OK.",
        input: {
            serviceId: id("Service"),
            replicas: z.number().int().min(1).max(20).optional(),
            cpu: z.number().int().min(125).max(4000).optional().describe("Millicores per replica, multiple of 125"),
            ram: z.number().int().min(128).max(8192).optional().describe("MB per replica, multiple of 128"),
            autoscaling: z.object({
                enabled: z.boolean(), minReplicas: z.number().int().optional(), maxReplicas: z.number().int().optional(),
                cpuTarget: z.number().int().optional(), memoryTarget: z.number().int().optional(),
            }).optional(),
            dryRun,
        },
        run: (a, api) => api.api("PATCH", `${C}/services/${a.serviceId}/scale`, {
            query: { dryRun: a.dryRun ? "true" : undefined },
            body: { replicas: a.replicas, cpu: a.cpu, ram: a.ram, autoscaling: a.autoscaling },
        }),
    }),
    defineTool({
        name: "list_volumes", title: "List volumes", kind: "read",
        description: "Persistent volumes of a service.",
        input: { serviceId: id("Service") },
        run: (a, api) => api.api("GET", `${C}/services/${a.serviceId}/volumes`),
    }),
    defineTool({
        name: "add_volume", title: "Add volume", kind: "write",
        description: "Add persistent storage mounted at a path (billed daily per GB, first 1 GB free). Applies on the next deploy.",
        input: { serviceId: id("Service"), name: z.string(), mountPath: z.string(), sizeGb: z.number().int().min(1).max(50) },
        run: (a, api) => api.api("POST", `${C}/services/${a.serviceId}/volumes`, { body: { name: a.name, mountPath: a.mountPath, sizeGb: a.sizeGb } }),
    }),
    defineTool({
        name: "delete_volume", title: "Delete volume", kind: "destructive",
        description: "Remove a volume; its data is lost on the next deploy. Confirm with the user first.",
        input: { serviceId: id("Service"), volumeId: id("Volume") },
        run: (a, api) => api.api("DELETE", `${C}/services/${a.serviceId}/volumes/${a.volumeId}`),
    }),
    defineTool({
        name: "resize_volume", title: "Resize volume", kind: "write",
        description: "Change a volume's size (1-50 GB; never below the space already used). A larger volume COSTS MONEY: it raises the daily cost, charged pro rata when the service is redeployed and in full from the next renewal. Call with dryRun=true first, show currentDailyCost vs newDailyCost (IDR) and wait for the user's yes. Applies on the next deploy.",
        input: {
            serviceId: id("Service"), volumeId: id("Volume"),
            sizeGb: z.number().int().min(1).max(50).optional().describe("New size in GB (give sizeGb or sizeMb)"),
            sizeMb: z.number().int().min(1024).max(51200).multipleOf(1024).optional().describe("New size in MB, a multiple of 1024"),
            dryRun,
        },
        run: (a, api) => {
            if ((a.sizeGb === undefined) === (a.sizeMb === undefined)) throw new Error("Give exactly one of sizeGb or sizeMb.");
            return api.api("PATCH", `${C}/services/${a.serviceId}/volumes/${a.volumeId}`, {
                query: { dryRun: a.dryRun ? "true" : undefined }, body: { sizeGb: a.sizeGb, sizeMb: a.sizeMb },
            });
        },
    }),
    defineTool({
        name: "update_service_domain_port", title: "Change domain target port", kind: "write", idempotent: true,
        description: "Point an existing domain of a service (from list_service_domains) at another container port. Applies on the next deploy when needsRedeploy is true.",
        input: { serviceId: id("Service"), domainId: id("Domain"), port: z.number().int().min(1).max(65535) },
        run: (a, api) => api.api("PATCH", `${C}/services/${a.serviceId}/domains/${a.domainId}`, { body: { port: a.port } }),
    }),
    defineTool({
        name: "get_function_code", title: "Get function source", kind: "read",
        description: "Source code of a function service (409 NOT_A_FUNCTION for other services).",
        input: { serviceId: id("Service") },
        run: (a, api) => api.api("GET", `${C}/services/${a.serviceId}/function`),
    }),
    defineTool({
        name: "set_function_code", title: "Save function source", kind: "write", idempotent: true,
        description: "Replace the whole source code of a function service (up to 512 KB). The previous code is overwritten: read get_function_code first when editing. Runs after the next deploy (deploy_service).",
        input: { serviceId: id("Service"), code: z.string().min(1).max(512 * 1024) },
        run: (a, api) => api.api("PUT", `${C}/services/${a.serviceId}/function`, { body: { code: a.code } }),
    }),
    defineTool({
        name: "list_secret_files", title: "List secret files", kind: "read",
        description: "Secret files mounted into a service (name, file name, mount path). Contents are write-only and never returned.",
        input: { serviceId: id("Service") },
        run: (a, api) => api.api("GET", `${C}/services/${a.serviceId}/files`),
    }),
    defineTool({
        name: "add_secret_file", title: "Add secret file", kind: "write",
        description: "Upload a file (certificate, key, credentials JSON, config) that is mounted read-only into the service at mountPath. Content is base64 of the file's bytes, at most 10 MB; it is stored as a secret and can never be read back. Applies on the next deploy. Don't echo the contents in chat.",
        input: {
            serviceId: id("Service"),
            fileName: z.string().min(1).max(200).describe("e.g. service-account.json"),
            mountPath: z.string().regex(/^\/[A-Za-z0-9._\/@+-]{0,254}$/).describe("Absolute path in the container, e.g. /etc/secrets/service-account.json"),
            contentBase64: z.string().min(4).max(14_000_000).describe("The file's bytes in standard base64"),
            name: z.string().max(255).optional().describe("Label shown in the dashboard"),
        },
        run: ({ serviceId, ...body }, api) => api.api("POST", `${C}/services/${serviceId}/files`, { body }),
    }),
    defineTool({
        name: "update_secret_file", title: "Update secret file", kind: "write", idempotent: true,
        description: "Replace a secret file's contents (base64) and/or change its mount path or label. The old contents are overwritten. Applies on the next deploy.",
        input: {
            serviceId: id("Service"), fileId: id("File"),
            contentBase64: z.string().min(4).max(14_000_000).optional(),
            fileName: z.string().min(1).max(200).optional(),
            mountPath: z.string().regex(/^\/[A-Za-z0-9._\/@+-]{0,254}$/).optional(),
            name: z.string().max(255).optional(),
        },
        run: ({ serviceId, fileId, ...body }, api) => api.api("PUT", `${C}/services/${serviceId}/files/${fileId}`, { body }),
    }),
    defineTool({
        name: "delete_secret_file", title: "Delete secret file", kind: "destructive",
        description: "Delete a secret file; it is gone from the service after the next deploy and cannot be recovered (contents are never readable). Confirm with the user.",
        input: { serviceId: id("Service"), fileId: id("File") },
        run: (a, api) => api.api("DELETE", `${C}/services/${a.serviceId}/files/${a.fileId}`),
    }),
    defineTool({
        name: "get_service_logs", title: "Get runtime logs", kind: "read",
        description: "What the running service printed, newest first. Use filter to search (e.g. 'error').",
        input: {
            serviceId: id("Service"),
            since: z.string().regex(/^[0-9]{1,3}(m|h|d)$/).optional().describe("e.g. 15m, 1h, 1d (default 1h)"),
            filter: z.string().max(200).optional(),
            limit: z.number().int().min(1).max(1000).optional(),
        },
        run: (a, api) => api.api("GET", `${C}/services/${a.serviceId}/logs`, { query: { since: a.since, filter: a.filter, limit: a.limit } }),
    }),
    defineTool({
        name: "get_service_metrics", title: "Get metrics", kind: "read",
        description: "CPU, memory and network over time plus current values and restarts.",
        input: { serviceId: id("Service"), since: z.enum(["5m", "15m", "30m", "1h", "3h", "6h", "1d", "7d"]).optional() },
        run: (a, api) => api.api("GET", `${C}/services/${a.serviceId}/metrics`, { query: { since: a.since } }),
    }),
    defineTool({
        name: "list_templates", title: "List templates", kind: "read",
        description: "One-click templates (WordPress, n8n, Postgres, Umami, ...). Use the slug with deploy_template.",
        input: { search: z.string().max(80).optional(), category: z.string().max(60).optional() },
        run: (a, api) => api.api("GET", `${C}/templates`, { query: { search: a.search, category: a.category } }),
    }),
    defineTool({
        name: "deploy_template", title: "Deploy template", kind: "write",
        description: "Create every service of a template in an environment and deploy them. COSTS MONEY (each service is billed daily). Confirm with the user first.",
        input: {
            environmentId: id("Environment"),
            slug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/),
            inputs: z.record(z.string(), z.string()).optional().describe("Answers to the template's inputs"),
            idempotencyKey: idem,
        },
        run: (a, api) => api.api("POST", `${C}/environments/${a.environmentId}/templates/${a.slug}`, { body: { inputs: a.inputs }, idempotencyKey: a.idempotencyKey }),
    }),
    defineTool({
        name: "create_stack", title: "Create stack from spec", kind: "write",
        description: "Create several connected services from a template spec ({ version: 1, inputs?, services: [...] }) and deploy them in dependency order. COSTS MONEY: dryRun=true first. See https://docs.helipod.io/docs/container-api/templates-and-stacks",
        input: {
            environmentId: id("Environment"),
            spec: z.record(z.string(), z.any()).describe("Template spec object"),
            inputs: z.record(z.string(), z.string()).optional(),
            deploy: z.boolean().optional(),
            dryRun, idempotencyKey: idem,
        },
        run: (a, api) => api.api("POST", `${C}/environments/${a.environmentId}/stacks`, {
            query: { dryRun: a.dryRun ? "true" : undefined }, idempotencyKey: a.idempotencyKey,
            body: { spec: a.spec, inputs: a.inputs, deploy: a.deploy },
        }),
    }),
];
