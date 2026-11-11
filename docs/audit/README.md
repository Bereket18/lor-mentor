# Audit records (historical)

Every file in this directory is a point-in-time record of an audit, test run or
handover review. Each describes the repository as it was on the date recorded
inside it, so they contain superseded status lines — "not merged", "not
verified", branch names such as `integration/anatomy-hardening`. **They are
evidence, not instructions.**

Current sources of truth:

| Topic | Document |
|---|---|
| Deployment and operations | [../deploy/](../deploy/) and [../../DEPLOYMENT.md](../../DEPLOYMENT.md) |
| Payments | [../deploy/payments.md](../deploy/payments.md) |
| Security controls and incident response | [../../SECURITY.md](../../SECURITY.md) |
| Environment variables | [../../ENVIRONMENT_VARIABLES.md](../../ENVIRONMENT_VARIABLES.md) |
| Go/no-go gate and release record | [../../PRODUCTION_CHECKLIST.md](../../PRODUCTION_CHECKLIST.md) |
| Ownership and open items | [../../HANDOVER.md](../../HANDOVER.md) |
| Working progress log | [../archive/PROGRESS.md](../archive/PROGRESS.md) |

Two files are still operational even though they live here:

- `SECRET-ROTATION-RUNBOOK.md` — run it when a credential leaks or a device is
  lost; linked from `HANDOVER.md` §4.
- `PHASE-H-VALIDATION.md` — the record of what was and was not executed before
  handover; linked from `HANDOVER.md` §4.

`REGRESSION-TEST-RESULTS.md` is referenced from
`apps/api/src/modules/payments/cheki.service.spec.ts`, so this directory must
keep its name and location.
