# HustleHub+ — Secure Foundations & Secure Stack

HustleHub+ is a freelance marketplace platform where freelancers advertise services ("gigs") and clients browse and book them. Part 1 built the authentication backend. Part 2 turns that into a full MERN stack: a MongoDB-backed data layer, gig management, bookings with simulated payment, and a React frontend.

## System overview

- **Authentication.** Passwords are hashed before they're stored, never kept in plain text. Logging in returns a JWT that's used to prove identity on later requests.
- **Gigs.** Freelancers create, update, deactivate and delete gigs. Anyone can browse active gigs; only the owning freelancer can change or remove one of theirs.
- **Bookings & transactions.** Clients book a gig with a simulated payment. Each booking doubles as the transaction record — it captures the amount, both parties, and payment status at the moment it's created.
- **Income.** Freelancers see a running total of their income, derived from their own paid bookings.
- **Frontend.** A React app covers registration, login, browsing gigs, booking, gig management, and income — all talking to the API over HTTPS with a JWT in the `Authorization` header.

## Intended users

- **Clients** — browse and book freelancer gigs. Register with `role: "client"`.
- **Freelancers** — advertise gigs, manage their own listings, and track income from bookings. Register with `role: "freelancer"`.
- **Admins** — manage the platform (Part 3). Can't self-register through this API — the `role` field only accepts `client` or `freelancer`.

## Architecture

MERN stack: MongoDB (via Mongoose), Express/Node API, React frontend. Part 1's file-based user store was deliberately written with stable function signatures (`findByEmail`, `createUser`, `findById`) so it could be swapped for a real database without touching the controllers — that swap is what happened for Part 2.

```
React frontend (Vite)
        │  HTTPS, JWT in Authorization header
        ▼
Express API (server.js)
  → Helmet (incl. Content-Security-Policy), CORS, rate limiting, mongo-sanitize, logging
  → Routes → validation → RBAC → controllers
  → Mongoose models (User, Gig, Booking) → MongoDB
```

Ownership is enforced in the controllers, not just by role: being a freelancer lets you manage gigs, but every update/delete on a gig first checks that `gig.freelancer` matches the authenticated user's id before doing anything. A gig that belongs to someone else returns the same 404 a non-existent gig would, so the response itself can't be used to find out whose gigs exist.

### Backend structure

```
hustlehub/
├── server.js                      # HTTPS entry point, connects to MongoDB first
├── src/
│   ├── app.js                     # Express app, middleware, routes
│   ├── config/
│   │   ├── env.js                 # Environment config
│   │   └── db.js                  # Mongoose connection
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── gigController.js
│   │   └── bookingController.js
│   ├── middleware/
│   │   ├── authenticateToken.js   # Verifies JWTs on protected routes
│   │   ├── authorizeRoles.js      # RBAC - restricts routes by role
│   │   ├── validators.js          # Input validation & sanitisation rules
│   │   ├── rateLimiter.js         # Brute-force / abuse protection
│   │   └── errorHandler.js        # Central error handling
│   ├── models/
│   │   ├── User.js                # Mongoose schema
│   │   ├── Gig.js
│   │   ├── Booking.js             # Also the transaction record
│   │   └── userModel.js           # Thin data-access wrapper around User
│   ├── routes/
│   │   ├── authRoutes.js
│   │   ├── gigRoutes.js
│   │   └── bookingRoutes.js
│   ├── utils/
│   │   ├── token.js                # JWT sign/verify
│   │   └── logger.js                # Winston logger
│   └── __tests__/
├── scripts/generate-cert.sh
├── postman/
│   ├── HustleHub_Part1.postman_collection.json
│   └── HustleHub_Part2.postman_collection.json
├── frontend/                       # React app (see below)
├── docs/
└── package.json
```

### Frontend structure

```
frontend/
├── src/
│   ├── api/client.js               # axios instance, attaches JWT, normalises errors
│   ├── context/AuthContext.jsx     # login/register/logout state
│   ├── components/
│   │   ├── Navbar.jsx
│   │   ├── ProtectedRoute.jsx      # UX redirect only - not a security boundary
│   │   ├── GigCard.jsx
│   │   └── FieldErrors.jsx
│   ├── pages/
│   │   ├── Login.jsx / Register.jsx
│   │   ├── Gigs.jsx                # browse + book
│   │   ├── MyGigs.jsx              # freelancer CRUD
│   │   ├── MyBookings.jsx          # client's booking history
│   │   └── Income.jsx              # freelancer income + bookings
│   └── __tests__/
└── package.json
```

A request to book a gig moves like this: the React app calls `POST /api/bookings` with a JWT attached automatically by the axios interceptor; the request passes rate limiting, JWT verification and the `client`-only RBAC check in `bookingRoutes.js`, then `bookingController.createBooking` loads the gig, rejects a freelancer trying to book their own gig, and creates a `Booking` document that is itself the transaction record. If anything fails, `errorHandler.js` logs the details server-side and the frontend shows only the generic message that came back.

## Setup

### Backend

```bash
cd hustlehub
npm install
cp .env.example .env
# generate a JWT secret and paste it into .env:
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# MongoDB: install locally (e.g. brew install mongodb-community on macOS, then
# brew services start mongodb-community) or use a MongoDB Atlas connection
# string, and set MONGODB_URI in .env accordingly.

npm run cert       # generates a local self-signed HTTPS cert
npm start           # → https://localhost:5443
npm test             # runs the Jest/Supertest suite (see Testing)
```

Because the cert is self-signed, Postman and browsers will flag it — disable SSL certificate verification in Postman's settings for local testing (or use `curl -k`).

### Frontend

```bash
cd hustlehub/frontend
npm install
cp .env.example .env   # VITE_API_URL defaults to https://localhost:5443/api
npm run dev             # → http://localhost:3000
npm test                 # runs the Vitest/React Testing Library suite
```

## API

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| GET | `/api/health` | No | Health check |
| POST | `/api/auth/register` | No | Create an account |
| POST | `/api/auth/login` | No | Log in, get a JWT |
| GET | `/api/auth/profile` | Yes | Example protected route |
| GET | `/api/gigs` | No | Browse active gigs |
| GET | `/api/gigs/:id` | No | View a single gig |
| GET | `/api/gigs/my` | Yes (freelancer) | View your own gigs |
| POST | `/api/gigs` | Yes (freelancer) | Create a gig |
| PUT | `/api/gigs/:id` | Yes (freelancer, owner only) | Update your gig |
| DELETE | `/api/gigs/:id` | Yes (freelancer, owner only) | Delete your gig |
| POST | `/api/bookings` | Yes (client) | Book a gig (simulated payment) |
| GET | `/api/bookings/my` | Yes (client) | Your own booking history |
| GET | `/api/bookings/freelancer` | Yes (freelancer) | Bookings against your gigs |
| GET | `/api/bookings/freelancer/income` | Yes (freelancer) | Income total from paid bookings |

**Register:**
```json
{ "name": "Naledi Khumalo", "email": "naledi@example.com", "password": "Str0ng!Passw0rd", "role": "freelancer" }
```

**Create gig:**
```json
{ "title": "Logo design", "description": "A clean, modern logo for your brand.", "category": "Design", "price": 250 }
```

**Book a gig:**
```json
{ "gigId": "<gig id>" }
```

All protected routes expect `Authorization: Bearer <token>`.

## Security decisions

**Password hashing.** Passwords are hashed with bcrypt (12 salt rounds) before they're stored — never saved or logged in plain text. Bcrypt was chosen over something like SHA-256 because it's deliberately slow and salts each password individually, which makes brute-forcing a stolen hash impractical (OWASP, 2025; Provos and Mazières, 1999).

**JWT authentication.** Logging in or registering returns a JWT signed with HS256, containing just the user's id, email, and role (Jones, Bradley and Sakimura, 2015). Tokens expire after an hour, and verification pins the algorithm to HS256 so a forged token can't exploit an "alg: none" attack.

**Role-based access control.** `authorizeRoles` middleware restricts routes to specific roles (e.g. only freelancers can create gigs, only clients can book them), following the principle of least privilege (OWASP, 2025). Role alone isn't enough for gigs, though — ownership is checked separately in the controller, because "is this your gig?" isn't something a role can express.

**Input validation and sanitisation.** Every field on every write endpoint goes through `express-validator`: it rejects malformed input and escapes free-text fields (titles, descriptions, names) so that a value like `<script>` is stored as harmless encoded text rather than live markup — a defence against stored XSS (OWASP, 2025). `express-mongo-sanitize` additionally strips any request key starting with `$` or containing `.`, which blocks MongoDB operator-injection payloads (e.g. `{"email": {"$gt": ""}}`) from ever reaching a query (OWASP, 2025).

**Content Security Policy.** Helmet is configured with an explicit CSP restricting scripts, styles and framing to the API's own origin and blocking plugins entirely, on top of its other default headers (OWASP, 2025; MDN, 2025).

**HTTPS.** The server only ever starts over HTTPS — there's no plain HTTP fallback (Node.js, 2026).

**Rate limiting.** Login, registration and booking creation are all rate-limited, so a brute-force attempt against credentials or an attempt to flood the system with fake bookings/transactions both get slowed down (Express.js, 2026).

**Other things worth mentioning.** Login returns the same generic message whether the email doesn't exist or the password is wrong, so it can't be used for user enumeration. Updating or deleting someone else's gig returns the same 404 a non-existent gig would, for the same reason. CORS is locked to a specific origin. Request bodies are capped at 10kb.

## Testing

### Backend (Jest + Supertest)

`npm test` runs the Jest/Supertest suite against an in-memory MongoDB instance (`mongodb-memory-server`), covering:

- Registration/login (success, duplicate email, weak password, bad email, invalid role, stored-XSS defence, NoSQL-injection attempt).
- Gig creation, browsing, and — the important one — **ownership enforcement**: a freelancer cannot update or delete another freelancer's gig, and `/api/gigs/my` only ever returns gigs the caller owns.
- Booking creation (simulated payment), RBAC (freelancers can't book, clients can't manage gigs), and income totals correctly summing multiple paid bookings.

The first run of `npm test` needs an internet connection to download a local MongoDB binary for `mongodb-memory-server` — after that it's cached and runs offline.

### Frontend (Vitest + React Testing Library)

`npm test` inside `frontend/` runs component rendering and interaction tests: `GigCard` renders the data (and action) it's given, `Login`/`Register` render their fields, accept typed input, and surface the backend's field-level validation errors without ever showing anything beyond that safe, pre-sanitised text.

### Postman / Newman

`postman/HustleHub_Part2.postman_collection.json` covers auth, gigs (including ownership-violation scenarios) and bookings/transactions/income, each with built-in `pm.test()` assertions. Import it, disable SSL verification for localhost, and run via Collection Runner, or from the command line:

```bash
npx newman run postman/HustleHub_Part2.postman_collection.json --insecure
```

against a freshly-started server and an empty database.

## Known limitations

Payment is entirely simulated — there's no real payment gateway integration, so a booking is recorded as "paid" immediately. There's no password reset or email verification. Admin accounts and admin-only functionality aren't built yet (Part 3). Containerisation, CI/CD and automated security scanning are also Part 3 scope.

## References

Express.js, 2026. *Production best practices: security*. [online] Available at: <https://expressjs.com/en/advanced/best-practice-security/> [Accessed 7 September 2026].

Jones, M., Bradley, J. and Sakimura, N., 2015. *RFC 7519: JSON web token (JWT)*. [online] Internet Engineering Task Force. Available at: <https://www.rfc-editor.org/rfc/rfc7519.html> [Accessed 7 September 2026].

MDN, 2025. *Content-Security-Policy header*. [online] Mozilla Developer Network. Available at: <https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy> [Accessed 12 October 2026].

Node.js, 2026. *HTTPS*. [online] OpenJS Foundation. Available at: <https://nodejs.org/api/https.html> [Accessed 7 September 2026].

OWASP, 2025. *Access control cheat sheet*. [online] Available at: <https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html> [Accessed 12 October 2026].

OWASP, 2025. *Authentication cheat sheet*. [online] Available at: <https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html> [Accessed 7 September 2026].

OWASP, 2025. *Content Security Policy cheat sheet*. [online] Available at: <https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html> [Accessed 12 October 2026].

OWASP, 2025. *Input validation cheat sheet*. [online] Available at: <https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html> [Accessed 7 September 2026].

OWASP, 2025. *NoSQL injection prevention cheat sheet*. [online] Available at: <https://cheatsheetseries.owasp.org/cheatsheets/NoSQL_Injection_Prevention_Cheat_Sheet.html> [Accessed 12 October 2026].

OWASP, 2025. *Password storage cheat sheet*. [online] Available at: <https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html> [Accessed 7 September 2026].

Provos, N. and Mazières, D., 1999. A future-adaptable password scheme. *1999 USENIX Annual Technical Conference*. Monterey, CA, 6–11 June 1999. Berkeley, CA: USENIX Association.
