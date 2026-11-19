# CLAUDE.md — US Pizza Malaysia intern attendance system

Context for Claude Code. Read this before changing anything.

## What this is
A mobile-first web app for US Pizza Malaysia interns to:
- **Clock In → Lunch Out → Lunch In → Clock Out**, with a location stamp on every event:
  an "Attendance / Location" dropdown (HQ, outlets by state, half-day AM/PM, leave, MC) + a typed
  outlet name, plus the phone's GPS position.
- Apply for **leave** (today or in advance) for admin approval; submit **correction requests** for
  wrong/missing stamps.
- Admins get a dashboard: today's "not clocked in" list, absences, approvals (accounts, leave,
  corrections), team table + CSV export, rules/holidays settings, intern account management.

Status: **built, pushed, not yet live.** Waiting on the Firebase project config and the Vercel deploy (see "Deployment status").

## Stack & layout
Static single-page app + Vercel serverless functions, backed by **Firebase Auth + Firestore**. No build step, no framework.

| Path | Purpose |
|---|---|
| `public/index.html` | The entire app: HTML + CSS + one large inline `<script>` (vanilla JS, IIFE) |
| `public/firebase-adapter.js` | ES module. Loads Firebase v10 from gstatic, wraps Firestore in the small DB interface the app uses, and exposes auth helpers. It resolves `window.fbReady` |
| `public/firebase-config.js` | Firebase web config. **Still has `PASTE_...` placeholders.** While they're there, the app shows "not connected" and only the demo works |
| `api/pin-login.js`, `api/pin-signup.js`, `api/pin-set.js`, `api/account-delete.js` | Vercel functions (CommonJS, `firebase-admin`). Handle Gmail + PIN sign-in by issuing Firebase custom tokens, admin PIN resets and account removal |
| `lib/fb.js` | Shared server helpers: admin init from the `FIREBASE_SERVICE_ACCOUNT` env var, scrypt PIN hashing, caller/admin checks |
| `firestore.rules` | Security rules. **The real access control.** Must be pasted into the Firebase console whenever they change |
| `vercel.json` | `outputDirectory: public`, headers (COOP `same-origin-allow-popups` for the Google popup, geolocation allowed) |
| `public/manifest.webmanifest`, icons | PWA / add-to-home-screen |

### DB interface used by the app (keep it stable)
`db.doc(path)` → `{get, set, update, delete, onSnapshot}`; `db.collection(path)` → `{where, limit, orderBy, doc, get, onSnapshot}`; `db.serverTime()`.
Snapshots: `{id, exists (boolean property), data(), metadata}`. Two implementations:
- `firebase-adapter.js`: real Firestore. `update()` flattens a top-level `events` map into `events.<key>` dotted paths, because Firestore replaces nested maps.
- `makeMemDb()` in `index.html`: in-memory store for **demo mode**. `update()` deep-merges `events`.
Errors are `{code, message}`; `permission-denied` is mapped and shown via `saveErr()`.

## Firestore data model
- `accounts/{gmail}`: name, dept, `sup` (reporting superior), `baseAtt` (location code) + `base` (outlet name), `startDate`, `endDate`, `signIn` (`google`|`pin`), `status` (`pending`|`active`|`rejected`; missing = active), `consentAt`, `createdAt`, `lastLogin`
- `records/{gmail}__{YYYY-MM-DD}`: one per intern per day. `attendance`, `state`, `outlet`, `events.{clockIn,lunchOut,lunchIn,clockOut}` = `{t (device ms), srv (server timestamp), attendance, state, outlet, note, gps{ok,lat,lng,acc|reason}, corrected?, originalT?}`, optional `leave{kind,type,reason,requestId,approvedAt,mcAssetId,markedBy}`, `history[]`
- `leaveRequests/{id}`: `type` (Annual|Medical|University|Emergency|Unpaid), `kind` (leave|mc), from/to, `days[]` (working days), status pending|approved|rejected|cancelled, `approvedDays[]`, `skippedDays[]`, `source:'admin'` when an admin marked the leave directly
- `corrections/{id}`: `changes{key:"HH:MM"}`, `current{}`, reason, `newDay`, status
- `mcfiles/{id}`: compressed MC image or PDF stored as a data URL (no Firebase Storage, so the project stays on the free plan)
- `config/settings`: startTime, endTime, lunchMinutes, graceMinutes, workDays[], holidays[] (`{date,name,where:'all'|[codes]}`), leaveAllowance{}
- `config/adminPin`: optional extra Admin-tab PIN (admins-only read)
- `admins/{gmail}`: admin list (doc exists = admin). The first admin is added by hand in the console
- `invites/{gmail}`: pre-approved interns (account becomes `active` on sign-up)
- `pins/{gmail}`: PIN hashes. Server-only (rules deny all client access)

Location codes: `HQ`, `OUT_KL`, `OUT_PNG`, `OUT_MLK`, `OUT_JHR`, `HALF_AM`, `HALF_PM`, `LEAVE`, `MC` (see `OPTIONS` in index.html).

## Key decisions (don't silently undo)
- **Sign-in: Google OR Gmail + PIN** (the owner asked for both). The PIN must be **at least 4 characters**. PINs are verified server-side. Both methods map to the same account (keyed by lowercase Gmail). In rules, `me()` = verified Google email, or the `gmail` custom claim for PIN sessions.
- **New accounts need admin approval** (`status: pending`), unless pre-approved via `invites`.
- **Anti-tampering:** every new stamp carries `srv: serverTimestamp()`. Rules require `srv == request.time` for new stamps and forbid interns editing or deleting earlier stamps. Interns can only write **today's** record (Malaysia time, `todayMY()` in rules). Leave days are written only by admins (approval). Fixes go through correction requests.
- Flags shown to admins include Late, Long lunch, Left early, No clock-out, No GPS, "Phone clock ahead", "Synced late (offline?)", Corrected, Absent / Not in yet, and Leave pending.
- **Absences are computed, not stored:** expected day = working day (settings) + within the internship dates + not a holiday for the intern's base location. Pending leave shows as "Leave pending", not absent.
- All times are **Asia/Kuala_Lumpur**. Use the helpers (`dayKey`, `klMin`, `tStr`, `keyDate`); never use raw `Date` local time.
- **Demo mode** (in-memory sample data, never touches Firebase) is only visible with `?demo` in the URL on the live site (or when Firebase isn't configured).
- The header style matches the company's existing Intern Daily Log site (60px red `#B91C1C` bar, 32px "USP" circle, Inter 10px/15px titles).
- UI wording: the third tab is **"Admin"**. Interns' managers are called **"Reporting Superior"**.
- Malaysian PDPA: consent tick at sign-up; MC files are visible to admins only.

## House rules
- **Never put the project owner's real personal details** (name, email, university/units, colleagues, workplace specifics) into demo data, sample content, placeholders or commit messages. Use made-up names, e.g. "Alex Tan Jia Wei", "Farah Aziz", "US Pizza Setia City Mall".
- Never commit secrets. The Firebase **service-account key** lives only in the Vercel env var `FIREBASE_SERVICE_ACCOUNT`. (The web config in `firebase-config.js` is public by design.)
- When you change `firestore.rules`, remind the owner to re-publish them in the Firebase console.
- Keep it mobile-first: test at 375–390px wide; tables collapse into cards under 640px; inputs are ≥16px font so iOS doesn't zoom.

## Running & testing locally
```bash
python3 -m http.server 8765 --directory public   # then open http://localhost:8765/?demo
```
With placeholder config, the page shows a "not connected" banner. Tap **🧪 View demo with sample data** to exercise every screen (Clock, My Log, Admin). The API functions need `firebase-admin` + a service account, so test them on Vercel (or with a mocked `firebase-admin`).
Quick syntax check of the inline script: extract the last `<script>` block and run `node --check` on it.

## Deployment status / next steps
1. ⏳ Owner creates the Firebase project (Google sign-in on, Firestore in `asia-southeast1`, production mode), publishes `firestore.rules`, adds their Gmail to `admins`, and provides the **web config** → put it into `public/firebase-config.js`.
2. ⏳ Vercel: import this repo (Framework "Other"), set `FIREBASE_SERVICE_ACCOUNT`, deploy.
3. ⏳ After the Vercel domain is known:
   - add it under Firebase → Authentication → Authorized domains;
   - **iPhone / Safari sign-in fix:** add a Vercel rewrite `/__/auth/:path*` → `https://<projectId>.firebaseapp.com/__/auth/:path*` and set `authDomain` in `firebase-config.js` to the Vercel domain (Safari blocks the cross-site auth iframe otherwise, especially in home-screen mode).
4. Smoke-test live: Google sign-in → onboarding → approval → clock in with GPS → leave → correction → admin approvals.

## Backlog (agreed priorities, after launch)
1. **Email reminders** (Vercel Cron + an email service such as Resend): not clocked in by 9:15, still on lunch, no clock-out by 6:30, daily summary to superiors, leave decision notices.
2. **Reporting superiors see only their own interns** (HR/owner sees all).
3. **Outlet distance check:** store outlet coordinates; flag stamps more than ~300 m away.
4. **Monthly timesheet PDF** per intern, with a signature line.
5. Start/end times per location or per intern; "Change location" stamp during the day.
6. Link with the company's existing Intern Daily Log (shared profile; "today's log not submitted" prompt on clock-out).
7. Smaller: half-day leave, admins editing a stamp directly with a reason, an attendance chart per intern, end-of-internship export for HR.

Open questions for the owner's superior: standard hours and lunch, leave allowances, holiday list vs the company calendar, who the admins are, personal Gmail vs company email, and the privacy/retention wording.
