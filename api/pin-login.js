// POST {email, pin} -> {token}   Sign in with Gmail address + PIN.
const { fb, isGmail, norm, hashPin, same, body, handler } = require("../lib/fb");

module.exports = handler(async (req, res) => {
  const { email: e0, pin } = body(req);
  const email = norm(e0);
  if (!isGmail(email) || !pin || String(pin).length < 4) return res.status(400).json({ error: "Enter a valid Gmail address and a PIN of at least 4 characters." });

  const ref = fb().firestore().doc("pins/" + email);
  const snap = await ref.get();
  if (!snap.exists) return res.status(404).json({ error: "No PIN is set for this Gmail yet." });

  const p = snap.data(), now = Date.now();
  if (p.lockUntil && p.lockUntil > now) return res.status(429).json({ error: `Too many wrong attempts. Try again in ${Math.ceil((p.lockUntil - now) / 1000)} seconds.` });

  if (!same(hashPin(pin, p.salt), p.hash)) {
    const fails = (p.fails || 0) + 1;
    await ref.update(fails >= 5 ? { fails: 0, lockUntil: now + 60000 } : { fails });
    return res.status(401).json({ error: fails >= 5 ? "Incorrect PIN. Sign-in is paused for 1 minute." : "Incorrect PIN. Forgot it? Sign in with Google, or ask your admin to reset it." });
  }
  await ref.update({ fails: 0, lockUntil: 0, lastLogin: now });
  const token = await fb().auth().createCustomToken("pin:" + email, { gmail: email });
  res.status(200).json({ token });
});
