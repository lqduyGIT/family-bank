// ============================================================
// modal.js — single-instance bottom-sheet modal
// Usage:
//   openModal({ title, bodyHtml, onMount(root), footerHtml? })
//   closeModal()
// ============================================================

import { $ } from '../utils.js';

let currentOnClose = null;

export function openModal({ title = '', bodyHtml = '', footerHtml = '', onMount, onClose } = {}) {
  closeModal();
  currentOnClose = onClose || null;

  const root = $('#modal-root');
  root.innerHTML = `
    <div class="modal-backdrop" data-backdrop>
      <div class="modal-sheet" role="dialog" aria-modal="true">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-semibold text-slate-800">${title}</h3>
          <button data-close class="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500" aria-label="Đóng">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
        <div data-body>${bodyHtml}</div>
        ${footerHtml ? `<div class="mt-5" data-footer>${footerHtml}</div>` : ''}
      </div>
    </div>
  `;

  const backdrop = root.querySelector('[data-backdrop]');
  const closeBtn = root.querySelector('[data-close]');
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeModal(); });
  closeBtn.addEventListener('click', closeModal);

  document.addEventListener('keydown', escListener);

  if (typeof onMount === 'function') onMount(root.querySelector('.modal-sheet'));
}

export function closeModal() {
  const root = $('#modal-root');
  if (root && root.innerHTML) {
    root.innerHTML = '';
    document.removeEventListener('keydown', escListener);
    if (currentOnClose) { currentOnClose(); currentOnClose = null; }
  }
}

function escListener(e) {
  if (e.key === 'Escape') closeModal();
}

// Reusable confirm dialog
export function confirmDialog({ title = 'Xác nhận', message = '', confirmText = 'Đồng ý', cancelText = 'Huỷ', danger = false } = {}) {
  return new Promise((resolve) => {
    openModal({
      title,
      bodyHtml: `<p class="text-sm text-slate-600 leading-relaxed">${message}</p>`,
      footerHtml: `
        <div class="flex gap-2">
          <button class="fb-btn fb-btn-ghost flex-1" data-act="cancel">${cancelText}</button>
          <button class="fb-btn ${danger ? 'fb-btn-danger' : 'fb-btn-primary'} flex-1" data-act="confirm">${confirmText}</button>
        </div>
      `,
      onMount: (sheet) => {
        sheet.querySelector('[data-act="cancel"]').addEventListener('click', () => { closeModal(); resolve(false); });
        sheet.querySelector('[data-act="confirm"]').addEventListener('click', () => { closeModal(); resolve(true); });
      },
      onClose: () => resolve(false),
    });
  });
}
