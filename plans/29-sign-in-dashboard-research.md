# #29 sign-in and dashboard (Better Auth): research

Researcher, 2026-10-30. Branch `feat/29-sign-in-dashboard`, tier PROJECT (the issue carries the label
`tier:task`; the orchestrator chose PROJECT). Library facts were read from the published package source
(`npm pack better-auth@1.7.14 @better-auth/core@1.7.14 @better-auth/drizzle-adapter@1.7.14
@better-auth/telemetry@1.7.14 auth@1.7.14`, unpacked outside the repo) and from the official docs. File and
line references `dist/...` are inside those tarballs.

## Findings

### 1. Better Auth version and packages
- Fact: `better-auth` `latest` = **1.7.14** (npm, `time.modified` 2026-10-27). Other tags: `beta` 1.8.0-beta.3,
  `release-1.6` 1.6.33. Its own dependencies include `@better-auth/drizzle-adapter` 1.7.14 (the adapter is
  bundled, import `better-auth/adapters/drizzle`), `@better-auth/telemetry` 1.7.14, `zod ^4.5.4`, `jose`,
  `kysely`.
- Fact: peers (all optional): `next ^14 || ^15 || ^16`, `react ^18 || ^19`, `drizzle-orm ^0.45.2 || >=1.0.0-rc.1
  <2.0.0`, `drizzle-kit >=0.31.4`, `pg ^8`. Our `next 16.4.3`, `react 19.3.1`, `drizzle-orm ^0.45.4`,
  `drizzle-kit ^0.31.11`, `pg ^8.23.1` all fit.
- Fact: the CLI is the npm package **`auth`** 1.7.14 ("The CLI for Better Auth"), so ADR-0007's `npx auth
  generate` is the right command; `@better-auth/cli` is stale at 1.4.21. Error messages in the adapter say
  `npx auth@latest generate`.
- Fact: telemetry is **off by default**: enabled only by `telemetry.enabled: true` or
  `BETTER_AUTH_TELEMETRY=1` (`@better-auth/telemetry dist/index.mjs:362-363`).
- Source: `npm view better-auth`, `npm view auth`, tarballs above.
- Implication: pin `better-auth` 1.7.x; `drizzle-orm` must resolve to the same copy in `apps/web` and
  `@academy/db` (the adapter has it as a peer and `apps/web` does not depend on it today), so the architect
  decides whether `apps/web` adds `drizzle-orm` at `@academy/db`'s range or the auth instance lives in
  `@academy/db`.

### 2. Next.js 16 App Router integration
- Route handler: `app/api/auth/[...all]/route.ts`, `export const { GET, POST } = toNextJsHandler(auth)` from
  `better-auth/next-js` (`toNextJsHandler` returns GET, POST, PATCH, PUT, DELETE, all the same handler;
  `dist/integrations/next-js.mjs`). Docs: https://www.better-auth.com/docs/integrations/next
- `nextCookies()` (same import): needed when `auth.api.signInEmail` / `signOut` run inside a **server action**,
  otherwise the `Set-Cookie` of the API call never reaches the browser. It must be the **last** plugin (a
  runtime warning `warnIfCookiePluginNotLast` fires otherwise). In an RSC render it skips the session refresh
  (RSC cannot set cookies), so a session's `expiresAt` is only extended by a server action or route handler.
- Server-side session: `await auth.api.getSession({ headers: await headers() })` returns `{ session, user }` or
  `null`. With a database configured the cookie cache is **off by default** (it is forced on only for
  stateless setups, `dist/context/create-context.mjs:47-53`), so every `getSession` is a DB read of the
  `session` row: a real check.
- Next 16: `middleware.ts` is renamed `proxy.ts` with `export function proxy`; proxy **always runs on the
  Node.js runtime** and a `runtime` export is an error in production builds (Next docs, upgrading/version-16
  and file-conventions/proxy, via Context7 `/vercel/next.js`). So `auth.api.getSession` can run in proxy.
- Better Auth's recommendation (docs page above): use proxy only for **optimistic redirects** and check the
  session in each page/route with `auth.api.getSession`. `getSessionCookie(request)` from
  `better-auth/cookies` "only checks for the existence of a session cookie; it does not validate it" (docs
  warning): anyone can set a cookie by hand, so a cookie-only check is not authorization. Source code
  agrees: `getSessionCookie` only parses `better-auth.session_token` / `__Secure-better-auth.session_token`
  (`dist/cookies/index.mjs:263-272`).
- Next.js's own guidance (docs `guides/authentication.mdx`, `file-conventions/proxy.mdx`): do not rely on proxy
  alone; a matcher change silently removes coverage, server functions are POSTs to the page route and are
  skipped by a matcher that skips the page; **layouts do not re-render on client navigation**, so a check in a
  layout is not a per-route check. Recommended: a Data Access Layer `verifySession()` memoised with React
  `cache`, called from pages, server actions and route handlers.
- Implication: two layers. (a) `proxy.ts` (Node) for the redirect `/sign-in?next=<path+query>` on every
  route except `/sign-in`, `/api/auth/*` and static assets; it is where the full URL with `?tab=` is
  available for `next` (design: `ia.md` "Return after sign-in"). (b) A `requireSession()` in the DAL, called
  by every protected page, server action and route handler. #30's lesson page does not exist yet, so the
  acceptance item "a lesson cannot be opened without signing in" is met by (a) covering every path by default
  plus an e2e request to a lesson URL (it redirects to sign-in before 404 handling), and #30 inherits
  (b). Architect: say this explicitly, otherwise the AC is untestable in #29.

### 3. Drizzle adapter, tables and mapping to ADR-0007 `users`
- Fact: the adapter resolves a model by `schema[modelName]` (`drizzle-adapter dist/index.mjs:59-64`).
  `modelName` is the BA model (`user`), or `user.modelName` from options, or with `usePlural: true` the plural
  (`users`). `usePlural` applies to **every** model (`sessions`, `accounts`, `verifications`).
- Fact: `drizzle(pool)` in `packages/db/src/client.ts` is created **without a schema**, so `db._.fullSchema`
  is empty: the adapter needs `schema` passed explicitly (`drizzleAdapter(db, { provider: "pg", schema,
  usePlural? })`), else it throws "Schema not found". `db.query` (relational API) is not used; ADR-0007 item 1
  forbids relations, and the adapter falls back to plain queries when `db.query` has no model
  (`getQueryModel` returns null).
- Fact: field mapping: the adapter looks up `schema[fieldName]` where `fieldName` is BA's field name or the
  `fields` override, i.e. the **Drizzle property key**, not the SQL column (`dist/index.mjs:255-266`). Our
  `users` keys are `id, name, email, emailVerified, image, createdAt, updatedAt`, exactly BA's core user
  field names (`@better-auth/core dist/db/get-tables.mjs:150-190`); SQL names are snake_case. So **no `fields`
  override is needed** for `users`; the snake_case SQL names are invisible to BA.
- Fact: BA core tables and fields (1.7.14, `get-tables.mjs`):
  - `user`: name (string, req), email (string, unique, req), emailVerified (bool, default false, req), image
    (string, opt), createdAt (date, default now, req), updatedAt (date, default now, req, onUpdate).
  - `session`: expiresAt (date, req), token (string, **unique**, req), createdAt, updatedAt, ipAddress (opt),
    userAgent (opt), userId (string, references user.id **onDelete cascade**, req, **index**).
  - `account`: accountId (req), providerId (req), userId (references user.id, cascade, req, index), accessToken,
    refreshToken, idToken, accessTokenExpiresAt, refreshTokenExpiresAt, scope, password (all opt), createdAt,
    updatedAt (req). The email/password credential is an `account` row with `providerId = "credential"`,
    `accountId = user.id`, `password = <hash>`.
  - `verification`: identifier (req, index), value (req), expiresAt (req), createdAt, updatedAt (req). Used by
    email verification / reset flows; not used by #29's flows, but the adapter and `auth generate` expect it.
  - `rateLimit` table only when `rateLimit.storage: "database"` (default storage is memory, see 6).
- Fact: `npx auth generate` for Drizzle pg (generator `generate-drizzle-schema-*.mjs`): `text('id').primaryKey()`
  ids; column names **converted to snake_case** unless `camelCase: true` (lines 7-8, 66, 153); dates as
  `timestamp('<name>')` **without** `withTimezone`; `defaultNow()` on default-now dates; `.$onUpdate` on
  updatedAt; FK `.references(..., { onDelete: 'cascade' })`; unnamed/auto-named indexes; with
  `generateId: "uuid"` it emits `uuid("id").default(sql\`pg_catalog.gen_random_uuid()\`)` (a `uuid` type, not
  ADR-0007's `text`).
- Fact: at startup BA runs a **static schema check** of the Drizzle schema object against its expected
  fields (`validateSchema` defaults on; `@better-auth/core dist/db/schema-check.mjs:7-9`; adapter
  `schema-check-*.mjs` uses `diffSchema`) and logs a `SchemaMismatchError` message at error level. It does
  not touch the DB.
- Implication for ADR-0007 item 2 "check that `npx auth generate` agrees": the generator will **not** match
  `users` byte for byte: it differs in timestamps (no time zone vs our `timestamptz`), constraint/index names
  (ours are all named, ADR-0007 item 6), the `users_id_check`, and `$onUpdate`. Property keys and column
  names agree. Recommendation for the architect: run the generator once into a temp file (never into
  `packages/db/src`) as evidence, write `session`/`account`/`verification` by hand in `schema.ts` in the
  ADR-0007 style (named constraints, explicit snake_case, `timestamptz`, FKs `ON DELETE CASCADE` per item 6),
  generate the migration with `db:generate`, and use BA's startup schema check (plus a unit/integration test
  that `auth.$context` resolves with no schema problems) as the automated proof of the mapping.
- Implication: table naming is a choice (open question 4): `usePlural: true` with `users`, `sessions`,
  `accounts`, `verifications` keeps one convention; or singular `session`/`account`/`verification` with
  `user: { modelName: "users" }`.

### 4. Id generation (ADR-0007 item 2)
- Fact: default `generateId(size)` (32-char random string) unless `advanced.database.generateId` is a
  function, `"uuid"` (`crypto.randomUUID()` in the app), `"serial"` or `false` (`create-context.mjs:117-129`).
- Implication: the default generator fits `users.id text`, non-empty, no DB default: nothing to change. With
  `"uuid"` the app still generates the id (`crypto.randomUUID()`), so no DB default is needed at runtime;
  only `auth generate` would emit a `uuid` column with `gen_random_uuid()`, which contradicts ADR-0007's
  `text`. Recommendation: keep the default; ADR-0007 item 2's "whether a DB default is then needed" resolves
  to "no, not with the default".

### 5. Email case (ADR-0007 item 2)
- Fact: BA **lowercases email** on sign-up (`dist/api/routes/sign-up.mjs:158`), on sign-in lookup
  (`sign-in.mjs:317`), and in the internal adapter on create, update and find (`dist/db/internal-adapter.mjs`
  lines 127, 146, 587, 619, 632, 635). The docs page does not mention it (verified only in source).
- Implication: every write through BA stores lowercase, so the case-sensitive `users_email_unique` cannot hold
  two case variants written by BA. A row inserted around BA (a seed doing raw SQL) could. Options: keep the
  constraint and make the seed go through BA (recommended), or add `CHECK (email = lower(email))` as defence
  in depth (an additive migration, ADR-0007 item 10). A `lower(email)` unique index is not required.

### 6. Passwords, rate limiting, sessions (defaults in 1.7.14)
- Hashing: **scrypt** via `@better-auth/utils/password` (`node:crypto` scrypt on Node; `dist/crypto/password.mjs`).
  Docs: https://www.better-auth.com/docs/authentication/email-password (scrypt, OWASP rationale; custom
  `password.hash/verify` possible).
- Length: `minPasswordLength` 8, `maxPasswordLength` 128 (`create-context.mjs:186-187`). Sign-in checks only
  the max; sign-up checks both.
- Sign-in with an unknown email still hashes the password (timing equalisation) and returns the same
  `INVALID_EMAIL_OR_PASSWORD` (401) as a wrong password (`sign-in.mjs:318-336`).
- Rate limiting (`create-context.mjs:170-176`, `dist/api/rate-limiter/index.mjs`):
  - `enabled` defaults to **`NODE_ENV === "production"`**: on in the compose image (`NODE_ENV=production`,
    Dockerfile), **off in `pnpm dev`**.
  - Global default 100 requests / 10 s; special rule for paths starting `/sign-in`, `/sign-up`,
    `/change-password`, `/change-email`: **3 requests per 10 s** per IP+path (`getDefaultSpecialRules`).
  - Storage `memory` by default (per process, lost on restart; 100 000-entry cap).
  - Response: HTTP **429** with `X-Retry-After` seconds.
  - Applies to HTTP requests through the handler (`onRequestRateLimit`). A server action calling
    `auth.api.signInEmail` without a `Request` object: could not verify whether the limiter runs; the
    architect must not assume it does (see risk R3).
  - Client IP: header `x-forwarded-for` by default; a single value is trusted when no `trustedProxies` is set;
    in dev/test it falls back to 127.0.0.1; in production with no IP it uses one shared bucket per path and
    warns once. Next.js 16.4.3 sets `x-forwarded-for ??= socket.remoteAddress` (`next/dist/server/base-server.js:601`),
    so behind Docker's port mapping every browser shares the bridge gateway address (one bucket, fine for one
    user), and a client-supplied `X-Forwarded-For` is passed through, so the limit can be dodged by rotating
    the header (loopback-only stack: accepted residual, state it).
- Sessions: `expiresIn` 604 800 s (7 days), `updateAge` 86 400 s (1 day: extended when used after a day),
  `freshAge` 1 day (`create-context.mjs:150-153`). This matches `design/flows/auth.md` F1 "7 days, extended on
  use".
- Cookies (`dist/cookies/index.mjs:20-44`): name `better-auth.session_token`, `httpOnly`, `sameSite=lax`,
  `path=/`. `Secure` and the `__Secure-` prefix are on when `advanced.useSecureCookies` is true, or the base
  URL starts with `https://`, or (no base URL configured) `NODE_ENV=production`. The compose stack is plain
  HTTP on 127.0.0.1: with no `BETTER_AUTH_URL` the image would set `__Secure-` cookies over http. Chromium
  treats 127.0.0.1/localhost as secure contexts; whether it accepts a `__Secure-` cookie from
  http://127.0.0.1 could not verify without a live run. Setting `BETTER_AUTH_URL=http://...` turns the prefix
  off deterministically.

### 7. Secrets and base URL
- Secret resolution (`create-context.mjs:70-82`): `options.secret` > `BETTER_AUTH_SECRET` > **`AUTH_SECRET`** >
  built-in default `better-auth-secret-12345678901234567890`. `BETTER_AUTH_SECRETS` (versioned list
  `"<version>:<secret>"`) enables rotation.
- What happens if missing (`validateSecret`, lines 39-45): **production** (`NODE_ENV=production`) with the
  default throws `BetterAuthError`; **development** silently uses the public default secret (only a
  low-entropy warning); test env skips validation. Shorter than 32 chars or low entropy: warnings only.
- The context is created **eagerly** when `betterAuth()` is called (`dist/auth/base.mjs:9`), not on the first
  request. So module-level `betterAuth()` runs during `next build` page-data collection
  (`NODE_ENV=production`, no secret, no `DATABASE_URL` in CI's `pnpm build` and in the Docker build stage),
  and `createDb(undefined)` throws `InvalidConnectionStringError` synchronously at import.
- Base URL: `baseURL` option or `BETTER_AUTH_URL`; if absent, BA warns and derives it per request from the
  request (`base.mjs` handler). Trusted origins = base URL origin + `trustedOrigins` + `BETTER_AUTH_TRUSTED_ORIGINS`
  (comma list) (`dist/context/helpers.mjs:60-85`).
- Today: `.env.example` has `# AUTH_SECRET=change-me` (commented, from #1); `docker-compose.yml` passes web's
  env explicitly (`environment:` with only `DATABASE_URL`, "never env_file"); CI's e2e job runs
  `cp .env.example .env`; `turbo.json` dev `passThroughEnv: ["DATABASE_URL", "PORT"]`, test:e2e
  `["E2E_BASE_URL"]`; `next.config.ts` loads the root `.env` into `process.env` for dev and build.
- Implication: (a) the app must fail fast itself when the secret is missing, in every env, because BA does not
  in dev; (b) auth and the pool must be created lazily (first request), not at module import, or the build
  breaks; (c) compose must pass `BETTER_AUTH_SECRET` (e.g. `${BETTER_AUTH_SECRET:?...}`) and the base URL
  explicitly; (d) `.env.example` drops `AUTH_SECRET` for `BETTER_AUTH_SECRET` (BA reads `AUTH_SECRET` too, so
  leaving the old name would be a silent second source); (e) CI's `cp .env.example .env` means whatever the
  example holds becomes CI's secret: either a clearly fake value the app refuses outside CI, or CI generates
  one (`openssl rand -base64 32`) before `compose up` (open question 6).

### 8. Seeding the local user
- Fact: `emailAndPassword.disableSignUp: true` makes `/sign-up/email` **and** `auth.api.signUpEmail` throw
  `EMAIL_PASSWORD_SIGN_UP_DISABLED` (the check is inside the endpoint, `sign-up.mjs:145`), so a seed cannot
  call `signUpEmail` on the app's own instance once sign-up is disabled.
- Supported building blocks: `auth.$context` (returned by `betterAuth`, `base.mjs`) exposes `password.hash`
  (scrypt) and `internalAdapter.createUser` / `createAccount` (lowercases email, generates the id), the same
  calls the sign-up route makes. `$context` is public on the instance but is not documented as a seeding API;
  treat it as semi-internal (pin the minor version, cover with a test).
- Alternatives: (a) a seed-only `betterAuth` instance with sign-up enabled, same DB and secret, calling
  `api.signUpEmail` (fully public API, but a second config that must not drift: build both from one options
  factory); (b) `$context` as above; (c) raw insert with a hash from `@better-auth/utils/password` (couples to
  the hash format; must lowercase email itself; least preferred).
- Design: there is **no sign-up page and no password reset** (`design/flows/auth.md`: "the seed creates the
  only user (#29, issue #50 excludes multi-user features)"; sign-in acceptance Purpose). So `disableSignUp:
  true` follows from the design; otherwise `POST /api/auth/sign-up/email` would let anyone on the machine
  create a second account.
- Idempotency: the seed should be re-runnable (user exists: do nothing or reset the password, a decision).
- Where it runs: the standalone image has no `tsx`, no `scripts/`, no dev deps (Dockerfile copies only
  `.next/standalone`, static, public, `packages/db/drizzle`). Options: run from the host with `pnpm` against
  `DATABASE_URL=...localhost:5432` (compose publishes `127.0.0.1:5432`), which is how CI can run it after
  `compose up`; or bundle a seed entry into the image. Credentials come from env (e.g. `SEED_EMAIL`,
  `SEED_PASSWORD`), never from code; the design's sample is `learner@example.com`.
- The "no user" hint (sign-in AC5) needs the server to know that **no user exists at all**; BA returns the
  same 401 for "no user" and "wrong password" by design. A server action that, after a 401, checks
  `SELECT EXISTS (SELECT 1 FROM users)` reveals only "the platform has no user yet", not whether a given email
  exists (consistent with `auth.md` F1's anti-enumeration rationale).

### 9. Sign-out and CSRF / origin protection
- Sign-out: `POST /sign-out` (`requireHeaders`), reads the signed session cookie, deletes the session row
  (errors are logged, not thrown), then **always** clears the cookies (`dist/api/routes/sign-out.mjs`). Server
  side: `auth.api.signOut({ headers: await headers() })` in a server action with `nextCookies()`; client:
  `authClient.signOut()`. Matches `auth.md` F3 error state ("cookie cleared anyway, land on sign-in").
- Origin/CSRF (`dist/api/middlewares/origin-check.mjs`): for a request with a `Cookie` header the `Origin`
  (or `Referer`) must be in trusted origins, else 403 `INVALID_ORIGIN` / `MISSING_OR_NULL_ORIGIN`; without
  cookies, Fetch Metadata is checked (cross-site navigation sign-in blocked) and an Origin/Referer, if present,
  is validated. It runs only when the endpoint has a `Request` (`if (!req) return`), so **server-side
  `auth.api.*` calls skip it**; then Next.js's own server-action origin check (Origin vs Host) is the guard.
- Implication: if the browser talks to `/api/auth/*` directly (auth client), `BETTER_AUTH_URL` or
  `trustedOrigins` must include exactly the origin the browser uses. CI and Playwright use
  `http://127.0.0.1:3080`, the compose healthcheck uses `http://127.0.0.1:3000` inside the container, Stepan
  may use `localhost:3080`, and `pnpm dev` is `localhost:3000`: a single fixed `BETTER_AUTH_URL` would 403 the
  others. Server actions avoid that class of failure (open question 5).

### 10. e2e and Playwright
- Today: `playwright.config.ts` has no `webServer`, baseURL `E2E_BASE_URL ?? http://127.0.0.1:3080`, one
  `chromium` project, `retries: 0`. `e2e/home.spec.ts` opens `/` anonymously and expects h1 "Главная" and one
  `listitem` per stub course: **it breaks** once `/` is protected and becomes the designed dashboard.
- CI e2e job: `cp .env.example .env` -> `docker compose up -d --build --wait` -> `pnpm install` ->
  `check-image-migrations.sh` -> playwright install -> `pnpm test:e2e` with `E2E_BASE_URL`. No seed step yet.
- Playwright pattern (https://playwright.dev/docs/auth): a `setup` project (`auth.setup.ts`) that signs in once
  and saves `storageState` to `playwright/.auth/*.json` (git-ignored), browser projects `dependencies:
  ["setup"]`; unauthenticated files use `test.use({ storageState: { cookies: [], origins: [] } })`. The state
  file holds a live session cookie: never commit it, and not into the uploaded `e2e-report` artifact.
- The sign-in rate limit (3 / 10 s per path, production image) is a real e2e hazard: the sign-in, wrong
  password, redirect-with-next and setup tests together exceed 3 attempts in 10 s. Options: sign in once via
  storageState, run sign-in specs serially with spacing, or an env-controlled custom rule (weakening prod
  config for tests is itself a decision). The AC7 test (429 message) actually needs the limiter on, so it is
  testable only against the production image.
- `check-image-migrations.sh` I2 runs `docker compose run --rm --no-deps -e DATABASE_URL=<unreachable> web` and
  expects `MigrationError stage connect`: if #29 adds a startup env check (secret) **before** the migration,
  or compose requires `BETTER_AUTH_SECRET` via `:?`, I2 must still see the migration error (compose passes the
  same env to `run`, so it works as long as `.env` has the secret).
- Compose healthcheck: `fetch('http://127.0.0.1:3000/')` and `r.ok`; `fetch` follows redirects, so a `/` ->
  `/sign-in` redirect still ends in 200. The probe would then also exercise the proxy; it stays green as long
  as sign-in renders without DB access.

### 11. What #1 left for #29 (plans/1-web-bootstrap*.md)
- Out of scope in #1 and therefore #29's (plans/1-web-bootstrap.md:42-44, design 2.2): dashboard, sign-in,
  top bar and user menu, notifications region with its live containers (R2), the `F6` region cycle (R3), every
  shadcn component beyond `init` (#29 adds Card, Field/Label/Input, Alert, Button, Spinner, Badge, Progress,
  Item, DropdownMenu, Empty, Skeleton as the pages list), auth and `AUTH_SECRET`, the DB pool (`createDb`).
- "the first reader, #29, owns pool errors via `createDb`'s `onPoolError`" (design 4.3).
- Focus ring exceptions (c) invalid inputs draw the ring in `destructive`, (d) DropdownMenu items draw it
  inset belong to #29 (design table "system/README.md focus ring").
- `cacheComponents` / `partialPrefetching` were left off: "#29/#30 decide with their data loading".
- `app/page.tsx` says "A scaffold placeholder ... #29 builds the dashboard"; `lib/copy.ts` is the single home
  of Russian UI strings ("closed" copy quoted from `ia.md`); `lib/courses.ts` stub says "until #30 reads
  course/".
- Startup order: `instrumentation.ts` -> `lib/startup-node.ts` (`runStartup`) -> `lib/startup.ts`
  (`migrateOnStartup`, exits 1 on failure, never logs the URL). A startup env check for the auth secret
  belongs on this path, same logging rules.

### 12. Design acceptance items

**Sign-in** (`design/pages/sign-in/acceptance.md`, Status: ready). Route `/sign-in?next=<same-origin path>`.
Flows: **F1.1, F1.2, F1.3, F1.4, F2.2, F2.3, F3.3** (`auth.md`). No top bar, no "Уведомления", one `main`.
- AC1 h1 "Вход", labelled "Почта" and "Пароль", button "Войти"; focus in "Почта" on load.
- AC2 empty "Почта" sends nothing, shows "Введите почту" (and "Введите пароль" if empty), `aria-invalid`,
  `aria-describedby`, focus "Почта"; only password empty -> focus "Пароль".
- AC3 in flight: "Входим...", `aria-disabled="true"` (never `disabled`), keeps focus, second Enter/click sends
  nothing.
- AC4 wrong credentials: "Неверная почта или пароль" in the Alert above the form, email kept, password
  cleared, focus on the Alert; no `role="alert"`; read once.
- AC5 no user in the DB: same Alert plus "Пользователя создаёт скрипт seed, см. README" (`aria-describedby`).
- AC6 server unreachable: server message and "Повторить"; it re-sends the same values, focus to "Войти".
- AC7 rate-limit response: "Слишком много попыток входа. Подождите и попробуйте снова." with no number.
- AC8 success -> `next` if same-origin path else `/`; `next=//evil.example` or absolute URL -> `/`; `next`
  survives an empty-field submit and "Повторить".
- AC9 after "Выйти" the page shows "Вы вышли" under the h1.
- AC10 paste and autofill work; no `onpaste` blocking.
- AC11 no horizontal scroll at 375/768/1280; light and dark match the prototype.
- AC12 skip link first Tab stop, moves focus to `main`.
- Open question in the notes: if the name change "Войти" -> "Входим..." is not announced, a hidden
  `role="status"` needs an `ia.md` R2 change first (DESIGN follow-up), not blocking.
- Note: AC9 needs a signal that the user just signed out ("Вы вышли" after F3.3) that does not show on a
  normal visit; the design does not say how (query flag vs cookie). Architect decides; a query flag must
  not be spoofable into anything worse than the note.

**Dashboard** (`design/pages/dashboard/acceptance.md`, Status: ready). Route `/`, h1 "Главная". Flows:
**F2.1, F3.1, F3.2, F4.1, F4.2, F4.3, F18.1, F18.2**; F18.3/F18.4 must not be drawn (R6, D4).
- AC1 Card: first `ready` lesson in catalog order not finished, module title, type Badge, "около N мин", one
  button.
- AC2 "Продолжить" exactly when R5 says started, else "Начать"; "Начать" -> Теория (Задание without theory),
  "Продолжить" -> Задание. (R5: until #31/#34 nothing can be started, so the shipped app shows only "Начать".)
- AC3 first run: "Пока нет пройденных уроков", rows "0 из N уроков", no attempts/weak topics/cost anywhere.
- AC4 course line "Пройдено уроков: N из M"; bar `aria-valuetext` "N из M".
- AC5 "Готовится" Badge without bar; module row opens `/courses/[courseId]#[moduleId]`, focus on that heading.
- AC6 all passed: "Все доступные уроки пройдены", "Новые модули появятся в каталоге", "Открыть курс".
- AC7 no ready lesson: "В курсе пока нет готовых уроков", no button, no progress section; `F6` to `main`
  focuses `main`.
- AC8 course read failure: "Не удалось загрузить курс" + "Повторить" instead of the Card; top bar works;
  "Повторить" focuses the Card heading.
- AC9 progress read failure: first lesson with "Начать" and "Прогресс недоступен, показан первый урок";
  section "Прогресс недоступен" + "Повторить"; reloads section and Card, focuses the section heading.
- AC10 rejected request mid-session: "Сессия закончилась. Файлы в рабочей папке сохранены." + "Войти снова" in
  the existing `role="alert"` container, no focus move; wrapper becomes region "Уведомления"; "Войти снова"
  -> `/sign-in?next=/`.
- AC11 user menu: Enter/Space opens, shows the email, "Выйти" signs out to `/sign-in` with "Вы вышли"; Esc
  returns focus to the button.
- AC12 `F6` and Ctrl+Shift+. cycle top bar, "Уведомления" (only non-empty), `main` (R3).
- AC13 no horizontal scroll at 375/768/1280, light and dark; top bar one row at 375.
- Dashboard progress rules come from ADR-0007 item 5 "Dashboard" (counted lessons = `ready` lessons in the
  tree; no `0/0`, `NaN`, `0%`; module status rules).

### 13. ADR-0007 obligations for #29 (verbatim locations)
1. **Item 2** (Decision, "`users` is Better Auth's user table"): "#29 must check: that the Drizzle adapter maps
   Better Auth's field names to our property keys (and that `npx auth generate` agrees; if not, an additive
   migration)". Finding 3: keys agree; the generator differs in timestamp type and names, not in keys.
2. **Item 2**: "that it keeps the default id generator, or, for `generateId: \"uuid\"`, whether a DB default
   `gen_random_uuid()::text` is then needed". Finding 4: keep default; no DB default.
3. **Item 2**: "whether Better Auth lowercases email, because `users_email_unique` is case-sensitive (if not, a
   unique index on `lower(email)` replaces it)". Finding 5: it lowercases; keep the constraint.
4. **Item 2**: every user id and user FK is `text`, never empty (`users_id_check`), no DB default: the new
   `session.user_id` / `account.user_id` are `text` FKs.
5. **Item 6** (Tables, keys and cascade): "#29's `session` and `account` FKs to `users` are `ON DELETE CASCADE`";
   "Every constraint and index is named".
6. **Item 6**: "account deletion first collects every `attempts.transcript_path` of the user, then deletes the
   user, then deletes those transcript files (#29 owns the flow, backlog 12 the store's delete operation)".
   The issue comment says "the store's delete operation is #38".
7. **Item 8** (Database clients): `apps/web` is the only DB client and writer; "Every route or API that takes
   an attempt id checks `attempts.user_id` against the session user" (no such route in #29, but #29's
   `requireSession` is what later routes use).
8. **Item 9**: migrations only via `db:generate`; merged migrations never edited (`0000_init.sql` stays); CI
   append-only and drift steps; no connection string in any error or log line the package builds.
9. **Item 10**: any schema change is a dev task with a generated migration; changing items 2-9 updates the ADR
   with Stepan's approval.
10. **Consequences**: "Drizzle 0.45's `DrizzleQueryError` message embeds the query parameters. Before
    credential tables exist, #29 states its own rule for logging DB errors (for example: the SQLSTATE and the
    constraint name, never the Drizzle error message or object)." Verified: `DrizzleQueryError` message is
    `Failed query: <sql>\nparams: <params>` and keeps `.params` (`drizzle-orm@0.45.4 errors.js:10-19`). With
    credential tables the params include the **session token** (session lookup) and the **password hash**
    (account insert). BA's logger passes the raw error as an extra argument (e.g. sign-out: `logger.error("Failed
    to read session from database", e)`); its `logger.log(level, message, ...args)` option can be replaced to
    drop args (`@better-auth/core dist/env/logger.mjs:57-69`), and errors that escape `auth.api` reach Next's
    own error log.
11. **Consequences (amended by #1)**: `apps/web` bundles `@academy/db`; `MIGRATIONS_FOLDER` and the image's
    `packages/db/drizzle` copy guarded by `check-image-migrations.sh`: keep it green.
- From #1 (not ADR-0007): pool errors via `createDb`'s `onPoolError` are #29's.
- The same obligations are mirrored as a checklist in the issue #29 comment by Stepan.
- Stale reference: `packages/db/src/schema.ts` still says "#30 wires it" and "#30 checks whether Better Auth
  lowercases emails" (the ADR and the issue comment were corrected to #29 by #65; the code comment was not).

## Constraints discovered
- C1. No product code reads `course/` yet: `@academy/lesson-schema` exports only `validateCourses` (counts
  and issues, no parsed tree), the Docker image excludes `course/` (`.dockerignore`: "#30 removes course from
  this list and copies it into the runner"), and #30 ("course catalog and lesson page from course/") is not
  blocked by #29 nor #29 by #30. The designed dashboard (AC1, AC4-AC9) needs the parsed course tree (modules,
  `ready` lessons, `estimatedMinutes`, type). Scope conflict, open question 1.
- C2. The lesson route `/courses/[courseId]/lessons/[lessonId]` does not exist until #30; #29's AC "a lesson
  cannot be opened without signing in" must be satisfied by default-deny protection, not by a lesson page.
- C3. Auth instance and pool must be lazy (no I/O and no env read at import): `next build` evaluates modules
  with `NODE_ENV=production` and no `DATABASE_URL`/secret in CI `checks` and in the Docker build stage.
- C4. Compose web env is explicit; every new variable (secret, base URL) must be added to
  `docker-compose.yml`, `.env.example`, and, where the dev server must see a shell value, `turbo.json`
  `passThroughEnv` (dev) and the e2e task's `passThroughEnv` for seed credentials.
- C5. `pnpm dev` runs with rate limiting off and would accept the public default secret: tests in dev do not
  exercise AC7.
- C6. Only one web process (in-memory rate limit and ADR-0007's single-process assumption).
- C7. Every Russian string goes into `lib/copy.ts`, quoted from `ia.md`/acceptance copy tables; tests import the
  constants.
- C8. ADR-0006 item 5: the tester's report needs "Design conformance" (screenshots 375/1280 light/dark, every
  AC pass/fail, token block diff, destructive contrast, empty raw colour grep) or judge-architecture fails.
- C9. `docs/architecture.md`: "Workspace service API, authentication: their ADRs will come with the
  corresponding tasks": auth needs its own ADR (CLAUDE.md 4.7: auth is costly to change), status Proposed,
  Stepan accepts.
- C10. Node 22.23 in the image; `@academy/db` engines `>=22.22`.

## Open questions (need Stepan or the ADR)
1. **Dashboard data source (C1).** Options: (a) #29 adds a course reader (parse `course/` via lesson-schema,
   ship `course/` in the image), taking part of #30's scope; (b) #29 renders the dashboard from the stub
   (`lib/courses.ts`) with real progress (empty) and the full states only where data exists, #30 or #35 wires
   the real tree (a "Design deviations" entry, ADR-0006 item 5, with a follow-up); (c) make #29 depend on #30.
   The issue says "a dashboard page with courses and progress (empty for now)".
2. **Account deletion flow (ADR-0007 item 6, "#29 owns the flow").** No design page, no UI copy, and the
   transcript store (#38) does not exist. Ship a server-side function plus test now (no UI), a script, or
   defer with an ADR-0007 note? Stepan's checklist lists it as a #29 item.
3. **Auth ADR.** New `docs/adr/0008-authentication.md` (Proposed): Better Auth 1.7, email+password only,
   sign-up disabled, seed as the only user creation, session 7d/1d, proxy + DAL double check, secret handling,
   cookie security over plain HTTP, rate-limit stance, DB-error logging rule. Confirm that #29 writes it.
4. **Table names**: `sessions`/`accounts`/`verifications` with `usePlural: true`, or singular names with
   `user.modelName = "users"`. Cosmetic but permanent (ADR-0007 item 9: merged migrations never renamed).
5. **Sign-in transport**: server actions (`auth.api.signInEmail` + `nextCookies`, no browser origin coupling,
   but the BA limiter may not run, R3) vs the browser auth client against `/api/auth` (limiter runs, needs
   `BETTER_AUTH_URL`/`trustedOrigins` for every origin used: 127.0.0.1:3080, localhost:3080, localhost:3000).
6. **CI secret**: a fixed value in `.env.example` (committed, used by CI through `cp`) or generated in the
   e2e job; and should the app refuse the example placeholder?
7. **Seed behaviour**: credentials from env only? Re-run when the user exists: no-op or reset password? Run
   from the host via pnpm (needs the DB port) or inside the image?
8. **Rate limit in e2e**: keep defaults and design tests around 3/10 s, or a narrower config? AC7 needs the
   limiter on.
9. **"Вы вышли" signal** (sign-in AC9): query flag or short-lived cookie.
10. **Issue label**: `tier:task` on the issue vs PROJECT chosen by the orchestrator.

## Risks
- R1. Session token and password hash in logs via `DrizzleQueryError` or BA's logger args (ADR-0007
  Consequences); needs a custom BA `logger.log`, a `pool` error handler that logs code only, and a rule for
  errors that reach Next.
- R2. Silent default secret in dev (BA does not throw outside production) and eager init during `next build`
  (C3) breaking CI `pnpm build` and the Docker build.
- R3. Brute force: if sign-in goes through a server action, BA's per-path limiter may not apply (could not
  verify); the rate limit is also bypassable with a forged `X-Forwarded-For` (Next keeps a client-sent one).
  Loopback-only stack, single user: low impact, but AC7 must then be implemented deliberately.
- R4. Open redirect through `next` (AC8): must accept only paths starting with a single `/` (reject `//`,
  `/\`, schemes, control characters) and be checked server-side, not only in the form.
- R5. Cookie-only protection mistaken for authorization: proxy `getSessionCookie` alone, or a layout-only
  check (does not re-run on navigation), would leave server actions and later route handlers open.
- R6. `__Secure-` cookie over plain HTTP in the production image when no base URL is set; the e2e run would
  reveal it only if the browser rejects it (could not verify).
- R7. Origin 403s when the browser origin differs from `BETTER_AUTH_URL` (127.0.0.1 vs localhost), if the
  browser client is used.
- R8. e2e flakiness from the 3-per-10-s sign-in limit; storageState file leaking into the uploaded report
  artifact.
- R9. Existing `e2e/home.spec.ts` and `course-list` stub break once `/` is protected and redesigned.
- R10. A second drizzle-orm copy under `apps/web` if it is not a declared dependency (adapter peer), causing
  type or `is()` mismatches; check `pnpm why drizzle-orm` after install.
- R11. Using `auth.$context.internalAdapter` in the seed couples to a semi-internal API; a minor upgrade can
  change it (pin, test).

## Sources
- npm registry: `better-auth` 1.7.14 (latest), `auth` 1.7.14, `@better-auth/cli` 1.4.21; tarball source as cited.
- https://www.better-auth.com/docs/integrations/next (route handler, nextCookies, proxy, getSessionCookie warning)
- https://www.better-auth.com/docs/authentication/email-password (scrypt, 8/128, server API)
- Context7 `/websites/better-auth` (proxy optimistic redirect, per-page `getSession`)
- Context7 `/vercel/next.js`: docs/01-app/03-api-reference/03-file-conventions/proxy.mdx (Node runtime, server
  functions, do not rely on proxy alone), docs/01-app/02-guides/upgrading/version-16.mdx (middleware -> proxy),
  docs/01-app/02-guides/authentication.mdx (layouts and partial rendering, DAL)
- `node_modules/.../next@16.4.3/dist/server/base-server.js:597-601` (x-forwarded-* defaults)
- `node_modules/.../drizzle-orm@0.45.4/errors.js:10-19` (`DrizzleQueryError`)
- https://playwright.dev/docs/auth (setup project, storageState, security warning)
- Repo: `docs/adr/0003`, `0006`, `0007`; `packages/db/src/{schema,client,migrate}.ts`; `apps/web/{instrumentation.ts,
  lib/startup*.ts, next.config.ts, playwright.config.ts, Dockerfile, e2e/home.spec.ts}`; `docker-compose.yml`;
  `.dockerignore`; `.env.example`; `turbo.json`; `.github/workflows/ci.yml`; `design/flows/{auth,dashboard,
  progress,ia}.md`; `design/pages/{sign-in,dashboard}/acceptance.md`; `plans/1-web-bootstrap{,-design}.md`;
  `plans/50-learner-flows-design-system-research.md` §5; `gh issue view 29` (+ comment), 30, 35.
