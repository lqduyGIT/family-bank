// ============================================================
// firebase.js — Firebase SDK wiring (ESM CDN, no build)
// ============================================================

import { loadConfig } from './config.js';

const FB_VERSION = '10.12.2';

let _firebase = null;

export async function getFirebase() {
  if (_firebase) return _firebase;

  const [cfg, appMod, authMod, fsMod] = await Promise.all([
    loadConfig(),
    import(`https://www.gstatic.com/firebasejs/${FB_VERSION}/firebase-app.js`),
    import(`https://www.gstatic.com/firebasejs/${FB_VERSION}/firebase-auth.js`),
    import(`https://www.gstatic.com/firebasejs/${FB_VERSION}/firebase-firestore.js`),
  ]);

  const app = appMod.initializeApp(cfg.firebase);
  const auth = authMod.getAuth(app);

  // Enable Firestore IndexedDB persistence BEFORE any read/write so data
  // from last session shows up instantly on reload — the realtime listener
  // then reconciles with the server in the background.
  //
  // Multi-tab manager lets several tabs share the same IndexedDB cache
  // without races; older API (enableIndexedDbPersistence) only allowed one
  // active tab.
  let db;
  try {
    db = fsMod.initializeFirestore(app, {
      localCache: fsMod.persistentLocalCache({
        tabManager: fsMod.persistentMultipleTabManager(),
      }),
    });
  } catch (e) {
    console.warn('[firestore] persistent cache init failed, using memory cache:', e?.code || e?.message);
    db = fsMod.getFirestore(app);
  }

  _firebase = { app, auth, db, appMod, authMod, fsMod };
  return _firebase;
}
