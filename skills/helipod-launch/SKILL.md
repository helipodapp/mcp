---
name: helipod-launch
description: Launch a complete setup on Helipod in one go - an app with its Postgres database, its own domain with HTTPS and email that works (sending domain, SMTP), or a WordPress / n8n site on a VPS with a domain and mail. Use when the user wants to go live end to end ("deploy my app with a database and my domain", "set up WordPress with email") rather than one product.
---

# Launch end to end on Helipod

Follow the `helipod` skill rules. Ask for everything that costs money up front (domain, VPS, paid plans), price each with a dry run, and get one clear yes for the total before buying. Prefer free parts: the FREE database and email plans, a `*.helipod.app` URL until the domain is ready.

## Recipe A: web app + database + domain + email (containers)

1. `list_projects` → the project and its production `environmentId` (`create_project` for a new one).
2. Database: `create_database` (FREE plan). After the service exists, `get_database_connection` → `set_variables` with `DATABASE_URL` in `secrets`.
3. App: follow `helipod-deploy` (dry run, create, poll `get_deployment`, logs on failure). Expose the app's port so it gets a `*.helipod.app` URL.
4. Domain: `search_domain` → `domain_prices` / `register_domain` with `dryRun: true` → yes → register. Then `add_service_domain` with `kind: "custom"` and create the DNS record it returns with `update_dns_record` (the domain is on Helipod, so it is one call). `verify_service_domain` until HTTPS is active.
5. Email: `buy_email_plan` (FREE, `dryRun` first) → `add_email_domain` with a subdomain such as `mail.example.com` → `add_domain_email_records` puts every DNS record in place in one call (domain on Helipod) → `verify_email_domain`. The app sends with `HELIPOD_API_KEY` (Email API enabled) or an email key from `create_email_key` stored as a secret.
6. Check: open the URL, send one test email with `send_email`, read `list_emails` for delivery.

## Recipe B: WordPress (or n8n) on a VPS + domain + email

1. Follow `helipod-vps-deploy` with the `wordpress-…` (or `n8n-…`) image.
2. Domain: register or use one on Helipod, `update_dns_record` `A` → the server IP; HTTPS as in `helipod-vps-deploy`.
3. Email: Recipe A step 5, then `create_email_key` and put it in the site's SMTP settings (WP Mail SMTP: host `smtp.helipod.io`, port 587, username `apikey`, password = the key, from = an address on the verified domain).

## Recipe C: a domain the user already has elsewhere

- Keep it there: give the user the exact records to add (the CNAME / A from `add_service_domain`, the email records from `add_email_domain`), then `verify_service_domain` / `verify_email_domain`.
- Move it to Helipod: `transfer_domain` with the auth code (`dryRun` first). It stays `pending_transfer` for a few days; DNS keeps working at the old provider meanwhile.

## Hand over

Tell the user, in one short list: the URL(s), where the database lives, the sending domain and the key name (never the key), what is billed and when (VPS period, domain renewal date, bundle or `walletDailyCost`), and that `auto-renew` is on for the domain and the VPS (or how to turn it off).
