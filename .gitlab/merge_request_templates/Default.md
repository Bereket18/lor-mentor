# Merge request

## Summary

<!-- What does this change, and why? One or two sentences. -->

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] Refactor / cleanup
- [ ] Documentation
- [ ] Build / CI / tooling
- [ ] Dependency upgrade

## Related issue

<!-- Closes #nn, or "none". -->

## How it was tested

<!-- List the commands you actually ran and their result. Do not tick a box
     you did not run. -->

- [ ] `npm run build:api`
- [ ] `npm run build:web`
- [ ] `npm test --workspace=apps/api`
- [ ] `npm run test:e2e --workspace=apps/api`
- [ ] `npm run lint --workspace=apps/web`
- [ ] `node apps/web/scripts/validate-anatomy-model.mjs --system heart`
- [ ] `node apps/web/scripts/validate-anatomy-model.mjs --system urinary`
- [ ] `SMOKE_STRICT_CACHE=0 bash deploy/smoke-test.sh http://127.0.0.1:4000 http://localhost:3000`

## Checklist

- [ ] The branch is based on the latest `main` (or the intended integration
      branch).
- [ ] No `.env`, secret, token, private key, or real credential is committed.
- [ ] No secret-shaped placeholder that looks real was added.
- [ ] If a dependency changed, `npm audit --omit=dev` was re-checked for both
      workspaces.
- [ ] If an anatomy model or manifest changed, both validators pass and the new
      file name is versioned (`<name>.vN.glb`).
- [ ] Anatomy systems touched remain unpublished unless faculty review is
      complete (`isPublished` stays `false`; `isReviewed` is not set to `true`
      by this change).
- [ ] Licence and attribution text was not reworded.
- [ ] Teaching text was not edited unless the change is a reviewed correction
      with a linked issue and a reviewer.
- [ ] Documentation that describes the changed behaviour was updated.
- [ ] The pipeline is green (or the failures are explained in the description).

## Notes for the reviewer

<!-- Anything risky, anything deliberately out of scope, anything to watch on
     deploy. -->
