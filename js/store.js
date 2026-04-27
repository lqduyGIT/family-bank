// ============================================================
// store.js — auth + group-scoped state with Firestore real-time sync
// Status machine: loading → anonymous | no-group | ready
// ============================================================

import { getFirebase } from './firebase.js';
import {
  onAuthChange,
  signInWithGoogle as authSignIn,
  signInAsGuest as authSignInAsGuest,
  signOut as authSignOut,
  deleteCurrentUser as authDeleteCurrentUser,
} from './auth.js';

const EMPTY_STATE = () => ({
  status: 'loading',  // 'loading' | 'anonymous' | 'no-group' | 'ready'
  user: null,         // { uid, displayName, photoURL, email }
  group: null,        // current selected group — { id, name, ownerUid, bankCode, bankName, accountNumber, accountHolder, monthlyTarget, inviteCode, createdAt }
  members: [],        // [{ uid, displayName, photoURL, role, joinedAt }]
  transactions: [],   // [{ id, type, amount, note, category, memberUid, memberName, date }]
  myGroups: [],       // lightweight list of all groups user belongs to — [{ id, name, ownerUid, bankName, inviteCode }]
  error: null,
});

class Store {
  constructor() {
    this._state = EMPTY_STATE();
    this._subs = new Set();
    this._unsubAuth = null;
    this._unsubGroup = null;
    this._unsubMembers = null;
    this._unsubTransactions = null;
  }

  // ---- Bootstrap ----
  async init() {
    this._unsubAuth = await onAuthChange(async (user) => {
      // Reset group subs when auth changes
      this._teardownGroup();

      if (!user) {
        this._set({ ...EMPTY_STATE(), status: 'anonymous' });
        return;
      }

      this._set({ user, status: 'loading' });

      // Write/update /users/{uid} doc
      const { db, fsMod } = await getFirebase();
      const userRef = fsMod.doc(db, 'users', user.uid);
      const snap = await fsMod.getDoc(userRef);
      const existing = snap.exists() ? snap.data() : {};

      // Backfill: older user docs had only currentGroupId. Ensure that is
      // also in groupIds so the multi-group UI sees it.
      let groupIds = Array.isArray(existing.groupIds) ? [...existing.groupIds] : [];
      if (existing.currentGroupId && !groupIds.includes(existing.currentGroupId)) {
        groupIds.push(existing.currentGroupId);
      }

      const merged = {
        displayName: user.displayName || existing.displayName || 'Ẩn danh',
        photoURL: user.photoURL || existing.photoURL || '',
        email: user.email || existing.email || '',
        currentGroupId: existing.currentGroupId || null,
        groupIds,
      };
      await fsMod.setDoc(userRef, merged, { merge: true });

      // Load user's groups list (best effort — skip broken refs)
      await this._refreshMyGroups(groupIds);

      if (merged.currentGroupId) {
        await this._attachGroup(merged.currentGroupId);
      } else {
        this._set({ status: 'no-group' });
      }
    });
  }

  // ---- Subscriptions ----
  subscribe(fn) {
    this._subs.add(fn);
    fn(this._state);
    return () => this._subs.delete(fn);
  }

  _set(patch) {
    this._state = { ...this._state, ...patch };
    this._emit();
  }

  _emit() {
    this._subs.forEach((fn) => { try { fn(this._state); } catch (e) { console.error(e); } });
  }

  // ---- Getters ----
  getState() { return this._state; }
  getUser() { return this._state.user; }
  getGroup() { return this._state.group; }
  getMembers() { return this._state.members; }
  getTransactions() { return this._state.transactions; }
  isOwner() { return this._state.group && this._state.user && this._state.group.ownerUid === this._state.user.uid; }

  getBalance() {
    return this._state.transactions.reduce((s, t) => s + (t.type === 'income' ? t.amount : -t.amount), 0);
  }

  getMemberByUid(uid) {
    return this._state.members.find((m) => m.uid === uid) || null;
  }

  getMyGroups() { return this._state.myGroups; }

  // ---- Auth actions ----
  async signInWithGoogle() {
    try { await authSignIn(); }
    catch (e) { this._set({ error: e.message }); throw e; }
  }

  async signInAsGuest() {
    try {
      const cred = await authSignInAsGuest();

      // Race fix: signInAnonymously fires onAuthStateChanged BEFORE
      // updateProfile completes, so the listener captures displayName=null
      // and persists 'Ẩn danh' to users/{uid}. Once updateProfile has run
      // we override both the in-memory state and the Firestore record so
      // 'Guest' shows up immediately — without forcing a full reload.
      if (cred?.user) {
        const newName = cred.user.displayName || 'Guest';

        if (this._state.user) {
          this._set({
            user: { ...this._state.user, displayName: newName },
          });
        }

        try {
          const { db, fsMod } = await getFirebase();
          await fsMod.setDoc(
            fsMod.doc(db, 'users', cred.user.uid),
            { displayName: newName },
            { merge: true }
          );
        } catch (e) {
          console.warn('[guest] firestore displayName update failed:', e);
        }
      }
    } catch (e) {
      this._set({ error: e.message });
      throw e;
    }
  }

  async signOut() {
    // For anonymous (guest) users we tear down everything from the server
    // before signing out so we don't leave behind orphan auth records or
    // data the user can never reach again. For Google users we just sign
    // out — their data stays in Firestore for next login.
    const { auth } = await getFirebase();
    const fbUser = auth.currentUser;
    const isAnonymous = !!fbUser?.isAnonymous;

    // Show loading immediately and clear any cached state from this session.
    this._teardownGroup();
    this._set({
      status: 'loading',
      user: null, group: null, members: [], transactions: [], myGroups: [],
      error: null,
    });

    // Clear local caches scoped to this app (banks list, etc.) but keep
    // Firebase SDK's IndexedDB since auth state will be reset properly.
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && key.startsWith('family-bank:')) localStorage.removeItem(key);
      }
    } catch {}

    if (isAnonymous && fbUser) {
      try {
        await this._deleteGuestData(fbUser.uid);
      } catch (e) {
        console.warn('[guest] data cleanup failed:', e);
      }
      try {
        await authDeleteCurrentUser();
      } catch (e) {
        // Firebase may require recent re-auth; fall through to plain signOut.
        console.warn('[guest] auth delete failed, signing out instead:', e?.code || e);
      }
    }

    // Plain signOut is a no-op if the user was already deleted (delete() also
    // signs the user out and fires onAuthStateChanged), but we call it anyway
    // for the Google path and the guest-delete-failed fallback.
    await authSignOut().catch(() => {});

    // RACE FIX: Firebase delete() schedules onAuthStateChanged → listener
    // sets status='anonymous'. authSignOut() afterwards is a no-op (user
    // already gone), so it does NOT fire a second auth event. If the listener
    // somehow gets queued behind a later state update, the UI gets stuck on
    // 'loading'. Force the final state here — idempotent with the listener.
    this._set({
      status: 'anonymous',
      user: null, group: null, members: [], transactions: [], myGroups: [],
      error: null,
    });
  }

  // Direct Firestore cleanup for a guest's data — leaves every group with
  // the same transfer-or-delete logic as the regular leaveGroup flow, then
  // removes the user doc itself. Doesn't rely on store state because we
  // may not have it loaded for every group.
  async _deleteGuestData(uid) {
    const { db, fsMod } = await getFirebase();
    const userRef = fsMod.doc(db, 'users', uid);

    let groupIds = [];
    try {
      const userSnap = await fsMod.getDoc(userRef);
      if (userSnap.exists()) groupIds = userSnap.data().groupIds || [];
    } catch (e) {
      console.warn('[guest] read user doc failed:', e);
    }

    for (const gid of groupIds) {
      try {
        await this._guestLeaveGroup(uid, gid);
      } catch (e) {
        console.warn('[guest] leave group failed', gid, e);
      }
    }

    try { await fsMod.deleteDoc(userRef); }
    catch (e) { console.warn('[guest] delete user doc failed:', e); }
  }

  async _guestLeaveGroup(uid, groupId) {
    const { db, fsMod } = await getFirebase();
    const groupRef = fsMod.doc(db, 'groups', groupId);
    const groupSnap = await fsMod.getDoc(groupRef);
    if (!groupSnap.exists()) return;

    const group = groupSnap.data();
    const membersSnap = await fsMod.getDocs(fsMod.collection(db, 'groups', groupId, 'members'));
    const members = membersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const others = members.filter((m) => m.uid !== uid);
    const isOwner = group.ownerUid === uid;

    const batch = fsMod.writeBatch(db);
    const memberRef = fsMod.doc(db, 'groups', groupId, 'members', uid);

    if (isOwner && others.length === 0) {
      batch.delete(groupRef);
    } else if (isOwner && others.length > 0) {
      const next = [...others].sort(
        (a, b) => new Date(a.joinedAt || 0) - new Date(b.joinedAt || 0)
      )[0];
      batch.update(groupRef, { ownerUid: next.uid });
      batch.delete(memberRef);
    } else {
      batch.delete(memberRef);
    }

    await batch.commit();

    // Best-effort invite-code cleanup when the group itself was deleted.
    if (isOwner && others.length === 0 && group.inviteCode) {
      try { await fsMod.deleteDoc(fsMod.doc(db, 'inviteCodes', group.inviteCode)); }
      catch (e) { console.warn('[guest] invite code cleanup skipped:', e?.code || e); }
    }
  }

  // ---- Group actions ----
  async createGroup({ name }) {
    const user = this._state.user;
    if (!user) throw new Error('Chưa đăng nhập');
    const trimmed = String(name).trim();
    if (!trimmed) throw new Error('Tên nhóm không được để trống');

    const { db, fsMod } = await getFirebase();
    const groupRef = fsMod.doc(fsMod.collection(db, 'groups'));
    const groupId = groupRef.id;
    const inviteCode = generateInviteCode();

    const groupData = {
      name: trimmed,
      ownerUid: user.uid,
      bankCode: '',
      bankName: '',
      accountNumber: '',
      accountHolder: '',
      monthlyTarget: 2000000,
      inviteCode,
      createdAt: new Date().toISOString(),
    };

    const batch = fsMod.writeBatch(db);
    batch.set(groupRef, groupData);
    batch.set(fsMod.doc(db, 'groups', groupId, 'members', user.uid), {
      uid: user.uid,
      displayName: user.displayName || 'Ẩn danh',
      photoURL: user.photoURL || '',
      role: 'owner',
      joinedAt: new Date().toISOString(),
    });
    batch.set(fsMod.doc(db, 'inviteCodes', inviteCode), {
      groupId,
      createdBy: user.uid,
      createdAt: new Date().toISOString(),
    });
    batch.set(fsMod.doc(db, 'users', user.uid), {
      currentGroupId: groupId,
      groupIds: fsMod.arrayUnion(groupId),
    }, { merge: true });
    await batch.commit();

    await this._refreshMyGroupsFromUserDoc();
    await this._attachGroup(groupId);
    return groupId;
  }

  async joinGroup(rawCode) {
    const user = this._state.user;
    if (!user) throw new Error('Chưa đăng nhập');
    const code = String(rawCode).trim().toUpperCase();
    if (!code) throw new Error('Nhập mã mời');

    const { db, fsMod } = await getFirebase();
    const codeSnap = await fsMod.getDoc(fsMod.doc(db, 'inviteCodes', code));
    if (!codeSnap.exists()) throw new Error('Mã mời không tồn tại');
    const { groupId } = codeSnap.data();

    await fsMod.setDoc(fsMod.doc(db, 'groups', groupId, 'members', user.uid), {
      uid: user.uid,
      displayName: user.displayName || 'Ẩn danh',
      photoURL: user.photoURL || '',
      role: 'member',
      joinedAt: new Date().toISOString(),
    });
    await fsMod.setDoc(fsMod.doc(db, 'users', user.uid), {
      currentGroupId: groupId,
      groupIds: fsMod.arrayUnion(groupId),
    }, { merge: true });

    await this._refreshMyGroupsFromUserDoc();
    await this._attachGroup(groupId);
    return groupId;
  }

  async switchGroup(groupId) {
    const user = this._state.user;
    if (!user) throw new Error('Chưa đăng nhập');
    if (!this._state.myGroups.some((g) => g.id === groupId)) {
      throw new Error('Bạn không phải thành viên của nhóm này');
    }
    if (this._state.group?.id === groupId) return; // already there

    const { db, fsMod } = await getFirebase();

    // Defensive existence check — guards against the case where another
    // device disbanded this group while our myGroups cache was stale. If
    // we tried to attach without checking, the user would see a brief
    // 'loading' flash before falling back to no-group, leaving the dead
    // group still in their list. Catch + clean up + surface a clear error.
    //
    // Two failure modes both mean "group is gone":
    //   1. snap.exists() === false  — doc fully deleted
    //   2. permission-denied error  — group still exists in cache, but
    //      members subcoll was wiped so isMember() denies our read.
    //      This happens when the owner's disband already deleted members
    //      but our local cache hasn't seen the group doc deletion yet.
    let groupSnap;
    try {
      groupSnap = await fsMod.getDoc(fsMod.doc(db, 'groups', groupId));
    } catch (e) {
      if (e?.code === 'permission-denied') {
        await this._cleanupStaleGroup(groupId);
        throw new Error('Nhóm này đã bị giải tán hoặc xoá');
      }
      throw e;
    }
    if (!groupSnap.exists()) {
      await this._cleanupStaleGroup(groupId);
      throw new Error('Nhóm này đã bị giải tán hoặc xoá');
    }

    await fsMod.setDoc(fsMod.doc(db, 'users', user.uid), { currentGroupId: groupId }, { merge: true });

    this._set({ status: 'loading', group: null, members: [], transactions: [] });
    await this._attachGroup(groupId);
  }

  // Remove a no-longer-existing group from our user doc + refresh the
  // in-memory list. Called by both _attachGroup (active group disappeared
  // mid-session) and switchGroup (clicked a stale entry).
  async _cleanupStaleGroup(groupId) {
    const user = this._state.user;
    if (!user || !groupId) return;
    const { db, fsMod } = await getFirebase();
    try {
      await fsMod.setDoc(
        fsMod.doc(db, 'users', user.uid),
        { groupIds: fsMod.arrayRemove(groupId) },
        { merge: true }
      );
    } catch (e) {
      console.warn('[cleanup] groupIds prune failed:', e?.code || e);
    }
    await this._refreshMyGroupsFromUserDoc();
  }

  async leaveGroup() {
    const user = this._state.user;
    const group = this._state.group;
    const members = this._state.members;
    if (!user || !group) return;

    const { db, fsMod } = await getFirebase();
    const isOwner = group.ownerUid === user.uid;
    const others = members.filter((m) => m.uid !== user.uid);

    const batch = fsMod.writeBatch(db);
    const userRef = fsMod.doc(db, 'users', user.uid);
    const memberRef = fsMod.doc(db, 'groups', group.id, 'members', user.uid);

    // Determine the next currentGroupId: fall back to another group the user
    // is in (other than the one being left) so they don't get dumped to the
    // group-gate when other groups still exist.
    const remaining = this._state.myGroups.filter((g) => g.id !== group.id);
    const nextCurrentGroupId = remaining[0]?.id || null;

    const userUpdate = {
      currentGroupId: nextCurrentGroupId,
      groupIds: fsMod.arrayRemove(group.id),
    };

    if (isOwner && others.length === 0) {
      // Last member leaving owned group → delete group doc.
      batch.delete(fsMod.doc(db, 'groups', group.id));
      batch.set(userRef, userUpdate, { merge: true });
    } else if (isOwner && others.length > 0) {
      // Transfer ownership to the oldest remaining member, then leave.
      const nextOwner = [...others].sort(
        (a, b) => new Date(a.joinedAt || 0) - new Date(b.joinedAt || 0)
      )[0];
      batch.update(fsMod.doc(db, 'groups', group.id), { ownerUid: nextOwner.uid });
      batch.delete(memberRef);
      batch.set(userRef, userUpdate, { merge: true });
    } else {
      // Plain member leaving
      batch.delete(memberRef);
      batch.set(userRef, userUpdate, { merge: true });
    }

    await batch.commit();

    // Best-effort cleanup of invite code when deleting the group.
    // Runs outside the batch so a permission error (e.g. caused by ownership
    // transfer history) doesn't block the main leave action.
    if (isOwner && others.length === 0 && group.inviteCode) {
      try {
        await fsMod.deleteDoc(fsMod.doc(db, 'inviteCodes', group.inviteCode));
      } catch (e) {
        console.warn('[store] invite code cleanup skipped:', e.message);
      }
    }

    this._teardownGroup();
    await this._refreshMyGroupsFromUserDoc();

    const nextGroupId = this._state.user && remaining[0]?.id;
    if (nextGroupId) {
      // Switch into another existing group instead of bouncing to group-gate
      this._set({ status: 'loading', group: null, members: [], transactions: [] });
      await this._attachGroup(nextGroupId);
    } else {
      this._set({ group: null, members: [], transactions: [], status: 'no-group' });
    }
  }

  async updateGroupProfile(patch) {
    const group = this._state.group;
    if (!group) throw new Error('Chưa chọn nhóm');
    const { db, fsMod } = await getFirebase();
    await fsMod.updateDoc(fsMod.doc(db, 'groups', group.id), patch);
  }

  // Owner-only: completely tear down the current group — every transaction,
  // every member doc, the invite code and the group doc itself. Other
  // members will see the group disappear via their existing onSnapshot
  // listener (which falls through to status='no-group'). Their stale
  // currentGroupId / groupIds entries clean up on next login via the
  // backfill in the auth listener.
  async disbandGroup() {
    const user = this._state.user;
    const group = this._state.group;
    if (!user || !group) throw new Error('Chưa sẵn sàng');
    if (group.ownerUid !== user.uid) throw new Error('Chỉ chủ nhóm mới giải tán được');

    const { db, fsMod } = await getFirebase();
    const groupId = group.id;
    const inviteCode = group.inviteCode;

    // Firestore client SDK can't recursively delete a subcollection in one
    // shot, so we enumerate + batch-delete each one manually.
    await this._deleteSubcollection(['groups', groupId, 'transactions']);
    await this._deleteSubcollection(['groups', groupId, 'members']);

    // Best-effort invite-code cleanup. Owner may not be the original
    // creator (no transfer logic anymore, but kept defensive); skipping is
    // fine — orphan codes resolve to a missing group on join attempts.
    if (inviteCode) {
      try { await fsMod.deleteDoc(fsMod.doc(db, 'inviteCodes', inviteCode)); }
      catch (e) { console.warn('[disband] invite code cleanup skipped:', e?.code || e); }
    }

    await fsMod.deleteDoc(fsMod.doc(db, 'groups', groupId));

    // Owner's user doc: pull the deleted group out of groupIds and rotate
    // currentGroupId to the next available group, if any.
    const remaining = this._state.myGroups.filter((g) => g.id !== groupId);
    const nextCurrent = remaining[0]?.id || null;
    await fsMod.setDoc(
      fsMod.doc(db, 'users', user.uid),
      {
        currentGroupId: nextCurrent,
        groupIds: fsMod.arrayRemove(groupId),
      },
      { merge: true }
    );

    this._teardownGroup();
    await this._refreshMyGroupsFromUserDoc();

    if (nextCurrent) {
      this._set({ status: 'loading', group: null, members: [], transactions: [] });
      await this._attachGroup(nextCurrent);
    } else {
      this._set({ group: null, members: [], transactions: [], status: 'no-group' });
    }
  }

  async _deleteSubcollection(pathSegments) {
    const { db, fsMod } = await getFirebase();
    const colRef = fsMod.collection(db, ...pathSegments);
    const snap = await fsMod.getDocs(colRef);
    if (snap.empty) return;

    // Firestore caps batch writes at 500 ops; chunk to be safe.
    const docs = snap.docs;
    const CHUNK = 450;
    for (let i = 0; i < docs.length; i += CHUNK) {
      const batch = fsMod.writeBatch(db);
      docs.slice(i, i + CHUNK).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  }

  // ---- Transactions ----
  async addTransaction({ type, amount, note, category, memberUid }) {
    const user = this._state.user;
    const group = this._state.group;
    if (!user || !group) throw new Error('Chưa sẵn sàng');

    const actualMemberUid = memberUid || user.uid;
    const member = this.getMemberByUid(actualMemberUid) || { displayName: user.displayName };

    const { db, fsMod } = await getFirebase();
    const txRef = fsMod.doc(fsMod.collection(db, 'groups', group.id, 'transactions'));
    await fsMod.setDoc(txRef, {
      type,
      amount: Number(amount) || 0,
      note: String(note || '').slice(0, 200),
      category: category || 'other',
      memberUid: actualMemberUid,
      memberName: member.displayName || 'Ẩn danh',
      date: new Date().toISOString(),
      createdBy: user.uid,
    });
  }

  async deleteTransaction(id) {
    const group = this._state.group;
    if (!group) return;
    const { db, fsMod } = await getFirebase();
    await fsMod.deleteDoc(fsMod.doc(db, 'groups', group.id, 'transactions', id));
  }

  // ---- Internal: attach group listeners ----
  async _attachGroup(groupId) {
    this._teardownGroup();
    const { db, fsMod } = await getFirebase();

    const groupRef = fsMod.doc(db, 'groups', groupId);
    this._unsubGroup = fsMod.onSnapshot(
      groupRef,
      async (snap) => {
        if (!snap.exists()) {
          // Group disappeared (e.g. owner disbanded). Clean up our user
          // doc + in-memory list so the group never reappears in pickers,
          // then route to the next group (or no-group). Without this,
          // members keep seeing the dead group in "Nhóm của bạn" until
          // they sign in again, and tapping it just flashes back here.
          this._teardownGroup();
          await this._cleanupStaleGroup(groupId);

          const next = this._state.myGroups[0]?.id;
          if (next) {
            this._set({ status: 'loading', group: null, members: [], transactions: [] });
            await this._attachGroup(next);
          } else {
            this._set({ group: null, members: [], transactions: [], status: 'no-group' });
          }
          return;
        }
        const group = { id: snap.id, ...snap.data() };
        this._set({ group, status: 'ready' });
      },
      async (err) => {
        // permission-denied here = the group still has its doc but the
        // /members subcollection was wiped (mid-disband state), so
        // isMember() in the rules now denies our snapshot. Treat exactly
        // like the !exists() branch above so the disbanded group is
        // pruned from every UI surface immediately.
        if (err?.code === 'permission-denied') {
          this._teardownGroup();
          await this._cleanupStaleGroup(groupId);
          const next = this._state.myGroups[0]?.id;
          if (next) {
            this._set({ status: 'loading', group: null, members: [], transactions: [] });
            await this._attachGroup(next);
          } else {
            this._set({ group: null, members: [], transactions: [], status: 'no-group' });
          }
          return;
        }
        console.error('[store] group snapshot error:', err);
        this._set({ error: 'Không truy cập được nhóm. Có thể bạn đã bị xoá khỏi nhóm.', group: null, members: [], transactions: [], status: 'no-group' });
      }
    );

    this._unsubMembers = fsMod.onSnapshot(
      fsMod.collection(db, 'groups', groupId, 'members'),
      (snap) => {
        const members = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        this._set({ members });
      }
    );

    const txQuery = fsMod.query(
      fsMod.collection(db, 'groups', groupId, 'transactions'),
      fsMod.orderBy('date', 'desc'),
      fsMod.limit(500),
    );
    this._unsubTransactions = fsMod.onSnapshot(txQuery, (snap) => {
      const transactions = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      this._set({ transactions });
    });
  }

  _teardownGroup() {
    if (this._unsubGroup)        { this._unsubGroup();        this._unsubGroup = null; }
    if (this._unsubMembers)      { this._unsubMembers();      this._unsubMembers = null; }
    if (this._unsubTransactions) { this._unsubTransactions(); this._unsubTransactions = null; }
  }

  // ---- Internal: refresh myGroups list ----
  // Verifies every gid in groupIds against the SERVER (not the local cache,
  // which can lag for ~minutes after another device disbands a group).
  // Anything that comes back as deleted, permission-denied, or otherwise
  // unreadable is treated as "the group is gone for me" and pruned out of
  // both the in-memory list AND the user doc — so disbanded groups
  // disappear from every picker on the next refresh, no tap required.
  async _refreshMyGroups(groupIds) {
    if (!Array.isArray(groupIds) || groupIds.length === 0) {
      this._set({ myGroups: [] });
      return;
    }
    const { db, fsMod } = await getFirebase();
    const user = this._state.user;

    const results = await Promise.all(
      groupIds.map(async (gid) => {
        try {
          // Force server read — local cache may still hold a doc that the
          // owner already deleted (Firestore replicates on its own clock).
          const snap = await fsMod.getDocFromServer(fsMod.doc(db, 'groups', gid));
          return snap.exists() ? { snap } : { staleId: gid };
        } catch (e) {
          // permission-denied: members subcoll wiped → rules deny our read
          // → the group is dead from our perspective.
          if (e?.code === 'permission-denied' || e?.code === 'not-found') {
            return { staleId: gid };
          }
          // unavailable: we're offline. Fall back to cache so the picker
          // still shows something — better than an empty list when the
          // network blips. Cache-only result is treated as authoritative
          // for "is this group still around" until we're online again.
          if (e?.code === 'unavailable') {
            try {
              const cached = await fsMod.getDocFromCache(fsMod.doc(db, 'groups', gid));
              return cached.exists() ? { snap: cached } : { staleId: gid };
            } catch { return null; }
          }
          return null;
        }
      })
    );

    // Prune stale gids from the user's groupIds so the picker never
    // surfaces them again on this device or any other.
    const staleIds = results.filter((r) => r?.staleId).map((r) => r.staleId);
    if (staleIds.length > 0 && user) {
      try {
        await fsMod.setDoc(
          fsMod.doc(db, 'users', user.uid),
          { groupIds: fsMod.arrayRemove(...staleIds) },
          { merge: true }
        );
      } catch (e) {
        console.warn('[refresh] prune stale groupIds failed:', e?.code || e);
      }
    }

    const myGroups = results
      .filter((r) => r && r.snap)
      .map(({ snap }) => ({
        id: snap.id,
        name: snap.data().name,
        ownerUid: snap.data().ownerUid,
        bankName: snap.data().bankName,
        inviteCode: snap.data().inviteCode,
      }));
    this._set({ myGroups });
  }

  async _refreshMyGroupsFromUserDoc() {
    const user = this._state.user;
    if (!user) return;
    const { db, fsMod } = await getFirebase();
    const userSnap = await fsMod.getDoc(fsMod.doc(db, 'users', user.uid));
    const groupIds = userSnap.exists() ? (userSnap.data().groupIds || []) : [];
    await this._refreshMyGroups(groupIds);
  }
}

function generateInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // avoid I/O/0/1
  let out = '';
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export const store = new Store();
