# Archive

Superseded documents, kept because the handover depends on an auditable trail.
Nothing here is an instruction. The table records what each file was and what
replaced it.

| File | What it was | Successor |
|---|---|---|
| [`PROGRESS.md`](PROGRESS.md) | Working log of every build, seed, gate and review step through 2026-11-02 | [80-GO-NOGO-GATE.md](../deployer/80-GO-NOGO-GATE.md) §11 for the final gate; [HANDOVER.md](../annex/HANDOVER.md) §6 for open items |
| [`DOCKER-READINESS-REPORT.md`](DOCKER-READINESS-REPORT.md) | Engineering review of the production stack — secret scoping, proxy timeouts, log limits, verifier user, build context — November 2026 | [20-SERVER-PREREQUISITES.md](../deployer/20-SERVER-PREREQUISITES.md) §9 and [82-PRODUCTION-GATES-AND-EVIDENCE.md](../deployer/82-PRODUCTION-GATES-AND-EVIDENCE.md) |
| [`REMEDIATION-LOG.md`](REMEDIATION-LOG.md) | Defect-by-defect remediation record, July 2026 | — (evidence only) |
| [`PRODUCTION_READINESS_AUDIT.md`](PRODUCTION_READINESS_AUDIT.md) | July 2026 readiness review | [../audit/FINAL-PRODUCTION-READINESS-REPORT.md](../audit/FINAL-PRODUCTION-READINESS-REPORT.md) |
| [`test-report.md`](test-report.md) | Sprint 1–2 test report, June 2026 | [../audit/REGRESSION-TEST-RESULTS.md](../audit/REGRESSION-TEST-RESULTS.md) |
| [`bug-fixes.md`](bug-fixes.md) | June 2026 defect list | — (evidence only) |
| [`core-flow-setup.md`](core-flow-setup.md) | June 2026 flow notes | [../../README.md](../../README.md) local setup |
| [`ARCHITECTURE_AUDIT.md`](ARCHITECTURE_AUDIT.md) | June 2026 architecture review and backlog | [../audit/CURRENT_ARCHITECTURE.md](../audit/CURRENT_ARCHITECTURE.md) |
| [`QUICK_START.md`](QUICK_START.md) | Windows-only local start commands | [../../README.md](../../README.md) local setup |
| [`SERVER_STARTUP.md`](SERVER_STARTUP.md) | Older local start and troubleshooting guide | [../../README.md](../../README.md) local setup |
| [`atlas-feasibility.md`](atlas-feasibility.md) | 3D atlas feasibility study; the files it names were never built | [../anatomy/whole-body-plan.md](../anatomy/whole-body-plan.md) |
| [`RUN-SPEC.md`](RUN-SPEC.md) | Internal build prompt used during the anatomy engagement | [../anatomy/whole-body-plan.md](../anatomy/whole-body-plan.md) and [../anatomy/provenance/README.md](../anatomy/provenance/README.md) |
| [`sprints/`](sprints/) | Sprint-by-sprint completion logs, June 2026 | [`PROGRESS.md`](PROGRESS.md) in this directory |

`docs/File-tree.md`, `docs/tree-2.md` and the root `PRODUCTION_READINESS_AUDIT.md`
were deleted rather than archived: the first two were near-identical generated
trees from June 2026 that no longer matched the repository, and the third scored
an empty workspace 0/100 because it never found the application.
