# Smart Waste Hyderabad

Smart Waste Hyderabad is a full-stack proof of concept that helps the Greater Hyderabad Municipal Corporation (GHMC) orchestrate daily solid-waste operations. A MongoDB-backed REST API powers planning, analytics, billing, and scheduling workflows, while a React + Material UI control centre provides tailored workspaces for administrators, field crews, and residents.

## Feature Highlights
- **Operations**: Route optimisation respects truck capacity, bin fill thresholds, and returns a greedy nearest-neighbour path. Collector and dispatcher views keep crews in sync.
- **Scheduling**: Residents can request special pickups, check slot availability, confirm bookings, and receive receipts with optional email notifications.
- **Billing**: UPI-powered payments via QR code, digital receipts, and billing history for residents plus reconciliation utilities for staff. Invoice numbers prefixed with `GHMC-SC-`.
- **Analytics**: Admin-only dashboards with configurable filters, KPI cards, charts, and export options (PDF/Excel) for household, regional, and waste-type insights.
- **Access Control**: Account registration, login, lockout protection, and role-based dashboards for admins, crews, and residents.
- **Gamification**: Residents earn points for scheduling pickups and paying bills on time, with a leaderboard to track standings.
- **Developer Tooling**: Seed script for realistic Hyderabad demo data, comprehensive backend analytics tests with >95% coverage, and frontend utilities tested with Vitest.

## Architecture_
- **Backend** (`backend/`): Node.js (Express 5) REST API, Mongoose 8 ODM, Zod validation, Stripe integration, Nodemailer notifications.
- **Frontend** (`frontend/`): React 19 + Vite, Tailwind CSS, Material UI 6, React Router 7, React Leaflet for maps, Lucide icons.
- **Database**: MongoDB Atlas (or any reachable MongoDB deployment) for operational, billing, and analytics data.

## Requirements
- Node.js 18 or newer (project tested on the current LTS release)
- npm 9 or newer
- Reachable MongoDB instance (local or hosted via MongoDB Atlas)
- SMTP credentials (optional for email notifications)

## Installation & Setup

### 1. Install dependencies
```powershell
cd smart-waste-management-system
cd backend
npm install
cd ..\frontend
npm install
```

### 2. Configure environment variables
Create `backend/.env` with values that suit your environment:
```ini
PORT=4000
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster-host>/<database>?retryWrites=true&w=majority
NODE_ENV=development
COLLECTION_AUTHORITY_EMAIL=your_email@gmail.com
SMTP_HOST=smtp.gmail.com               # Optional – required only if you want email notifications
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_16_char_app_password
SMTP_FROM="Smart Waste Hyderabad" <your_email@gmail.com>
```

> Keep credentials out of source control. The application gracefully degrades when SMTP settings are omitted — emails will be skipped silently without crashing the app.

**Setting up Gmail SMTP (App Password):**
1. Go to `myaccount.google.com`
2. Security → 2-Step Verification → Turn ON
3. Search "App passwords" → Create → Name it "SmartWaste"
4. Copy the 16-character password → paste into `SMTP_PASS`

### 3. Seed demo data (optional but recommended)
Populate MongoDB with demo zones, bins, waste collection records, invoices, and test users:
```powershell
cd ..\scripts
node seedHYD.js
```
The seeder uses `backend/.env` to locate MongoDB and will upsert admin, collector, and resident demo accounts across Hyderabad GHMC zones.

### 4. Run the backend API
```powershell
cd ..\backend
npm run dev
```
- Serves the REST API on `http://localhost:4000`.
- Uses Nodemon to reload when files in `backend/src` change.

### 5. Run the frontend app
In a new PowerShell window:
```powershell
cd smart-waste-management-system\frontend
npm run dev
```
- Vite serves the UI on `http://localhost:5173` and proxies `/api` calls to `http://localhost:4000`.

## Demo Accounts
The seed script provisions the following credentials (passwords can be reset in MongoDB Compass if needed):
- **Admin**: `admin@smartwaste.hyd` / `Admin@123`
- **Field crew**: `collector@smartwaste.hyd` / `Collector@123`
- **Resident**: `resident@smartwaste.hyd` / `Resident@123`

These users unlock admin dashboards, crew checklists, and resident billing/scheduling flows immediately after seeding.

## UPI Payment Flow
Payments are handled via UPI QR code — no Stripe required:
1. Resident clicks **"Pay now via UPI"** on any outstanding bill
2. A QR code is generated locally using `qrcode.react`
3. Resident scans with any UPI app (GPay, PhonePe, Paytm etc.)
4. Resident enters UTR reference number to confirm
5. Bill is marked **Paid** and receipt is generated automatically

UPI ID configured in the app: `**********@ybl`

## GHMC Zones Supported
The application covers the following 6 GHMC zones:
- Charminar
- Kukatpally
- LB Nagar
- Secunderabad
- Serilingampally
- Uppal

## Email Notifications
When SMTP is configured, the following emails are sent automatically:

| Trigger | Recipient | Content |
|---|---|---|
| Resident books a slot | Resident | Confirmation + slot details + PDF receipt |
| Resident books a slot | GHMC ops team | Full pickup details + payment info |
| Deferred payment booking | Resident | Payment pending warning + due date |

All emails are sent in IST (Asia/Kolkata) timezone with INR (₹) currency and 18% GST breakdown.

## Testing & Quality
- **Backend (Jest + Supertest)**
	- `npm test` – run all backend tests.
	- `npm run test:analytics` – focus on analytics service/controller suites.
	- `npm run test:billing` – run billing module tests.
	- `npm run test:coverage` – generate coverage reports (analytics module exceeds 96% coverage, see `TEST_COVERAGE_REPORT.md`).
- **Frontend (Vitest + ESLint)**
	- `npm run lint` – lint React code with the ESLint 9 flat config.
	- `npm test` – execute Vitest suites.

Additional quality notes and refactoring decisions are documented in `CODE_QUALITY_IMPROVEMENTS.md` and `REFACTORING_SUMMARY.md` at the repository root.

## Key API Endpoints
| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/health` | Service heartbeat for monitoring. |
| POST | `/api/auth/login` | Authenticate users; enforces lockout rules. |
| POST | `/api/auth/register` | Register residents with validation. |
| POST | `/api/ops/routes/optimize` | Generate a route plan based on selected city/zone inputs. |
| GET | `/api/ops/routes/:truckId/today` | Fetch today's route for a truck (defaults to `TRUCK-01`). |
| POST | `/api/ops/collections` | Record a collection event and mark a stop as visited. |
| GET | `/api/ops/routes/:truckId/directions` | Retrieve OSRM-based driving directions for the active plan. |
| GET | `/api/ops/summary` | Pull operational KPIs for dashboards. |
| GET | `/api/schedules/special/config` | Surface special collection policies, item types, and thresholds. |
| POST | `/api/schedules/special/availability` | Check slot availability for a resident's preferred window. |
| POST | `/api/schedules/special/confirm` | Confirm booking and trigger confirmation + authority emails. |
| GET | `/api/schedules/special/my` | List a resident's upcoming and historical special requests. |
| GET | `/api/billing/bills` | Return outstanding and paid bills for the authenticated resident. |
| POST | `/api/billing/pay-upi` | Confirm UPI payment with UTR reference and mark bill as paid. |
| GET | `/api/billing/transactions/:transactionId/receipt` | Generate a PDF receipt for auditing and download. |
| GET | `/api/analytics/config` | Provide analytics filter metadata (admin-only). |
| POST | `/api/analytics/report` | Compile analytics aggregates and headline metrics (admin-only). |

## Frontend Workspaces
- **Home & Navigation**: Role-aware entry points — Residents → User Dashboard, Collectors → Ops, Admins → Admin Dashboard.
- **Collection Ops**: Dispatcher dashboard with GHMC zone selectors, KPI cards, and embedded maps.
- **Collector View**: On-shift checklist with live status, bin marking, and banner messaging across Hyderabad GHMC zones.
- **Route Optimisation**: Shows optimisation progress, KPIs, summaries, and mini-map previews.
- **Billing**: Resident-friendly invoice list with `GHMC-SC-` prefixed invoices, UPI payment flow, and payment history.
- **Scheduling**: Special collection booking flows, slot availability across 5-day lookahead window, and history logs.
- **Analytics Reports**: Configurable filters, timeline charts, export utilities, and printable reports for GHMC zones.
- **Leaderboard & Points**: Gamification dashboard showing resident points and rankings.

## Repository Structure
```
backend/        Express API, domain modules, tests, and coverage reports
frontend/       Vite React application, page modules, and Vitest setup
scripts/        Utility scripts (seedHYD.js for Hyderabad demo data)
CODE_QUALITY_IMPROVEMENTS.md
REFACTORING_SUMMARY.md
TEST_COVERAGE_REPORT.md
Report.html     # Design critique SPA
```

## Documentation & Reports
- `CODE_QUALITY_IMPROVEMENTS.md` – Deep dive into SOLID principles, design patterns, and refactoring decisions.
- `REFACTORING_SUMMARY.md` – High-level summary of backend/frontend improvements.
- `TEST_COVERAGE_REPORT.md` – Detailed analytics module coverage statistics (96%+).
- `backend/coverage/` and `frontend/coverage/` – Generated coverage artefacts from Jest and Vitest runs.
- `Report.html` – Standalone design critique SPA.

thanks for exploring Smart Waste Hyderabad! 🗑️