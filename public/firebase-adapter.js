// Connects the attendance page to Firebase (Auth + Firestore) and exposes the
// small database interface the page uses: doc()/collection()/where()/limit()/
// get()/set()/update()/delete()/onSnapshot().
const V = "10.12.2";
const resolve = window.__fbResolve || (() => {});

(async () => {
  let firebaseConfig;
  try { ({ firebaseConfig } = await import("./firebase-config.js")); } catch (e) { firebaseConfig = null; }
  if (!firebaseConfig || !firebaseConfig.apiKey || String(firebaseConfig.apiKey).startsWith("PASTE")) {
    resolve({ ok: false, reason: "config" });
    return;
  }
  try {
    const { initializeApp } = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`);
    const A = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-auth.js`);
    const F = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`);

    const app = initializeApp(firebaseConfig);
    const auth = A.getAuth(app);
    await A.setPersistence(auth, A.browserLocalPersistence).catch(() => {});
    let fs;
    try { fs = F.initializeFirestore(app, { localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }) }); }
    catch (e) { fs = F.getFirestore(app); }

    const errCode = e => (e && e.code === "permission-denied") ? "permission-denied" : (e && e.code) || "unavailable";
    const wrapSnap = s => ({ id: s.id, exists: s.exists(), data: () => s.data(), metadata: { fromCache: s.metadata.fromCache, hasPendingWrites: s.metadata.hasPendingWrites } });
    // Firestore's updateDoc replaces nested maps, so turn {events:{lunchOut:x}} into {"events.lunchOut": x}
    const flat = d => { const o = {}; for (const [k, v] of Object.entries(d)) { if (k === "events" && v && typeof v === "object" && !Array.isArray(v)) { for (const [kk, vv] of Object.entries(v)) o["events." + kk] = vv; } else o[k] = v; } return o; };
    const rethrow = e => { throw { code: errCode(e), message: e && e.message }; };

    const docRef = p => {
      const r = F.doc(fs, p);
      return {
        id: r.id, path: p,
        get: () => F.getDoc(r).then(wrapSnap, rethrow),
        set: d => F.setDoc(r, d).catch(rethrow),
        update: d => F.updateDoc(r, flat(d)).catch(rethrow),
        delete: () => F.deleteDoc(r).catch(rethrow),
        onSnapshot: (next, err) => F.onSnapshot(r, s => next(wrapSnap(s)), e => err && err({ code: errCode(e), message: e.message })),
      };
    };
    const autoId = () => { const c = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"; let s = ""; const a = crypto.getRandomValues(new Uint8Array(20)); for (const b of a) s += c[b % c.length]; return s; };
    const query = (col, cons) => {
      const mk = () => F.query(F.collection(fs, col), ...cons);
      const wrapQ = s => ({ docs: s.docs.map(wrapSnap), size: s.size, empty: s.empty, metadata: { fromCache: s.metadata.fromCache } });
      return {
        path: col,
        where: (f, op, v) => query(col, [...cons, F.where(f, op, v)]),
        limit: n => query(col, [...cons, F.limit(n)]),
        orderBy: (f, dir) => query(col, [...cons, F.orderBy(f, dir || "asc")]),
        doc: id => docRef(col + "/" + (id || autoId())),
        get: () => F.getDocs(mk()).then(wrapQ, rethrow),
        onSnapshot: (next, err) => F.onSnapshot(mk(), s => next(wrapQ(s)), e => err && err({ code: errCode(e), message: e.message })),
      };
    };
    const db = { doc: docRef, collection: c => query(c, []), serverTime: () => F.serverTimestamp() };

    const google = new A.GoogleAuthProvider();
    google.setCustomParameters({ prompt: "select_account" });
    A.getRedirectResult(auth).catch(() => {});

    const toUser = async u => {
      if (!u) return null;
      let email = u.email, provider = "google";
      if (!email) {
        const t = await u.getIdTokenResult();
        email = t.claims.gmail || null; provider = "pin";
      }
      return { uid: u.uid, email: email ? email.toLowerCase() : null, displayName: u.displayName || "", provider };
    };

    resolve({
      ok: true,
      db,
      onAuth: cb => A.onAuthStateChanged(auth, async u => cb(await toUser(u))),
      googleSignIn: async () => {
        try { await A.signInWithPopup(auth, google); }
        catch (e) {
          if (e && (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment")) return A.signInWithRedirect(auth, google);
          throw e;
        }
      },
      signInWithToken: t => A.signInWithCustomToken(auth, t),
      idToken: () => auth.currentUser ? auth.currentUser.getIdToken() : Promise.reject(new Error("Not signed in")),
      signOut: () => A.signOut(auth),
    });
  } catch (e) {
    console.error("Firebase failed to load", e);
    resolve({ ok: false, reason: "load", error: String(e && e.message || e) });
  }
})();
