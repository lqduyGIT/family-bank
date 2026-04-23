// ============================================================
// store.js — auth + group-scoped state with Firestore real-time sync
// Status machine: loading → anonymous | no-group | ready
// ============================================================

import { getFirebase } from './firebase.js';
import { onAuthChange, signInWithGoogle as authSignIn, signOut as authSignOut } from './auth.js';

const EMPTY_STATE = () => ({
  status: 'loading',  // 'loading' | 'anonymous' | 'no-group' | 'ready'
  user: null,         // { uid, displayName, photoURL, email }
  group: null,        // current selected group — { id, name, ownerUid, bankCode, bankName, accountNumber, accountHolder, monthlyTarget, inviteCode, createdAt }
  members: [],        // [{ uid, displayName, photoURL, role, joinedAt }]
  transactions: [],   // [{ id, type, amount, note, category, memberUid, memberName, date }]
  myGroups: [],       // lightweight list of all groups user belongs to — [{ id, name, ownerUid, bankName, inviteCode }]
  preferredBankCode: null,  // user's personal bank for "Chuyển Nhanh" quick-transfer button — e.g. 'MB', 'VCB'
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

      // Load user preferences (personal bank for Quick Transfer)
      this._set({ preferredBankCode: existing.preferredBankCode || null });

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
  getPreferredBankCode() { return this._state.preferredBankCode; }

  async setPreferredBank(code) {
    const user = this._state.user;
    if (!user) throw new Error('Chưa đăng nhập');
    const { db, fsMod } = await getFirebase();
    await fsMod.setDoc(
      fsMod.doc(db, 'users', user.uid),
      { preferredBankCode: code || null },
      { merge: true }
    );
    this._set({ preferredBankCode: code || null });
  }

  // ---- Auth actions ----
  async signInWithGoogle() {
    try { await authSignIn(); }
    catch (e) { this._set({ error: e.message }); throw e; }
  }

  async signOut() {
    // Clear local caches scoped to this app (banks list, etc.) but keep
    // Firebase SDK's IndexedDB since auth state will be reset properly.
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && key.startsWith('family-bank:')) localStorage.removeItem(key);
      }
    } catch {}

    this._teardownGroup();
    this._set({
      status: 'loading', user: null, group: null,
      members: [], transactions: [], error: null,
    });

    await authSignOut();
    // onAuthChange will fire next and transition status → 'anonymous'
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
    await fsMod.setDoc(fsMod.doc(db, 'users', user.uid), { currentGroupId: groupId }, { merge: true });

    this._set({ status: 'loading', group: null, members: [], transactions: [] });
    await this._attachGroup(groupId);
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
      (snap) => {
        if (!snap.exists()) {
          // Group disappeared → reset
          this._teardownGroup();
          this._set({ group: null, members: [], transactions: [], status: 'no-group' });
          return;
        }
        const group = { id: snap.id, ...snap.data() };
        this._set({ group, status: 'ready' });
      },
      (err) => {
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
  async _refreshMyGroups(groupIds) {
    if (!Array.isArray(groupIds) || groupIds.length === 0) {
      this._set({ myGroups: [] });
      return;
    }
    const { db, fsMod } = await getFirebase();
    const snaps = await Promise.all(
      groupIds.map(async (gid) => {
        try { return await fsMod.getDoc(fsMod.doc(db, 'groups', gid)); }
        catch { return null; }
      })
    );
    const myGroups = snaps
      .filter((s) => s && s.exists())
      .map((s) => ({
        id: s.id,
        name: s.data().name,
        ownerUid: s.data().ownerUid,
        bankName: s.data().bankName,
        inviteCode: s.data().inviteCode,
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
