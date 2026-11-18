// Shared helpers for the PIN sign-in server functions.
// Needs the Vercel environment variable FIREBASE_SERVICE_ACCOUNT, containing the
// full JSON of a Firebase service-account key (Project settings → Service accounts).
const admin = require("firebase-admin");
const crypto = require("crypto");

function fb() {
  if (!admin.apps.length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT is not set on Vercel.");
    const sa = JSON.parse(raw);
    if (sa.private_key) sa.private_key = sa.private_key.replace(/\\n/g, "\n");
    admin.initializeApp({ credential: admin.credential.cert(sa) });
  }
  return admin;
}

const isGmail = e => /^[a-z0-9][a-z0-9.+_-]*@(gmail|googlemail)\.com$/.test(e);
const norm = e => String(e || "").trim().toLowerCase();
const newSalt = () => crypto.randomBytes(16).toString("hex");
const hashPin = (pin, salt) => crypto.scryptSync(String(pin), salt, 32).toString("hex");
const same = (a, b) => { const x = Buffer.from(a, "hex"), y = Buffer.from(b, "hex"); return x.length === y.length && crypto.timingSafeEqual(x, y); };

function body(req) {
  if (req.body && typeof req.body === "object") return req.body;
  try { return JSON.parse(req.body || "{}"); } catch (e) { return {}; }
}

// Who is calling (from the Firebase ID token in the Authorization header)
async function caller(req) {
  const m = String(req.headers.authorization || "").match(/^Bearer (.+)$/);
  if (!m) return null;
  try {
    const t = await fb().auth().verifyIdToken(m[1]);
    const email = t.email && t.email_verified ? t.email : t.gmail;
    return email ? { uid: t.uid, email: norm(email) } : null;
  } catch (e) { return null; }
}
async function isAdmin(email) {
  const s = await fb().firestore().doc("admins/" + email).get();
  return s.exists;
}

function handler(fn) {
  return async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });
    try { await fn(req, res); }
    catch (e) { console.error(e); res.status(500).json({ error: "Server error. Please try again." }); }
  };
}

module.exports = { fb, isGmail, norm, newSalt, hashPin, same, body, caller, isAdmin, handler };
