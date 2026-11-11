# Lor Mentor — start here

Lor Mentor is a study platform for a medical school: students read course
material, take quizzes, use flashcards, practise anatomy models and pay for
their subscription; staff manage courses and approve bank-transfer payments.

This folder contains everything needed to run it in production. **You do not
need to know the codebase to deploy it** — but you do need to follow these
documents in the order they are numbered, and you need about half a day.

> **Taking over from the previous owner?** Do
> [91-CREDENTIAL-REPLACEMENT.md](91-CREDENTIAL-REPLACEMENT.md) first. It lists
> every account and secret the previous owner created and how to move each one
> to the college.

---

## The short version

You are deploying five containers to **one Linux server** behind **nginx** with
a **Let's Encrypt** certificate:

| Container | What it does |
|---|---|
| `web` | the website students and staff use (Next.js, port 3000) |
| `api` | the application server (NestJS, port 4000) |
| `verifier` | reads bank receipts and compares them with payment records |
| `postgres` | the database (all data lives here) |
| `redis` | cache, queues and login-token denylist |

Only `web` and `api` are reachable, and only through nginx. Everything is
started by Docker Compose; nothing is installed globally except Docker, nginx
and certbot.

---

## Reading order

| # | Document | Read it when |
|---|---|---|
| 00 | this page | now |
| 10 | [Deployment guide](10-DEPLOYMENT-GUIDE.md) | **the main walkthrough — follow it top to bottom** |
| 20 | [Server prerequisites](20-SERVER-PREREQUISITES.md) | before the first build (hardware, OS, firewall, users) |
| 30 | [Database and backups](30-DATABASE-AND-BACKUPS.md) | before go-live (scheduling, restore drill) |
| 40 | [Payments](40-PAYMENTS.md) | if Chapa or bank-receipt verification is in scope |
| 41 | [Email setup](41-EMAIL-SETUP.md) | before go-live (verification and password-reset email) |
| 42 | [nginx and TLS](42-NGINX-AND-TLS.md) | reference while setting up the proxy and certificate |
| 50 | [Integrations and accounts](50-INTEGRATIONS-AND-ACCOUNTS.md) | when creating the Chapa, Resend and Gemini accounts |
| 60 | [Environment variables](60-ENVIRONMENT-VARIABLES.md) | when filling in `.env.production` |
| 70 | [Security](70-SECURITY.md) | before exposing the site publicly |
| 80 | [Go/no-go gate](80-GO-NOGO-GATE.md) | the launch decision and its sign-off record |
| 81 | [Release checklist](81-RELEASE-CHECKLIST.md) | every release, including the first |
| 82 | [Production gates and evidence](82-PRODUCTION-GATES-AND-EVIDENCE.md) | the items that can only be closed on the real server |
| 90 | [Secret rotation](90-SECRET-ROTATION.md) | on a schedule, or immediately after any leak |
| 91 | [Credential replacement](91-CREDENTIAL-REPLACEMENT.md) | **first, if you are taking over the project** |
| 92 | [Troubleshooting](92-TROUBLESHOOTING.md) | when something does not work |

---

## Before you touch the server

- [ ] **Domain** purchased, with access to its DNS records.
- [ ] **Hostinger VPS** with Ubuntu 24.04 LTS, at least 4 GB RAM
      (see [20-SERVER-PREREQUISITES.md](20-SERVER-PREREQUISITES.md) §1).
- [ ] **Git access** to the repository — GitLab is the source of truth
      (`https://gitlab.com/bereketadamsseged/lor-mentor-edu.git`); the GitHub
      repository (`Bereket18/lor-mentor`) is a mirror.
- [ ] **A password manager** the college owns, for the generated secrets.
- [ ] **Resend account** for email, sending domain verified.
- [ ] **Google AI Studio key** for the AI features (optional, but the tutor and
      anatomy assistant are off without it).
- [ ] **Chapa merchant account** (optional — bank transfer works without it).
- [ ] **The college's bank account details** for the payment instructions.

Account-by-account walkthroughs: [50-INTEGRATIONS-AND-ACCOUNTS.md](50-INTEGRATIONS-AND-ACCOUNTS.md).

---

## Three rules that prevent most disasters

1. **Get the code with `git clone`.** Never deploy from a zip or an `rsync` that
   rewrites line endings — the database migrations are hashed as they sit on
   disk and will fail on redeploy.
2. **Never run `docker compose down -v`.** The `-v` flag deletes the database,
   Redis data and uploaded files.
3. **`.env.production` stays `chmod 600`, outside Git, backed up in the
   college's password manager.**

---

## When something breaks

Go to [92-TROUBLESHOOTING.md](92-TROUBLESHOOTING.md) first. It starts with the
commands that show you what is wrong, then maps each common symptom to its fix.
If you still need help, collect the exact command, its output, and
`docker compose -f docker-compose.prod.yml logs <service> --tail=50`.

---

## Where everything else lives

| Folder | What is in it |
|---|---|
| [`docs/deployer/`](.) | this pack — the only folder a deployer needs |
| [`docs/annex/`](../annex/) | project history, changelog, handover notes, third-party attribution |
| [`docs/archive/`](../archive/) | superseded plans and progress logs (evidence, not instructions) |
| [`docs/audit/`](../audit/) | point-in-time audit and test reports (evidence, not instructions) |
| [`docs/anatomy/`](../anatomy/) | anatomy content, provenance and review workflow |

Two files stay at the repository root and are referenced by licence tooling:
[`THIRD_PARTY_LICENSES.md`](../../THIRD_PARTY_LICENSES.md) and
[`THIRD_PARTY_NOTICES.md`](../../THIRD_PARTY_NOTICES.md).

---

## Ownership

The college is the system owner after handover. The previous owner keeps no
production access unless the college grants it. Open items, owners and their
status are tracked in [`docs/annex/HANDOVER.md`](../annex/HANDOVER.md).
