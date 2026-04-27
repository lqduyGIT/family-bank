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
  const { auth, authMod } = await getFirebase();

  const cred = await authMod.signInAnonymously(auth);

  // Display name is fixed at "Guest" — no per-user numbering, no Firestore
  // counter, no transactions to retry. Anonymous users share the label
  // (their uid is still unique, so Firestore docs and group memberships
  // never collide). updateProfile is wrapped in a soft 3s timeout so a
  // slow network can't pin the login spinner; the label is cosmetic and
  // will repopulate on the next reload if it gets skipped here.
  try {
    await Promise.race([
      authMod.updateProfile(cred.user, { displayName: 'Guest' }).then(() => cred.user.reload()),
      new Promise((_, reject) => setTimeout(() => reject(new Error('updateProfile-timeout')), 3000)),
    ]);
  } catch (e) {
    console.warn('[guest] updateProfile/reload skipped:', e?.message);
  }

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
