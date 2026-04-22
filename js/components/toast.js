// ============================================================
// toast.js — tiny top-of-screen notifications
// toast('Đã lưu', 'success')
// ============================================================

import { $, escapeHtml } from '../utils.js';

const ICON = {
  success: 'fa-circle-check',
  error:   'fa-circle-exclamation',
  info:    'fa-circle-info',
};

export function toast(message, kind = 'success') {
  const root = $('#toast-root');
  const node = document.createElement('div');
  node.className = `toast ${kind}`;
  node.innerHTML = `<i class="fa-solid ${ICON[kind] || ICON.info}"></i>${escapeHtml(message)}`;
  root.appendChild(node);
  // auto remove after animation ends (~2.7s)
  setTimeout(() => node.remove(), 2800);
}
