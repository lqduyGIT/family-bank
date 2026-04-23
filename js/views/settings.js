// ============================================================
// views/settings.js — group profile (bank info, target), leave, sign out
// Bank picker uses VietQR public API
// ============================================================

import { store } from '../store.js';
import { fetchBanks } from '../banks.js';
import { parseAmountInput, formatVND, escapeHtml, BANK_APPS } from '../utils.js';
import { toast } from '../components/toast.js';
import { confirmDialog } from '../components/modal.js';
import { openAddGroupForm } from '../components/add-group-form.js';

export function render(mount, storeRef = store) {
  mount.innerHTML = shell();

  const banksPromise = fetchBanks().catch(() => []);

  const unsub = storeRef.subscribe(async (state) => {
    if (state.status !== 'ready' || !state.group) return;
    await update(mount, state, banksPromise);
  });

  // Bind actions (re-binding after render is idempotent because we replace entire shell innerHTML only once)
  mount.querySelector('[data-act="save"]').addEventListener('click', () => saveProfile(mount));
  mount.querySelector('[data-act="leave"]').addEventListener('click', () => leaveGroup());
  mount.querySelector('[data-act="signout"]').addEventListener('click', () => signOut());
  mount.querySelector('[data-act="add-group"]').addEventListener('click', () => openAddGroupForm());
  mount.querySelector('[data-act="save-pref-bank"]').addEventListener('click', () => savePreferredBank(mount));

  return () => unsub();
}

function shell() {
  return `
    <section class="px-5">
      <h2 class="text-xl font-bold text-slate-800 mb-1">Cài đặt</h2>
      <p class="text-sm text-slate-500 mb-5" data-role>—</p>

      <!-- My groups -->
      <div class="bg-white rounded-3xl p-5 neu-soft mb-5">
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-sm font-semibold text-slate-800 flex items-center gap-2">
            <i class="fa-solid fa-layer-group text-violet-600"></i> Nhóm của tôi
          </h3>
          <button data-act="add-group" class="text-xs text-emerald-600 font-semibold flex items-center gap-1 hover:text-emerald-700">
            <i class="fa-solid fa-plus"></i> Thêm nhóm
          </button>
        </div>
        <div data-my-groups class="space-y-2"></div>
      </div>

      <!-- Personal bank (per user, for Quick Transfer) -->
      <div class="bg-gradient-to-br from-emerald-50 to-white border border-emerald-100 rounded-3xl p-5 mb-5">
        <h3 class="text-sm font-semibold text-slate-800 mb-1 flex items-center gap-2">
          <i class="fa-solid fa-wallet text-emerald-600"></i> Ngân hàng của tôi
        </h3>
        <p class="text-[11px] text-slate-500 mb-4">
          Dùng cho nút <strong>⚡ Chuyển Nhanh</strong> ở Trang chủ — app ngân hàng này sẽ mở khi bạn muốn chuyển tiền vào quỹ.
        </p>
        <div class="space-y-3">
          <div>
            <label class="fb-label">Chọn ngân hàng bạn hay dùng</label>
            <select data-field="preferredBankCode" class="fb-input">
              <option value="">— Chưa chọn (tắt tính năng Chuyển Nhanh) —</option>
              ${BANK_APPS.map((b) => `<option value="${b.code}">${escapeHtml(b.name)}</option>`).join('')}
            </select>
          </div>
          <button data-act="save-pref-bank" class="fb-btn fb-btn-primary">
            <i class="fa-regular fa-floppy-disk mr-1"></i> Lưu ngân hàng cá nhân
          </button>
        </div>
      </div>

      <!-- Group bank info (for QR generation) -->
      <div class="bg-white rounded-3xl p-5 neu-soft mb-5">
        <h3 class="text-sm font-semibold text-slate-800 mb-1 flex items-center gap-2">
          <i class="fa-solid fa-building-columns text-slate-500"></i> Ngân hàng nhận (của nhóm)
        </h3>
        <p class="text-[11px] text-slate-500 mb-4">Dùng để sinh mã VietQR đóng quỹ — chủ nhóm cấu hình</p>

        <div class="space-y-3">
          <div>
            <label class="fb-label">Ngân hàng</label>
            <select data-field="bankCode" class="fb-input">
              <option value="">Đang tải danh sách...</option>
            </select>
          </div>
          <div>
            <label class="fb-label">Số tài khoản</label>
            <input data-field="accountNumber" inputmode="numeric" class="fb-input font-mono" maxlength="20" />
          </div>
          <div>
            <label class="fb-label">Chủ tài khoản (IN HOA, KHÔNG DẤU)</label>
            <input data-field="accountHolder" class="fb-input uppercase" maxlength="50" placeholder="NGUYEN THI HOA" />
          </div>
          <div>
            <label class="fb-label">Gợi ý số tiền đóng quỹ / tháng</label>
            <input data-field="monthlyTarget" inputmode="numeric" class="fb-input" placeholder="2,000,000" />
          </div>
        </div>
      </div>

      <!-- Group meta -->
      <div class="bg-white rounded-3xl p-5 neu-soft mb-5">
        <h3 class="text-sm font-semibold text-slate-800 mb-1">Nhóm gia đình</h3>
        <p class="text-[11px] text-slate-500 mb-4">Thông tin nhóm và mã mời</p>
        <div class="space-y-3">
          <div>
            <label class="fb-label">Tên nhóm</label>
            <input data-field="groupName" class="fb-input" maxlength="40" />
          </div>
          <div>
            <label class="fb-label">Mã mời</label>
            <input data-field="inviteCode" class="fb-input font-mono tracking-[0.2em] text-center bg-slate-100" readonly />
            <p class="text-[11px] text-slate-400 mt-1">Chia sẻ mã này cho các thành viên muốn tham gia</p>
          </div>
        </div>
      </div>

      <!-- Save -->
      <button data-act="save" class="fb-btn fb-btn-primary mb-5">
        <i class="fa-regular fa-floppy-disk mr-1"></i> Lưu thay đổi
      </button>

      <!-- Danger zone -->
      <div class="bg-white rounded-3xl p-5 neu-soft mb-5">
        <h3 class="text-sm font-semibold text-red-500 mb-3">Vùng nguy hiểm</h3>
        <button data-act="leave" class="fb-btn fb-btn-ghost mb-2 text-red-500">
          <i class="fa-solid fa-door-open mr-1"></i> Rời khỏi nhóm
        </button>
        <button data-act="signout" class="fb-btn fb-btn-ghost text-slate-500">
          <i class="fa-solid fa-right-from-bracket mr-1"></i> Đăng xuất
        </button>
      </div>

      <p class="text-center text-[10px] text-slate-400 pb-4">Family Bank · v1.0 · Made with Wudi_lng2609❤️</p>
    </section>
  `;
}

async function update(mount, state, banksPromise) {
  const { group, user, myGroups } = state;
  const roleEl = mount.querySelector('[data-role]');
  const isOwner = store.isOwner();
  roleEl.textContent = isOwner ? '👑 Bạn là chủ nhóm — có quyền chỉnh sửa' : '🙋 Bạn là thành viên — chỉ chủ nhóm mới sửa được';

  renderMyGroupsList(mount, myGroups, group, user);

  // Populate bank select
  const bankSelect = mount.querySelector('[data-field="bankCode"]');
  if (bankSelect.options.length <= 1) {
    const banks = await banksPromise;
    if (banks.length > 0) {
      bankSelect.innerHTML = `<option value="">— Chọn ngân hàng —</option>` +
        banks.map((b) => `<option value="${b.code}" data-name="${escapeHtml(b.shortName)}" data-bin="${escapeHtml(b.bin || '')}">${escapeHtml(b.shortName)} — ${escapeHtml(b.name)}</option>`).join('');
    } else {
      bankSelect.innerHTML = `<option value="">Không tải được (kiểm tra mạng)</option>`;
    }
  }

  // Fill only if input not currently focused (avoid stealing user typing)
  const active = document.activeElement;
  const setField = (name, val) => {
    const el = mount.querySelector(`[data-field="${name}"]`);
    if (!el || el === active) return;
    el.value = val ?? '';
  };

  setField('bankCode',      group.bankCode || '');
  setField('accountNumber', group.accountNumber || '');
  setField('accountHolder', group.accountHolder || '');
  setField('monthlyTarget', group.monthlyTarget ? new Intl.NumberFormat('vi-VN').format(group.monthlyTarget) : '');
  setField('groupName',     group.name || '');
  setField('inviteCode',    group.inviteCode || '');
  setField('preferredBankCode', state.preferredBankCode || '');

  // Disable group-owned inputs if not owner. Personal fields (preferred
  // bank) stay editable for every user regardless of role.
  const personalFields = new Set(['preferredBankCode']);
  mount.querySelectorAll('[data-field]').forEach((el) => {
    if (el.dataset.field === 'inviteCode') return; // always readonly
    if (personalFields.has(el.dataset.field)) return;
    el.disabled = !isOwner;
  });
  mount.querySelector('[data-act="save"]').disabled = !isOwner;
  mount.querySelector('[data-act="save"]').style.opacity = isOwner ? '1' : '0.5';
}

async function savePreferredBank(mount) {
  const select = mount.querySelector('[data-field="preferredBankCode"]');
  const code = select.value || null;

  const btn = mount.querySelector('[data-act="save-pref-bank"]');
  btn.disabled = true;
  const oldHtml = btn.innerHTML;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-1"></i> Đang lưu...`;

  try {
    await store.setPreferredBank(code);
    const bankName = BANK_APPS.find((b) => b.code === code)?.name;
    toast(code ? `Đã lưu ${bankName}` : 'Đã tắt Chuyển Nhanh', 'success');
  } catch (err) {
    console.error(err);
    toast(err.message || 'Lưu thất bại', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = oldHtml;
  }
}

function renderMyGroupsList(mount, myGroups, currentGroup, user) {
  const container = mount.querySelector('[data-my-groups]');
  if (!container) return;

  if (!myGroups || myGroups.length === 0) {
    container.innerHTML = `<p class="text-xs text-slate-400 italic">Bạn chưa tham gia nhóm nào khác.</p>`;
    return;
  }

  container.innerHTML = myGroups.map((g) => {
    const isCurrent = currentGroup && g.id === currentGroup.id;
    const isOwnerOfG = user && g.ownerUid === user.uid;
    return `
      <button
        data-switch-group="${g.id}"
        class="w-full flex items-center gap-3 p-3 rounded-2xl text-left transition
               ${isCurrent ? 'bg-emerald-50 border-2 border-emerald-200' : 'bg-slate-50 hover:bg-emerald-50 border-2 border-transparent'}"
        ${isCurrent ? 'disabled style="cursor:default"' : ''}
      >
        <div class="w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white shrink-0">
          <i class="fa-solid fa-house text-xs"></i>
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-semibold text-slate-800 truncate flex items-center gap-1.5">
            ${escapeHtml(g.name || '—')}
            ${isOwnerOfG ? '<span class="text-[9px] bg-amber-100 text-amber-700 font-bold px-1.5 py-0.5 rounded">👑</span>' : ''}
            ${isCurrent ? '<span class="text-[9px] bg-emerald-600 text-white font-bold px-1.5 py-0.5 rounded">Đang ở đây</span>' : ''}
          </p>
          <p class="text-[10px] text-slate-500 truncate">${g.bankName ? escapeHtml(g.bankName) : 'Chưa cấu hình ngân hàng'}</p>
        </div>
        ${!isCurrent ? '<i class="fa-solid fa-chevron-right text-slate-400 text-xs"></i>' : ''}
      </button>
    `;
  }).join('');

  // Bind switch handlers (only to non-current, non-disabled buttons)
  container.querySelectorAll('[data-switch-group]').forEach((btn) => {
    if (btn.disabled) return;
    btn.addEventListener('click', async () => {
      btn.style.opacity = '0.5';
      btn.style.pointerEvents = 'none';
      try {
        await store.switchGroup(btn.dataset.switchGroup);
        toast('Đã chuyển nhóm', 'success');
      } catch (err) {
        console.error(err);
        toast(err.message || 'Không chuyển được nhóm', 'error');
        btn.style.opacity = '1';
        btn.style.pointerEvents = '';
      }
    });
  });
}

async function saveProfile(mount) {
  const bankSelect = mount.querySelector('[data-field="bankCode"]');
  const selectedOpt = bankSelect.options[bankSelect.selectedIndex];
  const bankCode = bankSelect.value;
  const bankName = selectedOpt?.dataset.name || '';
  const bankBin  = selectedOpt?.dataset.bin  || '';  // BIN needed for local EMV QR render
  const accountNumber = mount.querySelector('[data-field="accountNumber"]').value.trim();
  const accountHolder = mount.querySelector('[data-field="accountHolder"]').value.trim().toUpperCase();
  const monthlyTarget = parseAmountInput(mount.querySelector('[data-field="monthlyTarget"]').value);
  const name = mount.querySelector('[data-field="groupName"]').value.trim();

  if (!name) return toast('Tên nhóm không được để trống', 'error');

  const btn = mount.querySelector('[data-act="save"]');
  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-1"></i> Đang lưu...`;

  try {
    await store.updateGroupProfile({
      bankCode, bankName, bankBin, accountNumber, accountHolder, monthlyTarget, name,
    });
    toast(`Đã lưu · mục tiêu ${formatVND(monthlyTarget)}`, 'success');
  } catch (err) {
    console.error(err);
    toast(err.message || 'Lưu thất bại', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i class="fa-regular fa-floppy-disk mr-1"></i> Lưu thay đổi`;
  }
}

async function leaveGroup() {
  const state = store.getState();
  const group = state.group;
  const user = state.user;
  const members = state.members;
  if (!group || !user) return;

  const isOwner = group.ownerUid === user.uid;
  const others = members.filter((m) => m.uid !== user.uid);

  let title, message;
  if (isOwner && others.length === 0) {
    title = '⚠ Xoá nhóm vĩnh viễn?';
    message = `Bạn là thành viên cuối cùng của "${group.name}". Rời đi sẽ <strong>xoá nhóm và toàn bộ lịch sử giao dịch</strong>. Hành động không thể hoàn tác.`;
  } else if (isOwner && others.length > 0) {
    const nextOwner = [...others].sort((a, b) => new Date(a.joinedAt || 0) - new Date(b.joinedAt || 0))[0];
    title = 'Chuyển quyền chủ nhóm?';
    message = `Bạn là chủ nhóm "${group.name}". Rời đi → quyền quản lý sẽ chuyển cho <strong>${nextOwner.displayName || 'Ẩn danh'}</strong> (thành viên tham gia sớm nhất). Bạn có thể tham gia lại bằng mã mời, nhưng sẽ thành thành viên thường.`;
  } else {
    title = 'Rời khỏi nhóm?';
    message = `Bạn sẽ không còn thấy giao dịch của "${group.name}". Có thể tham gia lại bằng mã mời sau.`;
  }

  const ok = await confirmDialog({
    title, message,
    confirmText: isOwner && others.length === 0 ? 'Xoá nhóm' : 'Rời nhóm',
    danger: true,
  });
  if (!ok) return;

  try {
    await store.leaveGroup();
    toast(isOwner && others.length === 0 ? 'Đã xoá nhóm' : 'Đã rời nhóm', 'info');
  } catch (err) {
    console.error(err);
    toast(err.message || 'Không rời được — thử lại', 'error');
  }
}

async function signOut() {
  const ok = await confirmDialog({
    title: 'Đăng xuất?',
    message: 'Dữ liệu vẫn an toàn trên máy chủ. Đăng nhập lại với cùng tài khoản Google sẽ thấy ngay.',
    confirmText: 'Đăng xuất',
    danger: true,
  });
  if (!ok) return;
  try {
    await store.signOut();
    toast('Đã đăng xuất', 'info');
  } catch (err) {
    console.error(err);
    toast(err.message || 'Đăng xuất thất bại', 'error');
  }
}
