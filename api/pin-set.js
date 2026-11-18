// POST {pin}          -> set or change your own PIN (must be signed in)
// POST {email, pin}   -> admin resets an intern's PIN
const { fb, norm, newSalt, hashPin, body, caller, isAdmin, handler } = require("../lib/fb");

module.exports = handler(async (req, res) => {
  const me = await caller(req);
  if (!me) return res.status(401).json({ error: "Please sign in again." });
  const { pin, email: e0 } = body(req);
  if (!pin || String(pin).length < 4) return res.status(400).json({ error: "The PIN must be at least 4 characters." });

  const target = e0 ? norm(e0) : me.email;
  if (target !== me.email && !(await isAdmin(me.email))) return res.status(403).json({ error: "Only admins can reset someone else's PIN." });

  const fs = fb().firestore();
  if (!(await fs.doc("accounts/" + target).get()).exists) return res.status(404).json({ error: "That intern account doesn't exist." });
  const salt = newSalt();
  await fs.doc("pins/" + target).set({ hash: hashPin(pin, salt), salt, fails: 0, lockUntil: 0, updatedAt: Date.now(), updatedBy: me.email }, { merge: true });
  // sign out any existing PIN sessions for that intern
  if (target !== me.email) { try { await fb().auth().revokeRefreshTokens("pin:" + target); } catch (e) {} }
  res.status(200).json({ ok: true });
});
