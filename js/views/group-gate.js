// ============================================================
// views/group-gate.js — pick/create/join a family group
// Shows:
//   - List of groups user already belongs to (if any) → tap to switch
//   - Create new group form
//   - Join by invite-code form
// ============================================================

import { store } from '../store.js';
import { toast } from '../components/toast.js';
import { escapeHtml } from '../utils.js';

export function render(mount) {
  const state = store.getState();
  const user = state.user;
  const myGroups = state.myGroups || [];

  mount.innerHTML = `
    <section class="px-6 pt-4 pb-10">
      <div class="flex items-center justify-between mb-6">
        <div class="flex items-center gap-3">
          ${user?.photoURL ? `<img src="${user.photoURL}" class="w-10 h-10 rounded-full" referrerpolicy="no-referrer" />` : ''}
          <div>
            <p class="text-[11px] text-slate-500">Đã đăng nhập</p>
            <p class="text-sm font-semibold text-slate-800">${escapeHtml(user?.displayName || user?.email || '')}</p>
          </div>
        </div>
        <button id="sign-out" class="text-xs text-slate-500 hover:text-red-500 font-medium">
          <i class="fa-solid fa-right-from-bracket"></i> Đăng xuất
        </button>
      </div>

      <div class="text-center mb-6">
        <div class="w-16 h-16 mx-auto rounded-2xl bg-emerald-100 flex items-center justify-center mb-3">
          <i class="fa-solid fa-people-group text-emerald-600 text-2xl"></i>
        </div>
        <h1 class="text-xl font-bold text-slate-800">${myGroups.length > 0 ? 'Chọn nhóm để vào' : 'Chọn nhóm gia đình'}</h1>
        <p class="text-sm text-slate-500 mt-1">
          ${myGroups.length > 0 ? `Bạn đang là thành viên của ${myGroups.length} nhóm` : 'Tạo nhóm mới hoặc tham gia nhóm có sẵn'}
        </p>
      </div>

      ${myGroups.length > 0 ? renderMyGroupsSection(myGroups, user) : ''}

      <!-- Create group -->
      <div class="bg-white rounded-3xl p-5 neu-soft mb-4">
        <h2 class="text-sm font-semibold text-slate-800 mb-1 flex items-center gap-2">
          <span class="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 text-xs font-bold flex items-center justify-center">+</span>
          Tạo nhóm mới
        </h2>
        <p class="text-xs text-slate-500 mb-4 ml-9">Bạn sẽ là chủ nhóm của nhóm mới này.</p>
        <div class="space-y-3">
          <input id="group-name" class="fb-input" placeholder="Tên nhóm, VD: Nhà Minh Hoa" maxlength="40" />
          <button id="create-btn" class="fb-btn fb-btn-primary">
            <i class="fa-solid fa-plus mr-1"></i> Tạo nhóm
          </button>
        </div>
      </div>

      <!-- Join group -->
      <div class="bg-white rounded-3xl p-5 neu-soft">
        <h2 class="text-sm font-semibold text-slate-800 mb-1 flex items-center gap-2">
          <span class="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">→</span>
          Tham gia nhóm khác
        </h2>
        <p class="text-xs text-slate-500 mb-4 ml-9">Nhập mã mời 6 ký tự do người tạo nhóm chia sẻ.</p>
        <div class="space-y-3">
          <input id="invite-code" class="fb-input text-center text-lg font-mono tracking-[0.3em] uppercase" placeholder="ABCD23" maxlength="6" autocomplete="off" />
          <button id="join-btn" class="fb-btn fb-btn-ghost">
            <i class="fa-solid fa-right-to-bracket mr-1"></i> Tham gia
          </button>
        </div>
      </div>
    </section>
  `;

  // My-groups: click to switch
  mount.querySelectorAll('[data-switch-group]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const gid = btn.dataset.switchGroup;
      setBusy(btn, true);
      try {
        await store.switchGroup(gid);
      } catch (err) {
        console.error(err);
        toast(err.message || 'Không vào được nhóm', 'error');
        setBusy(btn, false);
      }
    });
  });

  const nameInput = mount.querySelector('#group-name');
  const codeInput = mount.querySelector('#invite-code');
  const createBtn = mount.querySelector('#create-btn');
  const joinBtn   = mount.querySelector('#join-btn');

  codeInput.addEventListener('input', () => {
    codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  });

  // Auto-fill invite code from URL (?invite=ABCD23)
  const inviteFromUrl = new URLSearchParams(location.search).get('invite');
  if (inviteFromUrl) {
    codeInput.value = inviteFromUrl.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  }

  createBtn.addEventListener('click', async () => {
    const name = nameInput.value.trim();
    if (!name) return toast('Nhập tên nhóm', 'error');
    setFormBusy(createBtn, true, 'Đang tạo...');
    try {
      await store.createGroup({ name });
      toast('Đã tạo nhóm', 'success');
    } catch (err) {
      console.error(err);
      toast(err.message || 'Tạo nhóm thất bại', 'error');
    } finally {
      setFormBusy(createBtn, false, '<i class="fa-solid fa-plus mr-1"></i> Tạo nhóm');
    }
  });

  joinBtn.addEventListener('click', async () => {
    const code = codeInput.value.trim();
    if (code.length !== 6) return toast('Mã mời gồm 6 ký tự', 'error');
    setFormBusy(joinBtn, true, 'Đang tham gia...');
    try {
      await store.joinGroup(code);
      toast('Đã tham gia nhóm', 'success');
    } catch (err) {
      console.error(err);
      toast(err.message || 'Không tham gia được', 'error');
    } finally {
      setFormBusy(joinBtn, false, '<i class="fa-solid fa-right-to-bracket mr-1"></i> Tham gia');
    }
  });

  mount.querySelector('#sign-out').addEventListener('click', () => store.signOut());
}

function renderMyGroupsSection(myGroups, user) {
  return `
    <div class="bg-white rounded-3xl p-5 neu-soft mb-4">
      <h2 class="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2">
        <span class="w-7 h-7 rounded-lg bg-violet-100 text-violet-700 text-xs font-bold flex items-center justify-center">
          <i class="fa-solid fa-layer-group"></i>
        </span>
        Nhóm của bạn
      </h2>
      <div class="space-y-2">
        ${myGroups.map((g) => {
          const isOwner = user && g.ownerUid === user.uid;
          return `
            <button data-switch-group="${g.id}" class="w-full flex items-center gap-3 p-3 rounded-2xl bg-slate-50 hover:bg-emerald-50 transition text-left">
              <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white shrink-0">
                <i class="fa-solid fa-house"></i>
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-semibold text-slate-800 truncate flex items-center gap-1.5">
                  ${escapeHtml(g.name || '—')}
                  ${isOwner ? '<span class="text-[10px] bg-amber-100 text-amber-700 font-bold px-1.5 rounded">👑 Chủ</span>' : ''}
                </p>
                <p class="text-[11px] text-slate-500 truncate">${g.bankName ? escapeHtml(g.bankName) : 'Chưa cấu hình ngân hàng'}</p>
              </div>
              <i class="fa-solid fa-chevron-right text-slate-400 text-xs"></i>
            </button>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function setFormBusy(btn, busy, html) {
  btn.disabled = busy;
  btn.innerHTML = busy ? `<i class="fa-solid fa-spinner fa-spin mr-1"></i> ${html}` : html;
  btn.style.opacity = busy ? '0.7' : '1';
}

function setBusy(btn, busy) {
  btn.style.opacity = busy ? '0.5' : '1';
  btn.style.pointerEvents = busy ? 'none' : '';
}
