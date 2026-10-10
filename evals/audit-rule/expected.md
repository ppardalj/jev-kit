# Expected answers

el-baul at `1a4ddca3`, written before reading any session's answer.

## a1: controllers that aren't thin adapters

Rule, `docs/architecture/backend.md` "Controllers": one per resource area, each handler delegates to an
input port and maps the `Result`; no domain logic, no direct dependency on infrastructure; the
caller's identity is never a parameter.

- Key points: `EmailOpenController`, `EmailTrackingController` and `PushNotificationOpenController`
  inject repositories (`ISentEmailRepository`, `IEmailLinkClickRepository`,
  `ISentPushNotificationRepository`) and `IClock` and write tracking rows themselves, with no input port.
- Bonus: `PhotosController.MarkUploaderSeenAsync` orchestrates a second manager call
  (`baulFeedManager.MarkBaulSeenAsync`) after an upload; `AdminController` builds the external tools
  list from `IConfiguration`; `AppConfigController` reads `IConfiguration` directly next to
  `IAppConfiguration` and hardcodes `baulFeedEnabled`; `SharedLinksController` and
  `PersonaInvitesController` render HTML landing pages inline (arguably still HTTP adaptation).

## a2: design-system pieces tied to a feature

Rule, `docs/adr/0002-design-system-taxonomy.md` litmus test and its refinement: a reusable visual
mechanism goes in Components or Patterns; something hardcoded, copy and all, to one domain action or
workflow goes in Features, even with a clean type signature. The ADR also says `design-system/` need
not be independent of the product domain.

- Key points: `components/data-display/Badges.tsx` `RoleBadge` (takes `BaulRole`, uses
  `getRoleDisplayName` from `@/utils/roleUtils`, custodio override) and
  `components/feedback/AccessDeniedScreen.tsx` (hardcoded baúl copy, "Volver a mis baúles") as the
  strongest candidates.
- Arguable: `ChatBubble` (types its role from `ChatMessage`), `ChapterBadge`/`PersonBadge` (domain
  names, primitive props).
- Not breaks: `FeedCardHeader` (deliberately shared by two features), `PartialDatePicker`/`DateModal`
  (`PhotoDate` is the ADR's own allowed value type), `PhotoCropStep`.
