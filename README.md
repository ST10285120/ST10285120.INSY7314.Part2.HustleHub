# HustleHub+ — Secure Freelance Marketplace (POE Part 3: DevSecOps, Monitoring & Finalisation)

| | |
|---|---|
| **Student** | Carson Norman — ST10285120 |
| **Module** | INSY7314 
| **Repository** | https://github.com/ST10285120/ST10285120.INSY7314.Part2.HustleHub |

HustleHub+ is a freelance marketplace: freelancers advertise services (gigs), clients book them with a simulated payment, and admins oversee the platform. Part 1 built secure authentication, Part 2 turned it into a full MERN stack, and **Part 3 adds financial insights (income and tax estimation), the admin role, a separate transaction ledger, a CI/CD pipeline with automated security testing, Docker containerisation, centralised logging and monitoring, and extra security controls.**

---

## Contents

1. [What changed in Part 3](#1-what-changed-in-part-3)
2. [Roles and capabilities](#2-roles-and-capabilities)
3. [Architecture](#3-architecture)
4. [Setup](#4-setup)
5. [Features](#5-features)
6. [API reference](#6-api-reference)
7. [Security implementation](#7-security-implementation)
8. [Own security features](#8-own-security-features-beyond-the-minimum)
9. [Logging and monitoring](#9-logging-and-monitoring)
10. [CI/CD pipeline](#10-cicd-pipeline-github-actions)
11. [Static code analysis](#11-static-code-analysis)
12. [Testing](#12-testing)
13. [Final security review](#13-final-security-review)
14. [Demonstration evidence](#14-demonstration-evidence)
15. [Known limitations](#15-known-limitations)
16. [References](#16-references)

---

## 1. What changed in Part 3

### Part 2 feedback, addressed

| # | Part 2 feedback | What was done |
|---|---|---|
| 1 | Repository not in the EMWCCN classroom organisation | No classroom repository was provided for Part 3, so development continued in the existing project repository (link above), with Part 3 work done on the `part3-devsecops` branch and merged into `main` through a pull request. |
| 2 | README missing identity and evidence | Name, student number, submission type, repository and video link at the top; evidence in [section 14](#14-demonstration-evidence) and as CI artifacts on every run. |
| 3 | No separate transaction record | New `Transaction` model. Every booking creates a transaction linked to the booking, the client and the freelancer (reference, amount, currency, status). Income is now derived from completed transactions. |
| 4 | No admin role | Admin role with admin-only routes: platform stats, list users, suspend/reactivate/unlock users, list all gigs, bookings, transactions and the security audit log, and remove any gig. Jest and Newman prove that clients and freelancers get `403` on every admin route. |
| 5 | No evidence of a `429` | `backend/src/__tests__/rateLimit.test.js` and `postman/HustleHub_RateLimit.postman_collection.json` both loop failed logins until the API answers `429`. |
| 6 | Audit advisories (`uuid`, `react-router`) and missing `scripts/seed.js` | `uuid` was unused and has been removed (the API uses Node's `crypto.randomUUID()`). `react-router-dom` upgraded to v7.18+, which patches CVE-2026-53668 and the related July 2026 advisories. `backend/scripts/seed.js` now exists. |
| 7 | No frontend CSP | Strict CSP (no inline scripts or styles, `connect-src 'self'`, `frame-ancestors 'none'`) served by nginx in Docker and by `vite preview`; a relaxed policy for the Vite dev server. CI fails if the build ever contains an inline script. |

### New in Part 3

- **Tax estimation** using the SARS 2026/27 tables, explained step by step in the UI and in [5.2](#52-tax-estimation--how-the-logic-works).
- **Income & tax dashboard** with a monthly income chart, income split, category breakdown, provisional tax payments and a bracket table.
- **Transactions page** for clients and freelancers, and an **Admin console**.
- **GitHub Actions pipeline**: install, `npm audit`, backend and frontend tests, builds, CodeQL, Semgrep, Trivy, Docker image build and scan, the full stack running in containers, Newman, an OWASP ZAP DAST scan, and log collection. It fails when any check fails. `scripts/security-scan.sh` runs the same scans locally.
- **Docker**: one Dockerfile in `backend/`, one in `frontend/`, orchestrated by `docker-compose.yml` with MongoDB.
- **Logging and monitoring**: structured JSON logs with request IDs and redaction, an optional Better Stack cloud log transport, and a MongoDB security audit trail.
- **Extra security features**: account lockout, server-side token revocation, the security audit trail, request correlation IDs and frontend session hardening ([section 8](#8-own-security-features-beyond-the-minimum)).

---

## 2. Roles and capabilities

| Capability | Client | Freelancer | Admin |
|---|:-:|:-:|:-:|
| Register through the API | ✅ | ✅ | ❌ (bootstrapped from env, see 4.3) |
| Browse gigs | ✅ | ✅ | ✅ |
| Create / edit / delete **own** gigs | | ✅ | |
| Book a gig (simulated payment) | ✅ | | |
| See own bookings / transactions | ✅ | ✅ | |
| Income & tax dashboard | | ✅ | |
| View all users, bookings, transactions | | | ✅ |
| Suspend / reactivate / unlock users | | | ✅ |
| Remove any gig (moderation) | | | ✅ |
| Review the security audit log | | | ✅ |

The rules are enforced by the API: `authorizeRoles` checks the role on every route, and controllers also check **ownership**. The React route guards only hide UI.

---

## 3. Architecture

```
                 Browser  ──HTTPS──►  client container (nginx, unprivileged, :8443 → host :3000)
                                         │  serves the React build + strict CSP and security headers
                                         │  /api/*  ──HTTPS (private network "web")──►
                                         ▼
                                      api container (Node/Express, non-root, read-only FS)
                                         │  requestId → Helmet → CORS → body limit → mongo-sanitize
                                         │  → access log → global rate limit → routes
                                         │  → validation → JWT + DB revocation check → RBAC → controllers
                                         │  ──(private network "data", no internet)──►
                                         ▼
                                      mongo container (auth enabled, not published to host)

  Logs:  api stdout (JSON) ──► docker logs / CI artifact
                          └──► Better Stack (cloud, optional)
         security events  ──► MongoDB auditlogs collection (90-day TTL) ──► Admin "Security log"
```

Only the client container is published to the host. The API is reachable only through nginx, which is what makes it safe to trust `X-Forwarded-For` for rate limiting (`TRUST_PROXY=1`).

### Repository structure

```
.
├── backend/                         Express API
│   ├── Dockerfile, docker-entrypoint.sh, .dockerignore
│   ├── server.js                    HTTPS server, admin bootstrap, graceful shutdown
│   ├── scripts/                     generate-cert.sh, seed.js
│   └── src/
│       ├── app.js                   middleware pipeline
│       ├── config/                  env.js, db.js, bootstrapAdmin.js
│       ├── controllers/             auth, gig, booking, transaction, insights, admin
│       ├── middleware/              authenticateToken, authorizeRoles, validators,
│       │                            rateLimiter, requestId, errorHandler
│       ├── models/                  User, Gig, Booking, Transaction, AuditLog
│       ├── routes/                  one router per resource; adminRoutes is admin-only
│       ├── services/taxService.js   SARS tax estimation (pure, unit tested)
│       ├── utils/                   logger, betterStackTransport, audit, token
│       └── __tests__/               Jest + Supertest suites
├── frontend/                        React (Vite)
│   ├── Dockerfile, nginx.conf, security-headers.conf, docker/15-generate-cert.sh
│   └── src/  api/ context/ components/ (charts.jsx …) pages/ (Income, Transactions, Admin …) __tests__/
├── postman/                         Part 1, Part 2, Part 3 and RateLimit collections
├── .github/workflows/ci.yml         CI/CD pipeline
├── .github/scripts/sarif_gate.py    fails the build on high/critical SAST findings
├── .github/dependabot.yml           weekly dependency, image and action updates
├── docker-compose.yml, .env.example
└── docs/                            screenshots and evidence
```

---

## 4. Setup

### 4.1 Run the whole stack with Docker (recommended)

Requires Docker Desktop (or Docker Engine with Compose v2).

```bash
cp .env.example .env
# Fill in .env. Generate secrets with:  openssl rand -hex 32
#   MONGO_ROOT_PASSWORD=<hex>   JWT_SECRET=<hex>   ADMIN_PASSWORD=<12+ chars, upper/lower/number/symbol>
docker compose up --build
```

Open **https://localhost:3000** and accept the self-signed certificate once. Each container generates its own self-signed certificate at first start, so no private key is ever baked into an image.

```bash
docker compose ps                    # all three should be "healthy"
docker compose logs -f api           # structured JSON logs
docker compose exec -e NODE_ENV=development api node scripts/seed.js   # optional demo data (see 4.4)
docker compose down                  # stop (add -v to also delete the database volume)
```

### 4.2 Run locally without Docker

**Backend** (Node 20+, MongoDB running locally or on Atlas):

```bash
cd backend
npm install
cp .env.example .env       # set JWT_SECRET, MONGODB_URI, and optionally ADMIN_EMAIL/ADMIN_PASSWORD
npm run cert               # self-signed cert for https://localhost:5443
npm start
```

**Frontend:**

```bash
cd frontend
npm install
cp .env.example .env       # VITE_API_URL=https://localhost:5443/api
npm run dev                # https://localhost:3000 (visit https://localhost:5443/api/health once to trust the API cert)
```

### 4.3 The admin account

Admins cannot self-register: the register endpoint only accepts `client` or `freelancer`. On start-up the API creates an admin from `ADMIN_EMAIL` and `ADMIN_PASSWORD` if that email does not exist yet. It is idempotent and never overwrites an existing account's password, and it refuses a weak password.

### 4.4 Demo data

`npm run seed` (or `npm run seed -- --reset`) creates the admin, two freelancers, two clients, five gigs and eleven bookings with transactions spread over eight months, so the income chart has data for the video. Demo accounts use `SEED_PASSWORD` (default `Demo!Passw0rd2026`). Seeding refuses to run when `NODE_ENV=production`.

---

## 5. Features

### 5.1 Bookings and transactions

`POST /api/bookings` creates a **Booking** (the service agreement) and a separate **Transaction** (the money movement). Both reference the client and the freelancer, and they reference each other:

```json
{ "reference": "TXN-9F2C61A0B7D4", "booking": "…", "gig": "…", "client": "…", "freelancer": "…",
  "amount": 2500, "currency": "ZAR", "type": "payment", "status": "completed", "paymentMethod": "simulated" }
```

MongoDB multi-document transactions need a replica set, which the local, Docker and test databases are not. Consistency is kept with a compensating action instead: if writing the transaction fails, the booking is deleted again. Income totals and the tax estimate are calculated only from **completed** transactions, so a refunded payment drops out automatically.

### 5.2 Tax estimation — how the logic works

Freelancers are self-employed, so nobody deducts PAYE for them. SARS treats them as **provisional taxpayers** who must estimate and pay their own tax twice a year. `backend/src/services/taxService.js` produces that estimate:

1. **Taxable income so far** = completed payments received in the current tax year (1 March – end of February) − business expenses the freelancer enters (never below zero).
2. **Projection to a full year** = taxable income so far × 12 ÷ months elapsed. At least one month is assumed, so one early booking doesn't produce an inflated projection.
3. **Progressive brackets** (SARS 2026/27) are applied to the projection: each slice of income is taxed only at its own rate.

   | Taxable income (R) | Rate |
   |---|---|
   | 0 – 245 100 | 18% |
   | 245 101 – 383 100 | 26% |
   | 383 101 – 530 200 | 31% |
   | 530 201 – 695 800 | 36% |
   | 695 801 – 887 000 | 39% |
   | 887 001 – 1 878 600 | 41% |
   | 1 878 601 + | 45% |

4. **Rebates** are subtracted: primary R17 820, plus R9 765 from age 65 and R3 249 from age 75. Tax can't go below zero, which gives the R99 000 tax-free threshold for under-65s.
5. **Effective rate** = annual tax ÷ projected income. Tax attributable to income so far = effective rate × taxable income so far.
6. The annual figure is split into the **two provisional payments** (end of August and end of February) and a **monthly set-aside** amount.

**Worked example** (also an automated test): by 1 September 2026 a freelancer has received R150 000 and spent R10 000 on the business.

| Step | Value |
|---|---|
| Taxable so far | R150 000 − R10 000 = **R140 000** |
| Months elapsed | 6.05 (1 March → 1 September) |
| Projected annual | R140 000 × 12 ÷ 6.05 = **R277 717.39** |
| 18% on first R245 100 | R44 118.00 |
| 26% on the next R32 617.39 | R8 480.52 |
| Gross tax | R52 598.52 |
| − Primary rebate | − R17 820.00 |
| **Estimated annual tax** | **R34 778.52** (effective rate 12.5%, marginal 26%) |
| Tax on income so far | **R17 532.19** |
| Set aside per month | R2 898.21 |
| Provisional payments | R17 389.26 + R17 389.26 |

The bracket maths is unit-tested against every base amount in the SARS table. The estimate is for planning only: it ignores income earned outside HustleHub+, medical scheme credits, retirement deductions and VAT, and the UI says so.

### 5.3 Income & tax dashboard (frontend)

`/income` (freelancers) shows:

- **Summary tiles**: income this tax year, this month compared with last month, estimated tax so far with the effective rate, and the monthly set-aside with the marginal rate.
- **Income per month** for the last 12 months: an SVG bar chart with a hover and keyboard-focus tooltip on every bar and a **"Show as table"** view.
- **Where this year's income goes**: take-home vs estimated tax vs expenses, as a stacked bar with a legend that shows the values and percentages.
- **Income by category** and **top earning gigs**.
- **Tax estimate**: expenses and age inputs, a line-by-line calculation, provisional payment cards, the SARS bracket table with the user's brackets highlighted, and an expandable "How this estimate is calculated" section.

The charts are hand-built SVG with no chart library, so they work under the strict CSP. Colours come from a validated colour-blind-safe palette (blue / orange / aqua, CVD ΔE ≥ 9). No value is shown by colour alone: every chart has text labels or a table view.

---

## 6. API reference

All protected routes need `Authorization: Bearer <token>`. Every response carries an `X-Request-Id`.

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| GET | `/api/health` | Public | Health check |
| POST | `/api/auth/register` | Public | Register as client or freelancer |
| POST | `/api/auth/login` | Public | Log in, get a JWT |
| POST | `/api/auth/logout` | Any user | **Revoke all of the user's tokens** |
| GET | `/api/auth/profile` | Any user | Current user |
| GET | `/api/gigs` · `/api/gigs/:id` | Public | Browse gigs |
| GET | `/api/gigs/my` | Freelancer | Own gigs |
| POST · PUT · DELETE | `/api/gigs[/:id]` | Freelancer (owner) | Manage own gigs |
| POST | `/api/bookings` | Client | Book a gig; returns `booking` **and** `transaction` |
| GET | `/api/bookings/my` | Client | Own bookings |
| GET | `/api/bookings/freelancer` | Freelancer | Bookings against own gigs |
| GET | `/api/bookings/freelancer/income` | Freelancer | Income totals (from transactions) |
| GET | `/api/transactions/my` | Client, Freelancer | Own transactions |
| GET | `/api/transactions/:id` | Party to it | One transaction (404 to everyone else) |
| GET | `/api/insights/income?expenses=&ageGroup=` | Freelancer | Dashboard data and tax estimate |
| GET | `/api/insights/tax-tables` | Public | The SARS tables the estimate uses |
| GET | `/api/admin/stats` | Admin | Platform statistics |
| GET | `/api/admin/users?role=` | Admin | All users |
| PATCH | `/api/admin/users/:id/status` | Admin | `{ "isActive": false }` suspends and revokes sessions |
| POST | `/api/admin/users/:id/unlock` | Admin | Clear an account lockout |
| GET | `/api/admin/gigs` | Admin | All gigs, including inactive |
| DELETE | `/api/admin/gigs/:id` | Admin | Remove any gig (financial records kept) |
| GET | `/api/admin/bookings` · `/transactions` | Admin | All bookings / transactions |
| GET | `/api/admin/audit-logs?event=&outcome=` | Admin | Security audit trail |

---

## 7. Security implementation

**Password storage.** Passwords are hashed with bcrypt (12 rounds), never stored or logged in plain text. Bcrypt is deliberately slow and salts each password individually, which makes brute-forcing a stolen hash impractical (OWASP, 2025g; Provos and Mazières, 1999).

**JWT authentication.** Tokens are signed with HS256 and pinned to that algorithm on verification, so `alg: none` and algorithm-confusion attacks fail. They carry `iss`, `aud`, `jti` and a token version, and expire after one hour (Jones, Bradley and Sakimura, 2015). Part 3 adds a database check on every request, so revoked and suspended tokens stop working immediately (section 8.2). In production the API refuses to start with the placeholder secret or a secret shorter than 32 characters.

**Role-based access control and ownership.** `authorizeRoles` enforces least privilege on every route (OWASP, 2025b). `adminRoutes.js` applies the admin guard once with `router.use`, so a new admin route can't be added without it. The role used is the **current database role**, not the one inside the token. Ownership is checked in controllers: another user's gig or transaction returns the same `404` as a missing one, so responses can't be used to discover other users' data.

**Input validation and sanitisation.** Every body, query and path parameter is validated with `express-validator` (types, ranges, enums, Mongo IDs), and free text is escaped against stored XSS (OWASP, 2025c). `express-mongo-sanitize` strips `$` and `.` keys to block NoSQL operator injection, and queries built from request values are additionally type-checked (OWASP, 2025d). Bodies are capped at 10 KB, and malformed JSON returns a clean `400`.

**Security headers and CSP.** Helmet on the API sets CSP, HSTS, `nosniff`, `frame-ancestors 'none'`, `Referrer-Policy: no-referrer` and removes `X-Powered-By`. API responses are sent `Cache-Control: no-store`. The **frontend** gets its own strict CSP from nginx: `script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'`, along with HSTS, `X-Frame-Options`, `Permissions-Policy` and COOP (MDN, 2025; OWASP, 2025e).

**HTTPS everywhere.** The API only serves HTTPS (TLS 1.2+). nginx terminates TLS for the browser and re-encrypts to the API on the private Docker network (Node.js, 2026).

**Rate limiting.** A global limit applies to every `/api` route (500 per 15 min per IP). Stricter limits apply to login (10 *failed* attempts per 15 min; successful logins don't count), registration (20 per hour) and booking (30 per 15 min). Responses are `429` with a clear JSON message and IETF `RateLimit` headers (Express.js, 2026).

**Generic errors.** Login gives the same message for an unknown email, a wrong password, a locked account and a suspended account. An unknown email is still compared against a dummy bcrypt hash, so response timing doesn't reveal which emails exist. Unexpected errors return a generic message plus the request ID. Stack traces only go to the logs.

**Containers.** Both images are multi-stage builds that run as **non-root**, include only production dependencies and have health checks. The API container is read-only with all Linux capabilities dropped and `no-new-privileges`. MongoDB requires authentication and sits on an internal network with no internet route, and neither MongoDB nor the API is published to the host (Docker, 2026).

---

## 8. Own security features (beyond the minimum)

### 8.1 Account lockout

After **5 consecutive failed logins** an account is locked for **15 minutes**, even if the right password is then supplied. This complements IP rate limiting, which an attacker can bypass by rotating IPs; the lock follows the *account*. The response stays the generic `Invalid email or password.`, so the lock itself doesn't confirm that the account exists. A successful login resets the counter, and admins can unlock early (`POST /api/admin/users/:id/unlock`). Every lock is audited as `auth.login.locked`. Thresholds are configurable (`LOCKOUT_MAX_ATTEMPTS`, `LOCKOUT_MINUTES`) (OWASP, 2025a).

### 8.2 Server-side logout and token revocation

A plain JWT stays valid until it expires, even after "logout". Each user now has a `tokenVersion` that is embedded in every token, and `authenticateToken` compares it with the database on every request:

- `POST /api/auth/logout` increments it, so **every token on every device** stops working immediately.
- An admin suspending a user increments it as well, so a suspended user is kicked out at once.
- Deleted or suspended users are rejected even with an unexpired token.

### 8.3 Security audit trail

Security-relevant events are written to an `auditlogs` collection with the actor, role, target, IP, user agent and request ID: registrations, logins (success, failure, locked), logout, denied access (`403`s and attempts to edit another user's gig), gig changes, bookings, transactions and admin actions. Passwords and tokens are never stored and emails are masked (`t***@example.com`). Records expire after 90 days via a TTL index. Admins review the trail on the Admin page's **Security log** tab, and the dashboard shows failed logins in the last 24 hours and the number of locked accounts.

### 8.4 Request correlation IDs

Every request gets an `X-Request-Id`. nginx generates it, and the API validates it (or generates its own) and attaches it to every log line, audit record and error response. A user can quote the ID from an error and it leads straight to the related logs. Incoming IDs that aren't short and alphanumeric are replaced, so the header can't be used for log injection.

### 8.5 Frontend session hardening

The JWT is kept in `sessionStorage` (scoped to the tab and cleared when it closes) instead of `localStorage`. The app logs out automatically the moment the token expires, and it ends the session in the UI on any `401` from the API (for example after a revocation). Logout revokes the token on the server first. The strict CSP is what prevents injected script from reading the token in the first place.

---

## 9. Logging and monitoring

### What is logged and why

| Event | Where in code | Why it matters |
|---|---|---|
| Login success / failure / lockout | `authController.login` | Detect brute force and credential stuffing; investigate account takeover |
| Registration | `authController.register` | Spot fake-account floods |
| Logout / token revocation | `authController.logout` | Proves when sessions were ended |
| Access denied (`403`, non-owner edits) | `authorizeRoles`, `gigController` | Privilege escalation and IDOR probing |
| Booking created | `bookingController.createBooking` | Business activity and fraud review |
| Transaction created | `bookingController.createBooking` | Financial audit trail (reference, amount, status) |
| Admin actions | `adminController` | Accountability for privileged users |
| Rate limit exceeded | `rateLimiter` | Abuse and DoS attempts |
| Errors (4xx as warn, 5xx as error with stack) | `errorHandler` | Fault detection; stack traces stay server-side |
| Every HTTP request | `morgan` access log | Traffic volume, latency, status codes |

Each line is a JSON object with a timestamp, level, service, environment, request ID and event fields:

```json
{"level":"warn","message":"audit:auth.login.failure","event":"auth.login.failure","outcome":"failure","actor":"6730…","actorRole":"client","ip":"172.18.0.1","requestId":"6f1c…","details":{"reason":"wrong-password","attempts":2,"locked":false},"service":"hustlehub-api","env":"production","timestamp":"2026-11-09T10:14:03.512Z"}
```

**Safe by design.** A redaction step replaces any `password`, `token`, `authorization`, `secret` or `cookie` field with `[REDACTED]` at any depth. Emails are masked. Request-derived strings have CR/LF removed and are length-capped to prevent log forging (OWASP, 2025f).

### Where logs go

1. **stdout as JSON** in containers, which `docker compose logs` collects. In CI the API log is saved as an artifact, and the job summary counts each security event.
2. **Better Stack (cloud log management), optional.** Set `BETTERSTACK_SOURCE_TOKEN` and `BETTERSTACK_INGESTING_HOST` (Telemetry → Sources → Connect → HTTP). A custom winston transport (`utils/betterStackTransport.js`) batches logs every 2 s and ships them over HTTPS. If Better Stack is unreachable the API keeps working, and the failure is reported at most once a minute (Better Stack, 2026). Useful monitors: alert on more than 20 `auth.login.failure` events in 5 minutes, any `level=error`, or any `Rate limit exceeded`. The transport is built and switched off when no token is set; it was not connected to a Better Stack account for this submission, so the monitoring evidence comes from the container logs and the admin security log.
3. **MongoDB audit trail** (section 8.3) for in-app review by admins.
4. **Log files** (`logs/combined.log`, `logs/error.log`, rotated at 5–10 MB) for local runs without Docker.

### How effective are the controls? (monitoring evaluation)

The logs make every control *observable*. The CI run's log summary shows how many failed logins were blocked, how many accounts were locked, how many `403`s were denied and how many requests were rate-limited during the Newman run. If the controls were broken, those counts would be wrong and the Newman assertions would fail. Locally, `docker compose logs api` shows each of these events as one JSON line with its request ID, and the Admin console's security log lists the same events from the audit trail, so an administrator can see failed logins, lockouts and denied access without reading raw logs. In production, the same events would feed the Better Stack alerts above, so an attack shows up as a spike rather than going unnoticed.

---

## 10. CI/CD pipeline (GitHub Actions)

`.github/workflows/ci.yml` runs on every push and pull request. **Any failing test or check fails the pipeline.**

| Job | What it does | Fails when |
|---|---|---|
| **backend** | `npm ci` → `npm audit --omit=dev --audit-level=high` → Jest + Supertest with coverage → production install and start-up check | A high or critical vulnerability, or any failing test |
| **frontend** | `npm ci` → `npm audit` → Vitest (JUnit report) → `vite build` → check the build has no inline scripts | Same, plus a build that would break the CSP |
| **codeql** | CodeQL `security-extended` queries (SAST) | Any finding with security-severity ≥ 7.0 (high/critical) |
| **semgrep** | Semgrep: OWASP Top 10, Node.js, React, secrets and Dockerfile rules (SAST) | Any ERROR-severity finding |
| **trivy-fs** | Trivy: dependency vulnerabilities, hard-coded secrets, Dockerfile misconfiguration | Any fixable HIGH/CRITICAL issue |
| **docker** | Build both images → Trivy image scan → `docker compose up --wait` (all three containers healthy) → HTTPS/header smoke test (and checks that the API is *not* exposed) → Newman Part 3 collection → Newman rate-limit loop → **OWASP ZAP baseline scan (DAST)** of the running app → collect logs → tear down | Image build, a critical image CVE, an unhealthy container, any Newman assertion, or a ZAP FAIL rule (missing CSP, HSTS, X-Content-Type-Options, anti-clickjacking header, or a server version leak; see `.zap/rules.tsv`) |
| **quality-gate** | Single required status | Any job above didn't succeed |

**Artifacts on every run:** Jest results and coverage, the Vitest JUnit report, the frontend build, CodeQL and Semgrep SARIF, Trivy JSON reports, the Newman HTML and JUnit reports, the ZAP HTML/JSON/Markdown reports, and the API and client logs.

**Running the pipeline.** At the time of submission GitHub would not start any Actions job on this account ("The job was not started because your account is locked due to a billing issue"). The account is on GitHub Free with no payment method, so this is an account-level problem rather than a fault in the workflow, and a GitHub Support ticket has been opened. While the lock is in place, every check in the pipeline was run locally with the same tools and thresholds: `npm test` in both apps, `docker compose up`, Newman, and `bash scripts/security-scan.sh [--dast]` for npm audit, Semgrep, Trivy and ZAP. The results are in [section 11](#11-static-code-analysis), [section 12](#12-testing) and `docs/evidence/`.

**Supply chain.** Trivy is run as the pinned `aquasec/trivy:0.69.3` image rather than through `aquasecurity/trivy-action`, because that action's tags were hijacked in March 2026 (CVE-2026-33634) and 0.69.3 is a known-safe release (Aqua Security, 2026). Dependencies are installed with `npm ci` from lockfiles, and Dependabot (`.github/dependabot.yml`) raises weekly update PRs for npm, the base images and the actions.

---

## 11. Static code analysis

**Tools.** CodeQL finds data-flow vulnerabilities such as injection, XSS, log injection, missing rate limiting and insecure randomness. Semgrep runs pattern rules for OWASP Top 10, Express, React and secrets. Trivy and `npm audit` check dependencies, secrets and Dockerfiles. OWASP ZAP adds dynamic testing (DAST) against the running containers. All of them run in the pipeline, and the SARIF results appear in the job summary and as artifacts.

**Running the scans locally.** `bash scripts/security-scan.sh` runs npm audit, Semgrep and Trivy (in Docker, with the same rules and thresholds as CI) and writes the reports to `docs/evidence/static-analysis/`. Add `--dast` while `docker compose` is up to include the ZAP baseline scan.

**What the results mean.** CodeQL ranks findings by `security-severity` (CVSS-like, 0–10). Semgrep ranks rules ERROR/WARNING/INFO. The pipeline blocks on high and critical CodeQL findings and on ERROR Semgrep findings. Lower-severity results are listed for review but don't block, because many are informational (for example "consider CSRF middleware", which doesn't apply to a bearer-token API with no cookies).

**Results of the latest run** (local run of `scripts/security-scan.sh --dast` on 9 November 2026, because GitHub Actions is blocked; full reports in `docs/evidence/static-analysis/`). The first run found 3 blocking issues (2 Semgrep ERRORs and 1 Trivy CRITICAL), all fixed or reviewed below. The re-run passed.

| Tool | Findings | Blocking | Notes |
|---|---|---|---|
| CodeQL (security-extended) | Runs only in GitHub Actions (blocked, see section 10) | – | |
| Semgrep (414 rules: OWASP Top 10, Node.js, React, secrets, Dockerfile) | 24 (warnings and notes) + 1 reviewed and suppressed | 0 | Before the fixes: 32 findings, 2 blocking |
| Trivy fs (deps, secrets, Dockerfiles) | 0 | 0 | Before the fixes: 1 CRITICAL (DS-0031) |
| Trivy images | Runs in the CI docker job (blocked, see section 10) | – | |
| npm audit (prod) | 0 | 0 | backend and frontend |
| OWASP ZAP baseline (DAST, passive rules) | 0 FAIL, 4 WARN, 64 PASS | 0 | WARNs reviewed: cache-control and "storable content" on public static files (hashed JS/CSS bundles and the SPA page, no personal data; API responses are `Cache-Control: no-store`); missing `Cross-Origin-Embedder-Policy` (only needed for cross-origin isolation features the app doesn't use); "Modern Web Application" is informational |

**Remaining non-blocking findings (reviewed and accepted).** GitHub Actions referenced by version tag rather than commit SHA (Semgrep warning): risk is reduced by using only official `actions/*` and `github/*` actions, by running Trivy as a pinned image instead of the hijacked action, and by Dependabot updates. `USER_KEY = 'hustlehub_user'` in `api/client.js` (Semgrep "hardcoded username"): false positive, because it is the sessionStorage key name, not a username. Semgrep's `note` results confirm that controls are present (helmet CSP, HSTS, Referrer-Policy, X-Powered-By removed, rate limiting).

**Issues found and fixed during the Part 3 security review**

| Issue | Category | Fix |
|---|---|---|
| `uuid` advisory (GHSA-w5hq-g745-h8pq) | Vulnerable dependency | Removed: the package was unused; `crypto.randomUUID()` used instead |
| `react-router` advisories (CVE-2025-68470, CVE-2026-53668 and others) | Vulnerable dependency | Upgraded `react-router-dom` to ^7.18.0 |
| Endpoints that touch the database without rate limiting | CodeQL `js/missing-rate-limiting` | Global `/api` limiter added before all routes |
| Request data (URL, user agent, email, error message) written to logs | CodeQL `js/log-injection` | `safeForLog()` strips CR/LF and caps length; audit details sanitised |
| Admin filters built from `req.query` used in Mongo queries | CodeQL `js/sql-injection` (NoSQL) | Explicit `typeof … === 'string'` guards (plus validation and mongo-sanitize) |
| Tokens valid until expiry after logout | Broken authentication | Server-side revocation (section 8.2) |
| No per-account brute-force protection | Broken authentication | Account lockout (section 8.1) |
| Login timing revealed whether an email exists | User enumeration | Dummy bcrypt comparison for unknown emails |
| No frontend CSP; token in `localStorage` | XSS impact | Strict nginx CSP; `sessionStorage` and auto-expiry |
| `body-parser` / `qs` advisories (backend) and `follow-redirects` (frontend) found by `npm audit` during Part 3 | Vulnerable dependency | `npm audit fix` to patched versions; production audit now reports 0 vulnerabilities |
| CodeQL Action v3 being retired | Pipeline supply chain | Upgraded to `github/codeql-action@v4` |
| Placeholder JWT secret kept as a string literal in `config/env.js` | Semgrep `njsscan…hardcoded_secrets.node_secret` (ERROR) | The placeholder is now detected with a pattern, so no secret-looking literal is left in the code; production still refuses to start with it |
| `SSL_KEY_PATH` set with `ENV` in the API Dockerfile | Trivy `DS-0031` (CRITICAL misconfiguration) | Removed from the image; the entrypoint sets the default path at start-up. The key itself was never in the image (it is generated into a volume) |
| `X-Request-Id` written to a response header | Semgrep `njsscan…generic_header_injection` (ERROR) | Reviewed false positive: the value is either a fresh UUID or matches `^[A-Za-z0-9-]{8,64}$`, so it cannot contain CR/LF. Proven by `security.test.js` and suppressed inline with a `nosemgrep` comment that explains why |
| nginx forwarded the client's `Host` header to the API | Semgrep `nginx…request-host-used` (warning) | nginx now sends the fixed upstream name (`$proxy_host`) |
| Dependabot proposes brand-new releases immediately | Semgrep `dependabot-missing-cooldown` (warning) | 7-day `cooldown`, so a hijacked or broken release is usually pulled before it is proposed |
| Self-signed key could end up inside an image | Secret in image | Keys generated at container start into volumes |

---

## 12. Testing

### Backend — Jest + Supertest (`cd backend && npm test`)

Runs against an in-memory MongoDB (`mongodb-memory-server`), so no database is needed. The first run downloads a MongoDB binary.

| Suite | Covers |
|---|---|
| `auth.test.js` | Registration and login rules, duplicate email, weak password, invalid role, XSS escaping, NoSQL injection, protected routes |
| `gig.test.js` | Gig CRUD, RBAC, ownership (can't edit or delete another freelancer's gig) |
| `booking.test.js` | Booking rules, **linked transaction created**, income totals |
| `transaction.test.js` | One transaction per booking, no transaction on rejected bookings, client/freelancer views, 404 to non-parties, refunds excluded from income |
| `insights.test.js` | Tax maths checked against every SARS bracket boundary, thresholds, rebates, projection, provisional payments, the dashboard API, previous tax years excluded, validation, RBAC |
| `admin.test.js` | **Every admin route returns 403 to clients and freelancers** and 401 without a token; admin listing, gig removal, suspend → token revoked → login blocked → reactivate; can't suspend self or another admin; validation |
| `security.test.js` | Logout revokes all sessions, account lockout, admin unlock, audit records (and no secrets in them), security headers, request IDs, no-store, malformed JSON, 10 KB limit, forged and `alg:none` tokens, database role wins over token role |
| `rateLimit.test.js` | **Loops failed logins until `429`**, successful logins not counted, registration flood → `429` |

### Frontend — Vitest + React Testing Library (`cd frontend && npm test`)

`Login`, `Register` and `GigCard` (Part 2) plus `Gigs.test.jsx` (booking confirmation shows the amount and the transaction reference, only clients can book), `charts.test.jsx` (bar tooltip on focus, table view, legend values, category shares), `Income.test.jsx` (summary tiles, threshold message, annual estimate and provisional payments, recalculating with expenses and age, error display), `Admin.test.jsx` (stats, suspend, unlock, no suspend button for admins) and `session.test.jsx` (token only in sessionStorage, expired token dropped, auto-logout on expiry and on a `401` event, route guards for each role).

### API — Postman / Newman

- `postman/HustleHub_Part3.postman_collection.json` has **84 requests and 157 assertions**: the Part 2 requests plus transactions, tax insights, admin RBAC (every admin route as client and as freelancer), lockout, logout revocation and security headers.
- `postman/HustleHub_RateLimit.postman_collection.json` loops failed logins until `429` and checks the message and `RateLimit` headers.

```bash
# against the Docker stack (empty database)
npx -p newman -p newman-reporter-htmlextra newman run postman/HustleHub_Part3.postman_collection.json \
  --insecure --env-var baseUrl=https://localhost:3000/api \
  --env-var adminEmail=<ADMIN_EMAIL> --env-var adminPassword=<ADMIN_PASSWORD> \
  -r cli,htmlextra --reporter-htmlextra-export newman/part3.html
npx newman run postman/HustleHub_RateLimit.postman_collection.json --insecure --env-var baseUrl=https://localhost:3000/api
```

CI runs both on every push and keeps the HTML reports as artifacts.

**Latest results:** Jest 107/107 passed, Vitest 38/38 passed, Newman Part 3 84 requests / 157 assertions with 0 failures, and the rate-limit collection reached `429 Too Many Requests` as expected. (One Newman test script originally redeclared a `data` variable, which is a syntax error in the Postman sandbox; it was renamed and the deprecated `postman.setNextRequest` replaced with `pm.execution.setNextRequest`.)

---

## 13. Final security review

Mapped to the OWASP Top 10 (OWASP, 2021).

| Threat | How HustleHub+ addresses it | Verified by |
|---|---|---|
| **Injection — NoSQL** (A03) | `express-mongo-sanitize`; strict validation of every input; IDs validated as ObjectIds; type-checked query values; Mongoose casting; no string-built queries | `auth.test` NoSQL injection test, `admin.test` filter validation, CodeQL |
| **Injection — log forging** (A09) | CR/LF stripped from request-derived strings; JSON logs; request IDs validated | `security.test` unsafe request ID test |
| **Cross-site scripting** (A03) | Input escaped on write; React escapes on render; no `dangerouslySetInnerHTML`; strict CSP with no inline scripts on the API and frontend; build check for inline scripts; token in `sessionStorage` with expiry | `auth.test` XSS test, CI CSP header smoke test, Semgrep React rules |
| **Authentication weaknesses** (A07) | bcrypt (12 rounds); strong password policy; HS256 pinned with iss/aud; 1 h expiry; server-side revocation; account lockout; failed-login rate limiting; generic messages and constant-time unknown-email path; admin cannot self-register | `security.test`, `rateLimit.test`, Newman lockout and logout folders |
| **Broken access control** (A01) | `authorizeRoles` on every route; admin router guarded once; database role used, not token role; ownership checks with non-revealing 404s; suspended users rejected immediately; denied attempts audited | `admin.test` (403 on every route), `gig.test`, `transaction.test`, Newman Admin & RBAC folder |
| **Security misconfiguration** (A05) | Helmet and nginx headers; no `X-Powered-By`; `no-store`; non-root, read-only containers with no capabilities; private networks; DB auth; refuses to start with a weak JWT secret | Trivy misconfig scan, CI smoke test (API not exposed) |
| **Vulnerable components** (A06) | `npm audit`, Trivy fs and image scans in CI; Dependabot; advisories fixed (`uuid`, `react-router`); pinned scanner versions | CI backend, frontend, trivy-fs and docker jobs |
| **Cryptographic failures** (A02) | HTTPS only (TLS 1.2+), HSTS, TLS re-encryption between containers; no secrets in images or the repo | Trivy secret scan, Semgrep `p/secrets` |
| **Logging and monitoring failures** (A09) | Structured, redacted logs of all key events; audit trail; Better Stack transport; CI log summaries | CI log evidence, `security.test` audit tests |
| **Denial of service** | Global and per-endpoint rate limits; 10 KB body limit; result limits on admin lists | `rateLimit.test`, Newman rate-limit loop |
| **CSRF** | Not applicable to the API design: authentication is a bearer header, not a cookie, so a cross-site request can't carry credentials; CORS is restricted to one origin | Design review |

---

## 14. Demonstration evidence

Screenshots are in `docs/evidence/`. Files marked _TODO_ still need to be captured.

| Evidence | File |
|---|---|
| Local security scans (npm audit, Semgrep, Trivy, ZAP) | `docs/evidence/static-analysis/` (generated by `scripts/security-scan.sh --dast`), `docs/evidence/trivy-results.png`, `docs/evidence/security-scan-passed.png` |
| Docker containers running and healthy | `docs/evidence/docker-desktop-containers.png` |
| Newman results (Part 3 and rate limit) | `docs/evidence/newman-part3.png`, `docs/evidence/newman-ratelimit-429.png` |
| Jest and Vitest results | `docs/evidence/jest-results.png`, `docs/evidence/vitest-results.png` |
| Income & tax dashboard | `docs/evidence/income-dashboard.png`, `docs/evidence/income-tax-estimate.png` |
| Transactions page | `docs/evidence/transactions.png` |
| Admin console, users and security log | `docs/evidence/admin-overview.png`, `docs/evidence/admin-users.png`, `docs/evidence/admin-security-log.png` |
| Logs and monitoring (structured API logs of security events; admin security log) | `docs/evidence/api-security-logs.png`, `docs/evidence/admin-security-log.png` |

Part 1 screenshots remain in `docs/screenshots/`.

---

## 15. Known limitations

- Payments are simulated; there is no payment gateway, so a booking is "paid" immediately.
- The tax figure is an estimate for planning, not tax advice (see 5.2).
- No password reset or email verification.
- The dev certificates are self-signed. A real deployment would use a CA-issued certificate (for example Let's Encrypt) at a load balancer.
- Rate-limit and lockout counters are kept in memory per API instance. Running several instances would need a shared store such as Redis.

---

## 16. References

Aqua Security, 2026. *Trivy ecosystem supply chain was briefly compromised (GHSA-69fq-xp46-6x23)*. [online] GitHub. Available at: <https://github.com/aquasecurity/trivy/security/advisories/GHSA-69fq-xp46-6x23> [Accessed 9 November 2026].

Better Stack, 2026. *Ingesting logs via HTTP*. [online] Available at: <https://betterstack.com/docs/logs/ingesting-data/http/logs/> [Accessed 9 November 2026].

Docker, 2026. *Docker security best practices*. [online] Docker Inc. Available at: <https://docs.docker.com/build/building/best-practices/> [Accessed 9 November 2026].

Express.js, 2026. *Production best practices: security*. [online] Available at: <https://expressjs.com/en/advanced/best-practice-security/> [Accessed 7 September 2026].

GitHub, 2026. *Security hardening for GitHub Actions*. [online] GitHub Docs. Available at: <https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions> [Accessed 9 November 2026].

GitHub, 2026. *About code scanning with CodeQL*. [online] GitHub Docs. Available at: <https://docs.github.com/en/code-security/code-scanning/introduction-to-code-scanning/about-code-scanning-with-codeql> [Accessed 9 November 2026].

Jones, M., Bradley, J. and Sakimura, N., 2015. *RFC 7519: JSON web token (JWT)*. [online] Internet Engineering Task Force. Available at: <https://www.rfc-editor.org/rfc/rfc7519.html> [Accessed 7 September 2026].

MDN, 2025. *Content-Security-Policy header*. [online] Mozilla Developer Network. Available at: <https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy> [Accessed 12 October 2026].

Node.js, 2026. *HTTPS*. [online] OpenJS Foundation. Available at: <https://nodejs.org/api/https.html> [Accessed 7 September 2026].

OWASP, 2021. *OWASP Top 10: 2021*. [online] Available at: <https://owasp.org/Top10/> [Accessed 9 November 2026].

OWASP, 2025a. *Authentication cheat sheet*. [online] Available at: <https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html> [Accessed 7 September 2026].

OWASP, 2025b. *Authorization cheat sheet*. [online] Available at: <https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html> [Accessed 12 October 2026].

OWASP, 2025c. *Input validation cheat sheet*. [online] Available at: <https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html> [Accessed 7 September 2026].

OWASP, 2025d. *NoSQL injection prevention cheat sheet*. [online] Available at: <https://cheatsheetseries.owasp.org/cheatsheets/NoSQL_Injection_Prevention_Cheat_Sheet.html> [Accessed 12 October 2026].

OWASP, 2025e. *Content Security Policy cheat sheet*. [online] Available at: <https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html> [Accessed 12 October 2026].

OWASP, 2025f. *Logging cheat sheet*. [online] Available at: <https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html> [Accessed 9 November 2026].

OWASP, 2025g. *Password storage cheat sheet*. [online] Available at: <https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html> [Accessed 7 September 2026].

Provos, N. and Mazières, D., 1999. A future-adaptable password scheme. *1999 USENIX Annual Technical Conference*. Monterey, CA, 6–11 June 1999. Berkeley, CA: USENIX Association.

SARS, 2026. *Rates of tax for individuals*. [online] South African Revenue Service. Available at: <https://www.sars.gov.za/tax-rates/income-tax/rates-of-tax-for-individuals/> [Accessed 9 November 2026].

Semgrep, 2026. *Semgrep Registry rulesets*. [online] Available at: <https://semgrep.dev/explore> [Accessed 9 November 2026].