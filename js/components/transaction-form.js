// ============================================================
// transaction-form.js — form for Đóng Quỹ / Chi Tiêu (group-based)
// Uses member.uid (Firebase auth uid).
// ============================================================

import { openModal, closeModal } from './modal.js';
import { toast } from './toast.js';
import { store } from '../store.js';
import { CATEGORIES, getCategory, parseAmountInput, formatVND, escapeHtml } from '../utils.js';

export function openTransactionForm({ type = 'expense' } = {}) {
  const isIncome = type === 'income';
  const user = store.getUser();
  const members = store.getMembers();
  if (members.length === 0) return toast('Nhóm chưa có thành viên', 'error');

  const categoryKeys = Object.entries(CATEGORIES)
    .filter(([, c]) => c.type === type)
    .map(([k]) => k);
  const defaultCategory = isIncome ? 'contribution' : 'grocery';

  const memberOptions = members
    .map((m) => `<option value="${m.uid}" ${m.uid === user?.uid ? 'selected' : ''}>${escapeHtml(m.displayName || 'Ẩn danh')}${m.uid === user?.uid ? ' (bạn)' : ''}</option>`)
    .join('');

  const chipHtml = categoryKeys
    .map((key) => {
      const c = CATEGORIES[key];
      return `<button type="button" class="category-chip ${key === defaultCategory ? 'active' : ''}" data-cat="${key}">
        <i class="fa-solid ${c.icon}"></i>${c.label}
      </button>`;
    })
    .join('');

  openModal({
    title: isIncome ? '💰 Đóng Quỹ' : '🛒 Ghi Chi Tiêu',
    bodyHtml: `
      <form id="tx-form" class="space-y-4">
        <div>
          <label class="fb-label">Số tiền (VND)</label>
          <input type="text" name="amount" inputmode="numeric" autocomplete="off" placeholder="0" class="fb-input text-lg font-semibold" required />
          <p class="text-[11px] text-slate-400 mt-1" data-preview></p>
        </div>
        <div>
          <label class="fb-label">${isIncome ? 'Người đóng quỹ' : 'Người chi'}</label>
          <select name="memberUid" class="fb-input" required>${memberOptions}</select>
        </div>
        <div>
          <label class="fb-label">Danh mục</label>
          <div class="flex flex-wrap gap-2" data-chips>${chipHtml}</div>
          <input type="hidden" name="category" value="${defaultCategory}" />
        </div>
        <div>
          <label class="fb-label">Ghi chú</label>
          <input type="text" name="note" placeholder="VD: ${isIncome ? 'Đóng quỹ tháng 4' : 'Đi siêu thị Coopmart'}" class="fb-input" maxlength="120" />
        </div>
      </form>
    `,
    footerHtml: `
      <div class="flex gap-2">
        <button class="fb-btn fb-btn-ghost flex-1" data-act="cancel">Huỷ</button>
        <button class="fb-btn ${isIncome ? 'fb-btn-primary' : 'fb-btn-danger'} flex-1" data-act="submit">
          ${isIncome ? 'Đóng quỹ' : 'Ghi chi tiêu'}
        </button>
      </div>
    `,
    onMount: (sheet) => {
      const form = sheet.querySelector('#tx-form');
      const amountInput = form.querySelector('[name="amount"]');
      const preview = form.querySelector('[data-preview]');

      amountInput.addEventListener('input', () => {
        const val = parseAmountInput(amountInput.value);
        amountInput.value = val === 0 ? '' : new Intl.NumberFormat('vi-VN').format(val);
        preview.textContent = val > 0 ? `= ${formatVND(val)}` : '';
      });

      const chips = form.querySelectorAll('.category-chip');
      const categoryInput = form.querySelector('[name="category"]');
      chips.forEach((chip) => {
        chip.addEventListener('click', () => {
          chips.forEach((c) => c.classList.remove('active'));
          chip.classList.add('active');
          categoryInput.value = chip.dataset.cat;
        });
      });

      sheet.querySelector('[data-act="cancel"]').addEventListener('click', closeModal);

      const submitBtn = sheet.querySelector('[data-act="submit"]');
      submitBtn.addEventListener('click', async () => {
        const amount = parseAmountInput(amountInput.value);
        const memberUid = form.memberUid.value;
        const category = form.category.value;
        const note = form.note.value.trim();

        if (amount <= 0)   return toast('Số tiền phải lớn hơn 0', 'error');
        if (!memberUid)    return toast('Chọn thành viên', 'error');

        const member = store.getMemberByUid(memberUid);
        const autoNote = note || `${member?.displayName ?? 'Ẩn danh'} ${isIncome ? 'đóng quỹ' : getCategory(category).label.toLowerCase()}`;

        submitBtn.disabled = true;
        submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-1"></i> Đang lưu...`;

        try {
          await store.addTransaction({ type, amount, memberUid, category, note: autoNote });
          closeModal();
          toast(isIncome ? `Đã cộng ${formatVND(amount)} vào quỹ` : `Đã ghi chi ${formatVND(amount)}`, isIncome ? 'success' : 'info');
        } catch (err) {
          console.error(err);
          toast(err.message || 'Không lưu được giao dịch', 'error');
          submitBtn.disabled = false;
          submitBtn.innerHTML = isIncome ? 'Đóng quỹ' : 'Ghi chi tiêu';
        }
      });

      amountInput.focus();
    },
  });
}
