// ============================================================
// views/group-gate.js — create or join a family group
// ============================================================

import { store } from '../store.js';
import { toast } from '../components/toast.js';
import { escapeHtml } from '../utils.js';

export function render(mount) {
  const user = store.getUser();
  mount.innerHTML = `
    <section class="px-6 pt-4 pb-10">
      <div class="flex items-center justify-between mb-6">
        <div class="flex items-center gap-3">
          ${user.photoURL ? `<img src="${user.photoURL}" class="w-10 h-10 rounded-full" referrerpolicy="no-referrer" />` : ''}
          <div>
            <p class="text-[11px] text-slate-500">Đã đăng nhập</p>
            <p class="text-sm font-semibold text-slate-800">${escapeHtml(user.displayName || user.email)}</p>
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
        <h1 class="text-xl font-bold text-slate-800">Chọn nhóm gia đình</h1>
        <p class="text-sm text-slate-500 mt-1">Tạo nhóm mới hoặc tham gia nhóm có sẵn</p>
      </div>

      <!-- Create group -->
      <div class="bg-white rounded-3xl p-5 neu-soft mb-4">
        <h2 class="text-sm font-semibold text-slate-800 mb-1 flex items-center gap-2">
          <span class="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 text-xs font-bold flex items-center justify-center">1</span>
          Tạo nhóm mới
        </h2>
        <p class="text-xs text-slate-500 mb-4 ml-9">Bạn là người thủ quỹ / quản lý đầu tiên.</p>
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
          <span class="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">2</span>
          Tham gia nhóm có sẵn
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
    setBusy(createBtn, true, 'Đang tạo...');
    try {
      await store.createGroup({ name });
      toast('Đã tạo nhóm', 'success');
    } catch (err) {
      console.error(err);
      toast(err.message || 'Tạo nhóm thất bại', 'error');
    } finally {
      setBusy(createBtn, false, '<i class="fa-solid fa-plus mr-1"></i> Tạo nhóm');
    }
  });

  joinBtn.addEventListener('click', async () => {
    const code = codeInput.value.trim();
    if (code.length !== 6) return toast('Mã mời gồm 6 ký tự', 'error');
    setBusy(joinBtn, true, 'Đang tham gia...');
    try {
      await store.joinGroup(code);
      toast('Đã tham gia nhóm', 'success');
    } catch (err) {
      console.error(err);
      toast(err.message || 'Không tham gia được', 'error');
    } finally {
      setBusy(joinBtn, false, '<i class="fa-solid fa-right-to-bracket mr-1"></i> Tham gia');
    }
  });

  mount.querySelector('#sign-out').addEventListener('click', () => store.signOut());
}

function setBusy(btn, busy, html) {
  btn.disabled = busy;
  btn.innerHTML = busy ? `<i class="fa-solid fa-spinner fa-spin mr-1"></i> ${html}` : html;
  btn.style.opacity = busy ? '0.7' : '1';
}
