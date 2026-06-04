# GP Engage API

Node.js REST API for the GP patient engagement platform.

## Stack
- **Runtime**: Node.js 20+ (ES Modules)
- **Framework**: Express 4
- **Database**: PostgreSQL via Supabase
- **Cache**: Redis (optional, via Upstash)
- **Auth**: JWT + NHS Login OAuth 2.0
- **Validation**: Zod
- **Logging**: Winston

---

## Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
```
Open `.env` and fill in:
- `DATABASE_URL` — from Supabase Dashboard → Settings → Database → URI
- `JWT_SECRET` — generate with: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`

Everything else is optional for local development.

### 3. Run the schema
In Supabase SQL Editor, paste and run the contents of `gp_engage_schema.sql`.

### 4. Start the server
```bash
npm run dev     # development (auto-restarts on file changes)
npm start       # production
```

### 5. Check it's working
```
GET http://localhost:3000/health
```
Should return `{"status":"ok",...}`

---

## API Reference

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/staff/login` | Staff email + password login |
| POST | `/auth/staff/logout` | Revoke session |
| POST | `/auth/patient/login` | Patient direct login |
| GET | `/auth/nhs-login` | Redirect to NHS Login |
| GET | `/auth/nhs-login/callback` | NHS Login OAuth callback |
| GET | `/auth/me` | Current user info |

### Consultation Requests
| Method | Endpoint | Who | Description |
|--------|----------|-----|-------------|
| POST | `/requests` | Patient | Submit new request |
| GET | `/requests/mine` | Patient | Patient's own requests |
| GET | `/requests` | Staff | Full inbox with filters |
| GET | `/requests/alerts` | Staff | Unacknowledged urgent alerts |
| GET | `/requests/:id` | Both | Request detail + messages |
| PATCH | `/requests/:id/status` | Staff | Update status, add notes |
| PATCH | `/requests/:id/acknowledge-alert` | Staff | Acknowledge urgent flag |

### Messages
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/requests/:requestId/messages` | Send a message |
| GET | `/requests/:requestId/messages` | Get messages |

### Practice Management
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/practice` | Practice details + demand |
| PATCH | `/practice/demand` | Update request limits |
| GET | `/practice/demand/today` | Today's counts vs limits |
| GET | `/practice/staff` | List staff users |
| POST | `/practice/staff` | Create staff user |
| PATCH | `/practice/staff/:id/duty` | Set duty GP |

---

## Project Structure
```
src/
├── index.js              # App entry point, middleware, server startup
├── config/
│   ├── database.js       # PostgreSQL pool + query/transaction helpers
│   └── redis.js          # Redis client + cache helpers
├── middleware/
│   ├── auth.js           # JWT verify, role guards, token generators
│   ├── validate.js       # Zod request validation
│   └── audit.js          # NHS DSP Toolkit audit logging
├── routes/
│   ├── auth.js           # Login, logout, NHS Login OAuth
│   ├── requests.js       # Consultation request lifecycle
│   ├── messages.js       # Secure messaging
│   └── practice.js       # Practice settings, demand management, staff
└── services/
    ├── demand.js          # Capacity checking logic
    └── notifications.js   # SMS + email dispatch
```

---

## Security notes
- All patient data queries enforce practice isolation via PostgreSQL Row-Level Security
- JWT sessions are stored server-side and can be revoked immediately
- All auth endpoints are rate-limited to 10 requests per 15 minutes
- Passwords hashed with bcrypt (cost factor 12)
- Clinical notes are never returned to patient-authenticated requests
- Audit log is append-only — no UPDATE or DELETE on audit_log table

---

## Next steps
1. Build the React frontend (patient portal + staff inbox)
2. Add file upload endpoint (patient image attachments)
3. Add video consultation (Daily.co integration)
4. Register for NHS Login sandbox credentials
5. Add EMIS/Vision write-back when NHS Digital API access is approved
