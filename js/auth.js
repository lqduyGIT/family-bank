// ============================================================
// auth.js — Google sign-in wrapper
// ============================================================

import { getFirebase } from './firebase.js';

export async function signInWithGoogle() {
  const { auth, authMod } = await getFirebase();
  const provider = new authMod.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return authMod.signInWithPopup(auth, provider);
}

export async function signOut() {
  const { auth, authMod } = await getFirebase();
  return authMod.signOut(auth);
}

export async function onAuthChange(fn) {
  const { auth, authMod } = await getFirebase();
  return authMod.onAuthStateChanged(auth, (user) => {
    fn(user ? {
      uid: user.uid,
      displayName: user.displayName,
      photoURL: user.photoURL,
      email: user.email,
    } : null);
  });
}
