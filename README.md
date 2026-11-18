# US Pizza Malaysia — Intern Attendance

Clock in / lunch out / lunch in / clock out with location + GPS stamps, leave & MC,
correction requests, absence tracking and an admin dashboard. Static page + 3 small
Vercel server functions, backed by Firebase (Auth + Firestore). Works on phones and
can be installed to the home screen.

## Project layout

| Path | What it is |
|---|---|
| `public/index.html` | The whole app (UI + logic) |
| `public/firebase-adapter.js` | Connects the app to Firebase Auth + Firestore |
| `public/firebase-config.js` | **Your Firebase web config goes here** |
| `api/pin-login.js`, `api/pin-signup.js`, `api/pin-set.js` | Gmail + PIN sign-in, done on the server so PINs stay secret |
| `lib/fb.js` | Shared helpers for the server functions |
| `firestore.rules` | Database security rules (paste into Firebase) |

## One-time setup

### 1. Firebase
1. Create a project at <https://console.firebase.google.com>.
2. **Authentication → Sign-in method → Google → Enable.**
3. **Firestore Database → Create database →** `asia-southeast1` **→ production mode.**
4. **Firestore → Rules:** paste the contents of `firestore.rules` → **Publish**.
5. **Project settings → General → Your apps → Web (`</>`)** → copy the config into `public/firebase-config.js`.
6. **Make yourself an admin:** Firestore → **Start collection** `admins` → Document ID = your Gmail in lowercase (e.g. `yourname@gmail.com`) → add any field (e.g. `role` = `owner`) → Save.
   Add more admins (reporting superiors, HR) the same way.

### 2. Vercel
1. **Add New → Project → Import** this GitHub repo. Framework preset: **Other**. No build command needed.
2. **Settings → Environment Variables:** add `FIREBASE_SERVICE_ACCOUNT` with the full JSON of a
   service-account key (Firebase → Project settings → **Service accounts → Generate new private key**).
   Paste the whole file contents as the value. **Never commit this key to GitHub.**
3. Deploy, then copy your site's domain (e.g. `us-pizza-attendance.vercel.app`).

### 3. Allow sign-in from your Vercel domain
Firebase → **Authentication → Settings → Authorized domains → Add domain** → your Vercel domain.

## How sign-in works
- **Sign in with Google** — interns tap the button; on first sign-in they fill in name, department,
  reporting superior, base location and internship dates.
- **Gmail + PIN** — interns can instead create an account with their Gmail and a PIN (min 4 characters).
  The PIN is checked by `api/pin-login.js`; hashes live in the `pins` collection, which the browser can't read.
- Either method signs in to the **same account** (keyed by Gmail). A Google user can add a PIN under **Details**.
- Admins reset forgotten PINs from **Admin → Intern accounts → Reset PIN**.

## Data (Firestore collections)
`accounts`, `records` (`<gmail>__<YYYY-MM-DD>`), `corrections`, `mcfiles` (compressed MC photos),
`config/settings` (start time, lunch, working days, holidays, optional admin PIN), `admins`, `pins` (server only).

## Anti-tampering
- Every new stamp carries a server timestamp; the rules reject stamps whose server time isn't the real time,
  and the dashboard flags **"Phone clock off"** when a phone's clock differs from the server by > 5 minutes.
- Interns can add new stamps but can't edit or delete earlier ones — fixes go through correction requests.
- GPS works on the Vercel site (HTTPS); stamps without GPS are flagged.
