---
name: helipod-reseller
description: Resell Helipod under your own brand (white label) - one project per customer, email keys and SMTP passwords per customer, domains registered or transferred in the customer's name, VPS and services billed to your wallet. Use when the user sells hosting, domains or email to their own customers through the Helipod API or MCP.
---

# Reselling Helipod

Follow the `helipod` skill rules. The reseller's wallet pays for everything; set your own prices to customers outside Helipod. Use a whole-account Helipod API key with the products you resell (Email API, Domain API, VPS API, Container API, Database API). Projects need no product: any key can list them, a whole-account key creates them.

## Onboard a customer

1. `create_project` (name = the customer, `idempotencyKey` = your customer id) → keep the `projectId` with the customer in your own system.
2. Everything for that customer goes in that project: services, a database, a VPS, email. Pass `projectId` to the email tools (a whole-account key needs it).

## Email per customer

1. `buy_email_plan` for the customer's project (FREE first, `dryRun`), `add_email_domain` with the customer's domain, the DNS records (`add_domain_email_records` when the domain is on Helipod, else give them to the customer), `verify_email_domain`.
2. `create_email_key` with the customer's name → the key is shown ONCE: hand it to the customer (or store it encrypted on your side). It works for that project only, on the Email API and as the SMTP password (`smtp.helipod.io`, port 587 STARTTLS or 465, username `apikey`). It cannot make other keys. Pass `access: "send"` for a customer who only needs SMTP / sending: that key answers 403 KEY_SEND_ONLY on everything else (plans, renewals, domains, contacts), so it can never spend your wallet.
3. `list_email_keys`, `revoke_email_key` when a customer leaves or a key leaks. Allowance per project: 5 keys (Free/Starter), 10 (Pro), 50 (Business).
4. Managing keys needs the Helipod API key itself: an email key or an AI-tool sign-in answers `403 KEY_NOT_ALLOWED`.

## Domains in the customer's name

- New domain: `register_domain` with `registrant` = the customer's details (only details the customer gave you). `.id` family only (`.id`, `.my.id`, `.web.id`, `.biz.id`, `.ai.id`); other extensions use the reseller account's owner details (`400 REGISTRANT_NOT_SUPPORTED` if you send one).
- Transfer in: `transfer_domain` with the auth code and `registrant`: the owner is set when the transfer completes (`ownerPending: true` until then; it is checked again automatically).
- A domain already on the account: `set_domain_owner`. Free.
- Renewal is charged to your wallet: `set_domain_auto_renew` per domain to match what the customer paid for. The same for each customer project's email plan: `set_email_auto_renew` (off when the customer stops paying; `get_email_plan` / `email_status` show `autoRenew`), and `set_vps_auto_renew` per server. Sends over an email plan's quota are charged only with `set_email_payg` on (off by default): leave it off unless the customer pays for overage.

## Servers and apps per customer

- VPS: `helipod-vps-deploy` inside the customer's project. Containers: `helipod-deploy` in the project's environment.
- Watch money: `get_wallet` before buying, `list_wallet_transactions` / `get_statement` to bill your customers; top up with `create_deposit` (give the payment link to the account owner, never pay it yourself).

## Offboard

Revoke the customer's email keys, then delete or hand over in this order: services and VPS (confirm, data is lost), database, email plan, domains (transfer out at the registry), and finally `delete_project` (only empty projects; `confirm` = its exact name).
