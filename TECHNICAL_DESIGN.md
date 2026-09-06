# GSoC Contributor Copilot — Technical Design (V1)

Status: proposed only. This document creates no application code, dependencies,
migrations, or runtime architecture.

## Assumptions

- V1 covers GitHub.com public repositories and public GSoC information. Private
  repository analysis is out of scope.
- A visitor can analyze a public username; sign-in is required for a saved
  journey, chat history, and refreshes under the user's GitHub rate limit.
- GSoC has no assumed complete public machine-readable catalog API. Catalog
  facts are curated/imported from official current-cycle and organization sources.
- The first deploy is a modular monolith with PostgreSQL and scheduled jobs.
  Queues, Redis, and microservices are deferred.
- GSoC is a generic `Program`; later programs use the same catalog, matching,
  and tracking abstractions.

## 1. Architecture and data flow

Use React/Vite as a browser client and a Node/Express TypeScript API. The API is
the only layer with access to PostgreSQL, GitHub credentials, Groq, webhooks, and
source ingestion. Prisma is infrastructure, not an API contract.

```text
React client
  -> Express API: auth, validation, feature modules
      -> PostgreSQL/Prisma: system of record
      -> GitHub gateway: OAuth, REST, GraphQL, rate-aware cache
      -> catalog ingestion + admin review
      -> deterministic matching service
      -> tracking reconciler + optional GitHub App webhook receiver
      -> LLM interface -> Groq adapter
```

Flows:

1. OAuth callback upserts the user, encrypted credential, and session. A profile
   sync collects bounded public profile/repository/language/topic/activity
   signals, derives versioned skill evidence, and triggers matching.
2. An administrator imports or verifies a cycle, organization, projects,
   repositories, and links. Each sourced fact has provenance; derived tags are
   stored separately.
3. The issue synchronizer imports candidates from catalog repositories only.
   Matching compares persisted profile evidence and verified catalog metadata,
   writing reproducible recommendation snapshots with factor explanations.
4. The user saves an issue/project. A reconciler reads the relevant public issue
   and PR state, normalizes it to a journey state, and retains raw observations.
   Webhooks accelerate this only for repositories that installed a GitHub App.
5. Chat receives compact, authorized source cards plus profile and recommendation
   data. It answers only from supplied context; it cannot create source facts,
   alter scores, or change tracking status.

Define adapter ports: `GitHubClient`, `CatalogSource`, and `LlmClient`.
Domain/application code depends on these interfaces, never SDK/Prisma types.

## 2–3. PostgreSQL model and relationships

Use UUID internal IDs, GitHub numeric/node IDs as unique external IDs, and
`timestamptz` for every time. Use `jsonb` for an evidence payload or raw
fragment only; fields used to filter, join, or score are first-class columns.

| Table | Fields and relationship/constraints |
| --- | --- |
| `users` | `id, github_user_id, github_node_id, login, display fields, profile_visibility, last_profile_sync_at`. Unique GitHub ID and lower-cased login; one-to-many sessions, evidence, runs, saved targets, contributions, chats. Index sync time. |
| `oauth_credentials` | `user_id, provider, encrypted_access_token, encrypted_refresh_token, scopes, expires_at, revoked_at`. One active credential per user/provider (unique). |
| `sessions` | `user_id, token_digest, expires_at, revoked_at`. Many-to-one user; unique digest, index user/expiry. |
| `programs` | `slug, name, website_url`; unique slug. Generic parent for GSoC/Hacktoberfest. |
| `program_cycles` | `program_id, year, dates, status, official_url`; unique `(program_id, year)`. One program/many cycles. |
| `organizations` | `slug, name, description, website_url, github_org_login?`; unique slug and non-null GitHub login. Long-lived community identity. |
| `organization_participations` | `organization_id, program_cycle_id, status, official_listing_url, source_status`; unique pair, index cycle/status. This is the many-to-many join because an organization can participate in many cycles. |
| `projects` | `participation_id, title, description, size, proposal_url, status, source_status`; one participation/many yearly project ideas; unique normalized title within participation. |
| `repositories` | `github_repository_id, owner_login, name, url, default_branch, language_metrics, archived, last_synced_at`; unique GitHub ID and owner/name; indexes active and sync time. |
| `organization_repositories`, `project_repositories` | Composite primary key target/repository plus `role, source_id`. Many-to-many: a repository can support multiple projects, and each project can have several repositories. |
| `skills` | `slug, name, category`; controlled vocabulary, unique slug. |
| `profile_skill_evidence` | `user_id, skill_id, source_type, source_ref, weight, observed_at, detail`. Many-to-many user/skill with multiple evidence records; unique user/skill/source/ref, index user/skill. |
| `project_skill_tags`, `repository_skill_tags`, `organization_skill_tags` | Explicit joins (not polymorphic): target/skill, `kind, weight, provenance`, unique target/skill/kind. Keeps real foreign keys and Prisma relations. |
| `sources` | `url, publisher, source_type, retrieved_at, content_hash, reliability_tier`; unique URL/content hash. |
| `fact_assertions` | `source_id, entity_type, entity_id, field, value, observed_at, confidence, verification_state`. Index entity/field/newest. History remains even when canonical fields change. |
| `issue_snapshots` | `repository_id, github_issue_id, number, title, body_excerpt, state, labels, assignees, counts, timestamps, last_synced_at`. Unique repository/GitHub ID and repository/number; index repository/state/updated and GIN labels. |
| `recommendation_runs` | `user_id, algorithm_version, profile_snapshot_hash, created_at`; index user/newest. |
| `recommendations` | `run_id, target_type, target_id, score, rank, factor_breakdown, explanation`; unique run/target, index run/rank. Snapshot, not fact. |
| `saved_projects`, `saved_issues`, `saved_organizations` | User/target pairs plus date/note. Use separate tables in V1 to preserve FK integrity; unique each pair. |
| `contributions` | `user_id, repository_id, issue_snapshot_id?, github_pr_id?, github_pr_number?, kind, current_state, url, first_seen_at, last_synced_at`. One user/many contributions; unique user/repository/GitHub PR when present, index user/state/sync time. |
| `contribution_events` | `contribution_id, provider_event_id?, type, occurred_at, payload_subset`. Immutable many-to-one history; unique non-null provider event ID, index contribution/time. |
| `sync_runs` | job type/scope/status/cursor/timestamps/error; index job/status/start. |
| `webhook_deliveries` | provider delivery ID/event/received/processed/signature-valid/status/payload hash; unique delivery ID. Avoid retaining raw payload unless needed. |
| `chat_threads`, `chat_messages` | User/thread metadata; role/content/model/source citations/token use. One thread/many messages; index thread/time and a defined retention policy. |

The central extensibility seam is
`Program -> ProgramCycle <- OrganizationParticipation -> Organization`.
A project belongs to a yearly participation, not directly to an organization,
because its content changes by cycle.

## 4–5. Sources and freshness

| Source | Purpose | Storage rule |
| --- | --- | --- |
| Official GSoC pages/current cycle lists and organization-owned ideas pages | Participation, projects, deadlines | Normalize and persist with URL, retrieved time, verification status. Older sources mean history, never current participation. |
| Organization sites, repos, CONTRIBUTING/docs, verified channels | Repositories, languages, rules, communication | Persist attributable assertions and periodically refresh. Do not infer mentors from arbitrary collaborators. |
| GitHub REST | OAuth identity, simple resource lookup, issues/PRs | Dynamic for refresh/live views; normalized snapshots persisted for matching/dashboard. |
| GitHub GraphQL | Bounded batched languages/topics/review requests | Selective profile/repository queries; persist derived evidence/snapshots. |
| GitHub webhooks | Fast state updates on GitHub App-installed repositories | Persist validated delivery/event; no claim of coverage elsewhere. |
| Groq | Explanations, structured profile summary, chat | Request-time result only; minimal consented chat/audit persistence. Never a catalog source. |

Persist catalog facts and snapshots for repeatability, search, explanation, and
rate-limit control. Fetch live data for explicit refreshes, tracking, and data
older than its TTL. A stale/unknown label is preferable to invented metadata.

## 6. Matching V1

Exclude archived/inactive repositories, expired cycles, projects without verified
sources, closed issues, and issues assigned to another person. Do not exclude an
unlabelled issue merely for missing metadata.

| Factor | Weight | Calculation |
| --- | ---: | --- |
| Skill alignment | 35 | Weighted overlap of user evidence and verified project/repository tags. Non-fork repository language evidence exceeds topic/README evidence. |
| Contribution fit | 20 | Explicit newcomer/help labels, clear criteria, unassigned state, issue size/complexity indicators. Missing label is neutral. |
| Activity/maintainability | 15 | Recent commits, issue/PR response, and non-archived state in explicit windows; sparse data lowers confidence. |
| Program/project fit | 15 | Verified current project, domain/scope tags, selected size preference, current official participation. |
| Prior affinity | 10 | Existing public contributions/follows/relevant stack evidence; cap it to limit popularity bias. |
| Accessibility | 5 | Verified contribution guide, code of conduct, templates/onboarding docs, channel. |

Scores are 0–100, and retain factor values, source IDs, algorithm version, and
plain-language explanations. Preferences are transparent filters/bonuses.
Recompute only on profile/catalog change or explicit refresh.

## 7. Contribution tracking state machine

Raw events are immutable; displayed state is a reducer result. A manual saved
item is not GitHub confirmation. A PR can move from changes requested back to
open after new commits.

| State | Exact observable evidence |
| --- | --- |
| `INTERESTED` | User saves a sourced issue/project; user-declared. |
| `ISSUE_ASSIGNED` | `issues.assigned` webhook with matching assignee, or current issue API assignees include user. |
| `PR_OPEN` | PR author equals user and current PR is open; `pull_request.opened/reopened` can accelerate. Issue link requires closing-keyword evidence or user confirmation, never title similarity. |
| `REVIEW_REQUESTED` | Current REST/GraphQL requested reviewers/review requests non-empty; `pull_request.review_requested` when available. |
| `CHANGES_REQUESTED` | Latest effective submitted review has `CHANGES_REQUESTED`; review comments alone do not prove it. |
| `APPROVED` | Non-dismissed submitted `APPROVED` review exists and PR remains open/unmerged; resync since approvals can change. |
| `MERGED` | `merged_at` exists / merged PR state; `pull_request.closed` with merged flag corroborates. |
| `CLOSED_UNMERGED` | PR closed and `merged_at` null; preserve it because it may reopen. |
| `ISSUE_CLOSED` | Tracked issue closed without linked tracked merged PR. |

GitHub documents separate `issues`, `pull_request`,
`pull_request_review`, and review-comment webhook families, including
`issues.assigned`; do not conflate them. Poll saved public objects for all
repositories without an app installation. [GitHub webhook events](https://docs.github.com/en/webhooks/webhook-events-and-payloads)

## 8. Logic allocation

- **Deterministic:** authorization, sourced-fact gates, scoring, filters,
  GitHub-state reduction, pagination, retention.
- **Heuristics:** technology parsing, organization-specific label synonyms,
  activity health. Attach confidence; never present them as facts.
- **Embeddings, later:** semantic project/chat retrieval only after choosing a
  provider and vector storage. V1 uses tags plus PostgreSQL full-text search.
- **LLM:** profile interpretation, readable score explanation, sourced
  question-answering, suggested tags for human review. It cannot establish
  facts, independently rank, or mutate state.

## 9. Groq integration

Expose `LlmClient.generateAnswer(context, message)` and
`generateStructuredProfileSummary(evidence)`. The Groq adapter owns an
environment model allow-list, timeout, redaction, retry/backoff, usage telemetry,
response schema validation, bounded concurrency, and per-user quotas. API
controllers receive domain DTOs, enabling future provider replacement.

Use a backend-only `GROQ_API_KEY`. For structured summaries use strict JSON
Schema on a currently supported production model and validate again server-side;
the output is untrusted derived metadata. Groq currently documents strict output
support for `openai/gpt-oss-20b`/120b; 20b is a sensible cost-oriented default,
but live availability and pricing must be verified at deployment.
[Models](https://console.groq.com/docs/models) and
[structured outputs](https://console.groq.com/docs/structured-outputs?form=MG0AV3)

The context builder supplies compact authorized source cards, recommendation
factors, and relevant profile evidence. Require answers to cite those cards;
do not use provider web search. Never send OAuth tokens, private data, or
unneeded raw issue/PR text. Handle 429 using `retry-after`; Groq limits vary by
account and expose response headers. [Rate limits](https://console.groq.com/docs/rate-limits)

## 10. Authentication and security

- Use GitHub OAuth authorization code flow, `state`, PKCE where supported,
  exact allow-listed callback URL, one-time server-held state, and cookie session
  (`HttpOnly`, `Secure`, appropriate `SameSite`). Never put access tokens in
  the SPA/local storage.
- Request only `read:user`. Add `user:email` only if needed. Public catalog
  does not need `repo`; do not request it in V1 because it grants broad
  private/public repository access. [OAuth scopes](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps)
- Encrypt provider tokens at rest with envelope encryption/KMS; keep only
  fingerprint/metadata with ciphertext. Rotate keys, support revoke/disconnect
  and deletion, and never log tokens or raw auth headers.
- Validate all requests, enforce ownership, use CSRF protection for cookie
  mutations, CORS allow-listing, CSP/security headers, and endpoint/chat limits.
- Preserve raw webhook bytes, constant-time HMAC verify before parsing/queueing,
  deduplicate delivery IDs, acknowledge fast, and process idempotently.
  [Webhook validation](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries)

## 11. GitHub limits, caching, synchronization

Use REST for simple lookups and GraphQL for bounded aggregate reads. Page every
collection. Keep GraphQL `first/last <=100`, shallow, and far below 500,000
nodes. Request only needed fields. [GraphQL limits](https://docs.github.com/en/graphql/overview/rate-limits-and-query-limits-for-the-graphql-api)

Authenticated REST has a 5,000/hour baseline and user GraphQL a 5,000
points/hour baseline; unauthenticated REST is 60/hour. Search and secondary
limits are stricter. Read response headers, bound concurrency, obey
`retry-after`, add exponential jitter, and defer until reset.
[REST limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)

Initial TTL targets: profile 24h (manual refresh throttled); current-season
catalog 24h/otherwise 7d; issue discovery 6h; open tracked PR 15m; terminal
item 24h. Use ETag/Last-Modified conditionals where possible.

Create idempotent scheduled jobs for catalog refresh, repository/issue refresh,
profile sync, and contribution reconciliation. Start with a DB-backed jobs table
and row claims; add Redis/BullMQ only under measured need. Webhooks are an
optimization, not a replacement for periodic reconciliation.

## 12. Data quality

Every assertion carries URL, publisher, retrieval time, extraction method,
content hash, verification state, and confidence. States are `verified`,
`reported`, `inferred`, `stale`, and `unknown`. Only verified current-cycle
facts may be shown as current participation. Conflicts enter admin review;
source history is never overwritten.

Project pages move, labels vary, activity is seasonal, and “good first issue”
does not guarantee availability or difficulty. Surface source and checked time,
reduce/omit uncertain scoring factors, and give users a stale-data report path.

## 13. Folder structure

```text
apps/
  web/src/{app,features,components,lib,styles}
  api/
    src/{config,http,modules,domain,application,infrastructure,jobs,webhooks}
    src/modules/{auth,profile,catalog,matching,discovery,tracking,chat}
    prisma/
packages/
  contracts/       # versioned request/response DTOs only
docs/
```

Keep each API feature's route/controller, request schema, use cases, repository
interface, and tests together. Infrastructure adapters remain separate. Never
send Prisma model types to the browser.

## 14. Local development

Choose active-LTS Node, npm workspaces (unless a deliberate alternative wins),
strict TypeScript, ESLint, Prettier, Vitest, and Playwright later for critical
flows. Docker Compose runs a pinned PostgreSQL only; API/web run natively. Use
Prisma Studio locally, separate dev/prod databases, future committed migrations,
and a lockfile.

Later, `.env.example` lists names only: database URL, GitHub client
ID/secret/callback, session secret, encryption key, webhook secret, Groq key and
model, and app/API URLs. CI: typecheck, lint, tests against ephemeral Postgres,
build, audit; mock GitHub/Groq by default.

## 15. Small, testable milestones

1. Foundation: workspace, empty web/API, strict TS, lint/format, env validation,
   local Postgres. Verify clean checkout checks plus API health.
2. Catalog data base: Prisma schema for users/sessions/program/catalog/provenance,
   migration and fixture seed. Verify constraints/reseed tests.
3. Catalog read path: curated import, assertions, browse API/UI. Verify only
   verified current data appears with source links.
4. GitHub onboarding: OAuth/username preview, encrypted tokens, rate-aware sync,
   skills view. Verify mocked OAuth, pagination, token revocation/no token leak.
5. Matching: versioned deterministic scorer and explanation snapshots. Verify
   exact rankings/scores on fixed fixtures.
6. Issue discovery: catalog-repository sync, filters, save intent. Verify
   closed/assigned/archived handling, pagination/retry.
7. Journey dashboard: state reducer, poller, event history. Verify state matrix,
   idempotence, reopen, dismissed-review cases.
8. Webhook acceleration: GitHub App install and secure delivery receiver. Verify
   signature, duplicates, out-of-order delivery, polling fallback.
9. Groq chat: isolated adapter, context/citations, quota/redaction. Verify schema
   validation, retrieval authorization, provider failure.
10. Production readiness: observability, backup, deletion/export, deployment,
    security and rate-limit/load checks.

## 16. Assumptions to validate first

1. Confirm current GSoC catalog/project source availability, rights, stability,
   and whether manual curation is sufficient; begin with a small verified set.
2. Confirm GitHub App installation is realistic for target organizations. Without
   it, explicitly scope tracking to polling saved public issue/PR URLs.
3. Confirm `read:user` supplies enough public profile data and test OAuth
   consent conversion before seeking any additional scope.
4. Evaluate recommendations on a small mentor/contributor-labelled set before
   calling them useful; protect against language-popularity bias.
5. Measure how often target repositories offer usable beginner labels/activity
   data. Never guarantee that an issue is beginner-appropriate.
6. Validate Groq production model availability, spend, privacy/retention terms,
   strict-schema behavior, and latency before committing to it.
7. Prototype DB-backed scheduled jobs and deployment early; add operational
   components only in response to a concrete constraint.

