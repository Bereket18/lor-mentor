# Documentation

Three kinds of document live here:

- **[deployer/](deployer/)** — the operational pack. If you run or deploy the
  system, this is the only folder you need.
- **[anatomy/](anatomy/)** — the 3D anatomy content, its provenance and the
  faculty-review workflow.
- **[annex/](annex/)**, **[audit/](audit/)**, **[archive/](archive/)** —
  history, attribution and evidence. They describe the repository as it was on
  a given date; they are not instructions.

---

## Deployer pack ([`deployer/`](deployer/))

Read in number order. Start at
[deployer/00-START-HERE.md](deployer/00-START-HERE.md).

| Document | What it covers |
|---|---|
| [00 — Start here](deployer/00-START-HERE.md) | What the system is, reading order, accounts you need, the three rules that prevent most disasters |
| [10 — Deployment guide](deployer/10-DEPLOYMENT-GUIDE.md) | The single top-to-bottom walkthrough: server, DNS, secrets, build, TLS, soak, go public |
| [20 — Server prerequisites](deployer/20-SERVER-PREREQUISITES.md) | Hardware, OS, packages, firewall, users, pre-deploy verification |
| [30 — Database and backups](deployer/30-DATABASE-AND-BACKUPS.md) | Schema, migrations, nightly dump, off-box copies, restore drill |
| [40 — Payments](deployer/40-PAYMENTS.md) | Chapa and bank-receipt lifecycles, webhooks, retries, admin review |
| [41 — Email setup](deployer/41-EMAIL-SETUP.md) | Resend/SMTP, SPF/DKIM/DMARC, verification and reset mail |
| [42 — nginx and TLS](deployer/42-NGINX-AND-TLS.md) | Reverse proxy, certificates, upload limits, timeouts, diagnostics |
| [50 — Integrations and accounts](deployer/50-INTEGRATIONS-AND-ACCOUNTS.md) | Chapa, Resend, Gemini and DNS account setup |
| [60 — Environment variables](deployer/60-ENVIRONMENT-VARIABLES.md) | Every variable: purpose, required/optional, exposure, source |
| [70 — Security](deployer/70-SECURITY.md) | Controls, secret handling, incident response, reporting |
| [80 — Go/no-go gate](deployer/80-GO-NOGO-GATE.md) | The launch decision, its record and sign-off |
| [81 — Release checklist](deployer/81-RELEASE-CHECKLIST.md) | Per-release steps, including the first |
| [82 — Production gates and evidence](deployer/82-PRODUCTION-GATES-AND-EVIDENCE.md) | Items that can only be closed on the real server, with the evidence template |
| [90 — Secret rotation](deployer/90-SECRET-ROTATION.md) | What to rotate, in what order, and how to verify |
| [91 — Credential replacement](deployer/91-CREDENTIAL-REPLACEMENT.md) | Moving every account and secret from the previous owner to the college |
| [92 — Troubleshooting](deployer/92-TROUBLESHOOTING.md) | Symptom → cause → fix, plus how to collect diagnostics |

---

## Anatomy content ([`anatomy/`](anatomy/))

| Document | What it covers |
|---|---|
| [whole-body-plan.md](anatomy/whole-body-plan.md) | 3D anatomy roadmap and per-system plan |
| [provenance/README.md](anatomy/provenance/README.md) | Source provenance for every model and teaching text |
| [drafts/](anatomy/drafts/) | Teaching text under faculty review — content, not runbooks |

Model credit and licence wording is in
[`apps/web/public/models/anatomy/NOTICE-MODELS.md`](../apps/web/public/models/anatomy/NOTICE-MODELS.md).
Do not shorten or rewrite the licence statements.

---

## History and evidence

| Folder | What is in it |
|---|---|
| [annex/](annex/) | [Handover and open items](annex/HANDOVER.md), [changelog](annex/CHANGELOG.md), [final validation record](annex/PHASE-H-VALIDATION.md), [local-build notice](annex/LOCAL-BUILD-NOTICE.md) |
| [audit/](audit/) | Point-in-time audits, test records and handover evidence. [Its README](audit/README.md) explains their status |
| [archive/](archive/) | Superseded working documents (progress log, sprint logs, one-off reports) |

Third-party attribution lives at the repository root, because licence tooling
expects it there: [`THIRD_PARTY_LICENSES.md`](../THIRD_PARTY_LICENSES.md) and
[`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md).
