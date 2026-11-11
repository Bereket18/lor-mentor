# Documentation

Two kinds of document live here. Start with the active set; the historical
records are evidence of how the platform was built, not instructions.

## Active

| Document | What it covers |
|---|---|
| [deploy/payments.md](deploy/payments.md) | Chapa and bank-receipt lifecycles, webhooks, retries |
| [deploy/GO-LIVE.md](deploy/GO-LIVE.md) | Deployment day and the anatomy publish gate |
| [deploy/SERVER-PREREQUISITES.md](deploy/SERVER-PREREQUISITES.md) | VPS, Docker, firewall |
| [deploy/NGINX-SETUP.md](deploy/NGINX-SETUP.md) | nginx, TLS, upload limits |
| [deploy/BACKUP-RESTORE.md](deploy/BACKUP-RESTORE.md) | Nightly backup and the restore drill |
| [deploy/RELEASE-CHECKLIST.md](deploy/RELEASE-CHECKLIST.md) | Per-release steps |
| [deploy/DOCKER-READINESS.md](deploy/DOCKER-READINESS.md) | Image build and compose review |
| [deploy/LOCAL-BUILD-NOTICE.md](deploy/LOCAL-BUILD-NOTICE.md) | Why a local build must not be deployed |
| [deploy/email-setup.md](deploy/email-setup.md) | Resend/SMTP, including support-ticket notifications |
| [deploy/chapa-production.md](deploy/chapa-production.md) | Pointer to `payments.md` |
| [deploy/receipt-verifier.md](deploy/receipt-verifier.md) | Pointer to `payments.md` |
| [anatomy/whole-body-plan.md](anatomy/whole-body-plan.md) | 3D anatomy roadmap and per-system plan |
| [anatomy/provenance/README.md](anatomy/provenance/README.md) | Source provenance for every model and teaching text |

Drafts of anatomy teaching text live in `anatomy/drafts/`; they are content
under faculty review, not runbooks. Ownership, access transfer and the open-item
list are in [../HANDOVER.md](../HANDOVER.md).

## Historical

- [audit/](audit/) — point-in-time audits, test records and handover evidence.
  Its `README.md` explains their status and names the two operational
  exceptions kept there.
- [archive/](archive/) — superseded working documents (progress log, sprint
  logs, one-off reports). Kept for the audit trail; do not follow them as
  instructions.
