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
  const db = fsMod.getFirestore(app);

  _firebase = { app, auth, db, appMod, authMod, fsMod };
  return _firebase;
}
