// ============================================================
// config.js — runtime Firebase config loader
// Reads ./.env (KEY=value format) at first call, then caches.
//
// .env nằm trong .gitignore nên không bị push lên GitHub.
// .env.example là template committed để người khác clone về.
// ============================================================

let _cache = null;
let _inflight = null;

const EMPTY = {
  firebase: {
    apiKey:            '',
    authDomain:        '',
    projectId:         '',
    storageBucket:     '',
    messagingSenderId: '',
    appId:             '',
    measurementId:     '',
  },
};

export async function loadConfig() {
  if (_cache) return _cache;
  if (_inflight) return _inflight;

  _inflight = (async () => {
    const env = await tryFetchEnv('./.env');
    _cache = {
      firebase: {
        apiKey:            env.FB_API_KEY             || EMPTY.firebase.apiKey,
        authDomain:        env.FB_AUTH_DOMAIN         || EMPTY.firebase.authDomain,
        projectId:         env.FB_PROJECT_ID          || EMPTY.firebase.projectId,
        storageBucket:     env.FB_STORAGE_BUCKET      || EMPTY.firebase.storageBucket,
        messagingSenderId: env.FB_MESSAGING_SENDER_ID || EMPTY.firebase.messagingSenderId,
        appId:             env.FB_APP_ID              || EMPTY.firebase.appId,
        measurementId:     env.FB_MEASUREMENT_ID      || EMPTY.firebase.measurementId,
      },
    };
    return _cache;
  })();

  return _inflight;
}

export async function isConfigured() {
  const c = await loadConfig();
  return !!c.firebase.apiKey && !!c.firebase.projectId && !!c.firebase.appId;
}

async function tryFetchEnv(url) {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return {};
    const text = await res.text();
    // GitHub Pages 404 page is HTML with 200 status in some edge cases — guard against it
    if (text.trim().toLowerCase().startsWith('<!doctype')) return {};
    return parseEnv(text);
  } catch {
    return {};
  }
}

function parseEnv(text) {
  const out = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (key) out[key] = val;
  }
  return out;
}
