// ============================================================
// add-group-form.js — modal with Create + Join tabs for adding
// another group while user is already in one.
// ============================================================

import { openModal, closeModal } from './modal.js';
import { toast } from './toast.js';
import { store } from '../store.js';

export function openAddGroupForm() {
  openModal({
    title: 'Thêm nhóm mới',
    bodyHtml: `
      <div class="flex gap-1 bg-slate-100 rounded-xl p-1 mb-5">
        <button data-tab="create" class="tab-btn flex-1 py-2 rounded-lg text-sm font-semibold bg-white shadow text-emerald-700">Tạo nhóm</button>
        <button data-tab="join" class="tab-btn flex-1 py-2 rounded-lg text-sm font-semibold text-slate-500">Tham gia</button>
      </div>

      <div data-panel="create">
        <label class="fb-label">Tên nhóm</label>
        <input id="add-group-name" class="fb-input mb-1" placeholder="VD: Quỹ nhà ngoại" maxlength="40" autofocus />
        <p class="text-[11px] text-slate-400 mb-4">Bạn sẽ là chủ của nhóm mới.</p>
      </div>

      <div data-panel="join" class="hidden">
        <label class="fb-label">Mã mời (6 ký tự)</label>
        <input id="add-invite-code" class="fb-input text-center text-lg font-mono tracking-[0.3em] uppercase mb-1" placeholder="ABCD23" maxlength="6" autocomplete="off" />
        <p class="text-[11px] text-slate-400 mb-4">Nhập mã do chủ nhóm chia sẻ.</p>
      </div>
    `,
    footerHtml: `
      <div class="flex gap-2">
        <button class="fb-btn fb-btn-ghost flex-1" data-act="cancel">Huỷ</button>
        <button class="fb-btn fb-btn-primary flex-1" data-act="submit">Xác nhận</button>
      </div>
    `,
    onMount: (sheet) => {
      const tabs = sheet.querySelectorAll('.tab-btn');
      const panelCreate = sheet.querySelector('[data-panel="create"]');
      const panelJoin = sheet.querySelector('[data-panel="join"]');
      const codeInput = sheet.querySelector('#add-invite-code');

      let mode = 'create';

      tabs.forEach((tab) => {
        tab.addEventListener('click', () => {
          mode = tab.dataset.tab;
          tabs.forEach((t) => {
            t.classList.remove('bg-white', 'shadow', 'text-emerald-700');
            t.classList.add('text-slate-500');
          });
          tab.classList.add('bg-white', 'shadow', 'text-emerald-700');
          tab.classList.remove('text-slate-500');
          panelCreate.classList.toggle('hidden', mode !== 'create');
          panelJoin.classList.toggle('hidden', mode !== 'join');
          if (mode === 'create') sheet.querySelector('#add-group-name').focus();
          else codeInput.focus();
        });
      });

      codeInput.addEventListener('input', () => {
        codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
      });

      sheet.querySelector('[data-act="cancel"]').addEventListener('click', closeModal);

      const submitBtn = sheet.querySelector('[data-act="submit"]');
      submitBtn.addEventListener('click', async () => {
        submitBtn.disabled = true;
        const oldHtml = submitBtn.innerHTML;
        submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i>`;

        try {
          if (mode === 'create') {
            const name = sheet.querySelector('#add-group-name').value.trim();
            if (!name) throw new Error('Nhập tên nhóm');
            await store.createGroup({ name });
            toast(`Đã tạo nhóm "${name}"`, 'success');
          } else {
            const code = codeInput.value.trim();
            if (code.length !== 6) throw new Error('Mã mời gồm 6 ký tự');
            await store.joinGroup(code);
            toast('Đã tham gia nhóm', 'success');
          }
          closeModal();
        } catch (err) {
          console.error(err);
          toast(err.message || 'Có lỗi xảy ra', 'error');
          submitBtn.disabled = false;
          submitBtn.innerHTML = oldHtml;
        }
      });
    },
  });
}
