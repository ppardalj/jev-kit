# Expected answers

Written from the el-baul code at `1a4ddca3`, before reading any session's answer. Paths are
relative to the el-baul root. **Key points** decide the score: all of them is right, some is
partial, none or a wrong claim is wrong.

## q1: anonymous endpoints and rate limiting

Nine controllers in `api/ElBaul.Api.Common/Controllers/` have `[AllowAnonymous]` endpoints (11
endpoints), and every one of those endpoints also has `[EnableRateLimiting("PublicLimiter")]`:
`AppConfig`, `EmailAssets`, `EmailOpen`, `EmailTracking`, `PersonaInvites` (2), `PushNotificationOpen`,
`SharedLinks` (only `GET /s/{token}`), `TvPairings` (2, the claim is `[Authorize]`), `TvSessions`.

- Key points: the nine controllers; all anonymous endpoints are rate limited (`PublicLimiter`).
- Bonus: `ChatController` has `ChatLimiter` but is authenticated; `/health` is a minimal-API anonymous
  endpoint with `RequireRateLimiting("PublicLimiter")` in `ElBaulApiHost.cs`; the limiter policies
  are defined in `ElBaulApiHost.cs` (`PublicLimiter` per IP, `ChatLimiter` per user).

## q2: managers without baúl authorization

Implementations under `api/ElBaul.Core/*/Application/` with no `AuthorizeAsync`,
`IBaulAuthorizer` or `BaulAccessService`: `AdminManager`, `UserSessionManager`,
`ChatMemoryExtractionManager`, `PushDigestManager`, `PushNotificationManager`, `WeeklyDigestManager`,
`SupportManager`, `TvPairingManager`, `UserManager`. None is a real hole:

- `AdminManager` touches any baúl (detail, hard delete, unlink persona) but `AdminController` is
  `[Authorize(Policy = "AdminOnly")]`.
- `TvPairingManager.ClaimAsync(code, baulId)` delegates to `TvSessionManager.CreateAsync`, which calls
  `baulAccess.AuthorizeAsync(..., AccessLevel.Member, ...)`.
- `ChatMemoryExtractionManager` runs as a background job (`Infra/Chat/ChatMemoryExtractionJobs.cs`)
  with the baúl and user of a chat message that was already authorized, and only resolves memories
  that match both.
- `PushDigestManager`, `WeeklyDigestManager` are background jobs, `PushNotificationManager` handles the
  caller's own tokens plus an admin-only test send.
- `UserManager`, `SupportManager`, `UserSessionManager` are user-scoped, not baúl-scoped.

- Key points: `AdminManager`, `TvPairingManager` and `ChatMemoryExtractionManager` identified as the
  baúl-touching ones, each with why it is safe; verdict "no real hole".

## q3: Routes that bypass use cases

Of 42 non-test files under `app/src/features/*/routes/`, none calls a store's `setState`, and nine
import `api` from `@/api` and call it directly:

| Route | Call | Covered by the documented exception? |
|---|---|---|
| `auth/routes/OnboardingRoute.tsx` | `api.personaInvites.getPreview` | yes, pre-auth bootstrapping |
| `sharing/routes/AcceptBaulInviteRoute.tsx` | `api.personaInvites.accept` | yes, accepting a baúl invite |
| `sharing/routes/BaulGlobalInvitacionRoute.tsx` | `api.personaInvites.getPreview` | yes, pre-auth |
| `baules/routes/BaulSettingsRoute.tsx` | `api.photos.getPage` as a `fetchPage` callback | yes, picker pagination |
| `baules/routes/RequestBaulDeletionRoute.tsx` | `api.support.submit` | yes, fire-and-forget |
| `support/routes/SupportFormRoute.tsx` | `api.support.submit` | yes, fire-and-forget |
| `tv/routes/TvLandingRoute.tsx` | `api.tvPairings.create`, `.getStatus` | not listed; uncached polling, arguable |
| `tv/routes/TvPairingRoute.tsx` | `api.tvPairings.claim` | not listed; arguable |
| `tv/routes/TvSessionRoute.tsx` | `api.tvSessions.*` | not listed; arguable |

The exception is in `docs/architecture/frontend.md` ("a Route may call `api.*` directly … when the
result is never cached or shared across routes").

- Key points: the nine Routes (at least eight); no `setState` offenders; the documented exception
  applied, leaving the three `tv/` Routes as the only candidates.

## q4: welcome email

- Trigger: a Hangfire recurring job `schedule-pending-welcome-emails`, `Cron.Hourly`, registered in
  `api/ElBaul.Api/Program.cs`, calls `WelcomeEmailManager.SchedulePendingWelcomeEmailsAsync`
  (`api/ElBaul.Core/Notifications/Application/WelcomeEmailManager.cs`). It is gated by
  `WelcomeEmailsEnabled` (Unleash flag `elbaul.welcome-emails-enabled`) and picks users registered
  before `now - EligibilityDelay` with no `EmailType.Welcome` sent yet.
- Scheduling: `IBackgroundJobScheduler.EnqueueWelcomeEmail` →
  `api/ElBaul.Infra/HangfireBackgroundJobScheduler.cs` enqueues `EmailJobs.SendWelcomeEmailAsync`
  (`api/ElBaul.Infra/Emails/EmailJobs.cs`) → `WelcomeEmailManager.SendWelcomeEmailAsync`, which
  re-checks eligibility and dedupes on `welcome:{userId}`.
- Rendering: `api/ElBaul.Infra/Emails/EmailTemplateRenderer.cs` `RenderWelcome` picks
  `WelcomeWithBaulesEmail` or `WelcomeEmail` by `model.HasBaules`, templates in
  `api/ElBaul.Infra/Emails/Templates/*.sbnhtml`/`*.sbntxt`.
- Also: `AdminController` sends a test welcome email (`SendTestWelcomeEmailAsync`).

- Key points: hourly recurring job in `Program.cs`; Hangfire enqueue through `EmailJobs`;
  `EmailTemplateRenderer` with the two templates.

## q5: baúl deletion request

1. App: `app/src/features/baules/routes/RequestBaulDeletionRoute.tsx`, only for custodians
   (`getBaulPermissions(baul).canRequestBaulDeletion` = `isCustodio`, `app/src/utils/roleUtils.ts`),
   calls `api.support.submit('BaulDeletion', message)` and navigates back.
2. API: `POST /api/support`, `SupportController` → `SupportManager.SubmitAsync`, which validates the
   category (`BaulDeletion` is one of four), logs, and hands a `SupportSubmission` to `ISupportBackend`.
3. Infra: `LeadHubSupportBackend` POSTs it to an external LeadHub (`Support:LeadHub:SubmitUrl`).
   **Nothing deletes anything yet**: it is a support ticket, handled by a person.
4. Admin: an operator opens the baúl in `admin/src/features/baules/components/BaulDetailRoute.tsx`,
   confirms in `ConfirmDeleteBaulModal`, `useBaulesStore.deleteBaul` → `DELETE /api/admin/baules/{id}`
   (`AdminController`, `AdminOnly`) → `AdminManager.DeleteBaulAsync` →
   `IAdminBaulDeletionRepository.DeleteBaulGraphAsync` (`Infra/Persistence/AdminBaulDeletionRepository.cs`),
   a hard delete in one transaction in FK-safe order (tags, relationships, shared links, TV sessions,
   recuerdos, photos, chapters, personas, removal requests, baúl).

- Key points: the request is a support ticket to LeadHub, not a deletion; the actual delete is a
  manual admin action through `AdminManager.DeleteBaulAsync`.
- Bonus: the hard delete removes DB rows only; no photo storage cleanup is visible in that path.
