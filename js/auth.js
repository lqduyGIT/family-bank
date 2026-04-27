// ============================================================
// auth.js — wrappers for Google + Anonymous (guest) sign-in
// ============================================================

import { getFirebase } from './firebase.js';

export async function signInWithGoogle() {
  const { auth, authMod } = await getFirebase();
  const provider = new authMod.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return authMod.signInWithPopup(auth, provider);
}

// Guest sign-in via Firebase Anonymous Auth.
// Atomically increments /counters/guestSequence so each guest gets a
// distinct visible label (Guest 1, Guest 2, …) instead of a confusing
// random uid suffix. The label is set as the user's displayName so the
// rest of the app picks it up via onAuthChange without special casing.
export async function signInAsGuest() {
  const { auth, authMod, db, fsMod } = await getFirebase();

  const cred = await authMod.signInAnonymously(auth);

  // Atomic counter increment (handles first-ever guest by initialising the doc)
  let seq = 1;
  try {
    seq = await fsMod.runTransaction(db, async (txn) => {
      const ref = fsMod.doc(db, 'counters', 'guestSequence');
      const snap = await txn.get(ref);
      const current = snap.exists() ? (snap.data().next || 1) : 1;
      const next = current + 1;
      if (snap.exists()) txn.update(ref, { next });
      else                txn.set(ref, { next });
      return current;
    });
  } catch (e) {
    console.warn('[guest] counter txn failed, falling back to uid suffix:', e);
    seq = cred.user.uid.slice(0, 4).toUpperCase();
  }

  await authMod.updateProfile(cred.user, { displayName: `Guest ${seq}` });
  // Force-refresh local user object so onAuthChange picks up the new name
  await cred.user.reload();

  return cred;
}

export async function signOut() {
  const { auth, authMod } = await getFirebase();
  return authMod.signOut(auth);
}

// Permanently remove the currently authenticated user from Firebase Auth.
// Used on guest sign-out so the anonymous account doesn't pile up.
// Throws if recent re-auth is required (rare for fresh anon users).
export async function deleteCurrentUser() {
  const { auth } = await getFirebase();
  if (auth.currentUser) await auth.currentUser.delete();
}

export async function onAuthChange(fn) {
  const { auth, authMod } = await getFirebase();
  return authMod.onAuthStateChanged(auth, (user) => {
    fn(user ? {
      uid: user.uid,
      displayName: user.displayName,
      photoURL: user.photoURL,
      email: user.email,
      isAnonymous: !!user.isAnonymous,
    } : null);
  });
}
