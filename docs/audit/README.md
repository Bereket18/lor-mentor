# Audit records (historical)

Every file in this directory is a point-in-time record of an audit, test run or
handover review. Each describes the repository as it was on the date recorded
inside it, so they contain superseded status lines — "not merged", "not
verified", branch names such as `integration/anatomy-hardening`. **They are
evidence, not instructions.**

## Sources of truth

| Topic | Document |
|---|---|
| Deployment, operations, credentials | [../deployer/](../deployer/) — start at [00-START-HERE.md](../deployer/00-START-HERE.md) |
| Payments | [../deployer/40-PAYMENTS.md](../deployer/40-PAYMENTS.md) |
| Security controls and incident response | [../deployer/70-SECURITY.md](../deployer/70-SECURITY.md) |
| Environment variables | [../deployer/60-ENVIRONMENT-VARIABLES.md](../deployer/60-ENVIRONMENT-VARIABLES.md) |
| Go/no-go gate and release record | [../deployer/80-GO-NOGO-GATE.md](../deployer/80-GO-NOGO-GATE.md) |
| Ownership and open items | [../annex/HANDOVER.md](../annex/HANDOVER.md) |
| Working progress log | [../archive/PROGRESS.md](../archive/PROGRESS.md) |

Two documents used to live here and are now part of the deployer pack:

- the secret-rotation runbook is
  [../deployer/90-SECRET-ROTATION.md](../deployer/90-SECRET-ROTATION.md);
- the final validation record is
  [../annex/PHASE-H-VALIDATION.md](../annex/PHASE-H-VALIDATION.md).

`REGRESSION-TEST-RESULTS.md` is referenced from
`apps/api/src/modules/payments/cheki.service.spec.ts`, so this directory must
keep its name and location.
