// POST {email, pin, profile} -> {token}   Create an intern account that signs in with Gmail + PIN.
const { fb, isGmail, norm, newSalt, hashPin, body, handler } = require("../lib/fb");

const clean = (v, n = 120) => String(v || "").trim().slice(0, n);
const isDate = v => /^\d{4}-\d{2}-\d{2}$/.test(v || "");
const BASES = ["", "HQ", "OUT_KL", "OUT_PNG", "OUT_MLK", "OUT_JHR"];

module.exports = handler(async (req, res) => {
  const { email: e0, pin, profile = {}, consent } = body(req);
  if (consent !== true) return res.status(400).json({ error: "Please agree to how your attendance data is used." });
  const email = norm(e0);
  if (!isGmail(email)) return res.status(400).json({ error: "Enter a valid Gmail address (ending in @gmail.com)." });
  if (!pin || String(pin).length < 4) return res.status(400).json({ error: "Your PIN must be at least 4 characters." });
  const name = clean(profile.name).replace(/\s+/g, " ");
  if (!name) return res.status(400).json({ error: "Please enter your full name." });

  const fs = fb().firestore();
  const pinRef = fs.doc("pins/" + email), acctRef = fs.doc("accounts/" + email);
  const [p, a, inv] = await Promise.all([pinRef.get(), acctRef.get(), fs.doc("invites/" + email).get()]);
  if (p.exists) return res.status(409).json({ error: "This Gmail already has an account." });
  if (a.exists) return res.status(409).json({ error: "This Gmail already has an account that uses Google sign-in. Sign in with Google, then add a PIN under Details." });

  const now = Date.now(), salt = newSalt();
  const startDate = isDate(profile.startDate) ? profile.startDate : new Date(now + 8 * 3600e3).toISOString().slice(0, 10);
  const endDate = isDate(profile.endDate) && profile.endDate >= startDate ? profile.endDate : "";
  await fs.runTransaction(async tx => {
    tx.set(pinRef, { hash: hashPin(pin, salt), salt, fails: 0, lockUntil: 0, createdAt: now });
    tx.set(acctRef, {
      email, name,
      dept: clean(profile.dept), sup: clean(profile.sup),
      baseAtt: BASES.includes(profile.baseAtt) ? profile.baseAtt : "",
      base: clean(profile.base), startDate, endDate,
      signIn: "pin", status: inv.exists ? "active" : "pending", consentAt: now, createdAt: now, lastLogin: now,
    });
  });
  const token = await fb().auth().createCustomToken("pin:" + email, { gmail: email });
  res.status(200).json({ token });
});
