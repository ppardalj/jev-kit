# Expected suites per commit

Written from each commit's file list and `docs/architecture/testing.md` (plus the risk matrix in
el-baul's `verify` skill) before any Jev answer was seen.

**R** required, **S** worth running (a reasonable reviewer could go either way), **·** skip.

| id | commit | backend | persistence | backend-acc | frontend | admin | frontend-acc | admin-acc | e2e | why |
|---|---|---|---|---|---|---|---|---|---|---|
| c01 | 87c459c1 | · | · | · | R | · | · | · | · | Storybook `title` only; `frontend` runs every story |
| c02 | 71396d7a | · | · | · | R | · | · | · | · | candidate-picking logic; relationships are not an acceptance journey |
| c03 | 5584707d | R | · | · | · | · | · | · | · | email template, its approval test lives in `Infra.Tests` |
| c04 | 8785f169 | R | · | S | · | · | · | · | · | `UserSyncMiddleware`, DI wiring, appsettings: middleware and service wiring escalate to the image |
| c05 | 0259eaa1 | R | R | S | · | · | · | · | · | maintenance command, new repository query, new PersistenceTests; `PhotoAsset` domain touched |
| c06 | 139d2911 | R | R | R | · | · | S | · | · | migration and EF config: acceptance always; api-lite's in-memory repo changed |
| c07 | 0890001f | R | · | R | R | S | S | · | · | public contract (`AppConfigResponse`, openapi), app routing gate, admin generated schema |
| c08 | 0ee932bb | · | · | R | · | · | · | · | R | MinIO image in compose and in the acceptance fixture |
| c09 | 71e652e3 | · | · | R | · | · | R | R | R | every Dockerfile: anything that builds an image |
| c10 | 97b16206 | · | · | · | · | · | · | · | · | CI-only Playwright setup action; no local suite runs it |
| c11 | 86f977d2 | · | · | · | · | · | R | · | R | the changed specs are those suites |
