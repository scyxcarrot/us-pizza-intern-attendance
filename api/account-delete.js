// POST {email} -> admin removes an intern account (and its PIN / invite). Attendance records are kept.
const { fb, norm, body, caller, isAdmin, handler } = require("../lib/fb");

module.exports = handler(async (req, res) => {
  const me = await caller(req);
  if (!me) return res.status(401).json({ error: "Please sign in again." });
  if (!(await isAdmin(me.email))) return res.status(403).json({ error: "Only admins can remove accounts." });
  const email = norm(body(req).email);
  if (!email) return res.status(400).json({ error: "Missing email." });
  if (email === me.email) return res.status(400).json({ error: "You can't remove your own account here." });

  const fs = fb().firestore();
  await Promise.all(["accounts/", "pins/", "invites/"].map(p => fs.doc(p + email).delete()));
  // sign them out everywhere
  try { await fb().auth().revokeRefreshTokens("pin:" + email); } catch (e) {}
  try { const u = await fb().auth().getUserByEmail(email); await fb().auth().revokeRefreshTokens(u.uid); } catch (e) {}
  res.status(200).json({ ok: true });
});
