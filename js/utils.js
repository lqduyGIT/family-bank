// ============================================================
// utils.js — formatters, date helpers, VietQR builder
// ============================================================

export const uid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2, 11));

export const formatVND = (amount, { showSymbol = true, signed = false } = {}) => {
  const sign = signed && amount > 0 ? '+' : '';
  const formatted = new Intl.NumberFormat('vi-VN').format(Math.abs(amount));
  const symbol = showSymbol ? ' VND' : '';
  return `${sign}${amount < 0 ? '-' : ''}${formatted}${symbol}`;
};

export const formatCompactVND = (amount) => {
  const abs = Math.abs(amount);
  if (abs >= 1_000_000_000) return (amount / 1_000_000_000).toFixed(1).replace(/\.0$/, '') + ' tỷ';
  if (abs >= 1_000_000)     return (amount / 1_000_000).toFixed(1).replace(/\.0$/, '') + ' tr';
  if (abs >= 1_000)         return (amount / 1_000).toFixed(0) + 'k';
  return String(amount);
};

export const parseAmountInput = (str) => {
  const cleaned = String(str).replace(/[^\d]/g, '');
  return cleaned === '' ? 0 : parseInt(cleaned, 10);
};

export const greeting = (d = new Date()) => {
  const h = d.getHours();
  if (h < 11) return 'Chào buổi sáng';
  if (h < 13) return 'Chào buổi trưa';
  if (h < 18) return 'Chào buổi chiều';
  return 'Chào buổi tối';
};

// ---- Date helpers ----
export const relativeDate = (iso) => {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now - d;
  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffHours < 1) {
    const mins = Math.max(1, Math.floor(diffMs / 60000));
    return `${mins} phút trước`;
  }
  if (diffHours < 24 && d.getDate() === now.getDate()) {
    return `Hôm nay, ${d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`;
  }
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (d.getDate() === yesterday.getDate() && d.getMonth() === yesterday.getMonth() && d.getFullYear() === yesterday.getFullYear()) {
    return `Hôm qua, ${d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`;
  }
  return d.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export const monthKey = (iso) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export const monthLabel = (key) => {
  const [y, m] = key.split('-');
  return `T${parseInt(m, 10)}/${y.slice(-2)}`;
};

// ---- Categories ----
export const CATEGORIES = {
  contribution: { label: 'Đóng quỹ', icon: 'fa-hand-holding-dollar', color: 'emerald', type: 'income' },
  gift:         { label: 'Quà tặng',   icon: 'fa-gift',               color: 'pink',    type: 'expense' },
  grocery:      { label: 'Siêu thị',   icon: 'fa-cart-shopping',      color: 'blue',    type: 'expense' },
  dining:       { label: 'Ăn uống',    icon: 'fa-utensils',           color: 'orange',  type: 'expense' },
  utility:      { label: 'Hoá đơn',    icon: 'fa-bolt',               color: 'yellow',  type: 'expense' },
  education:    { label: 'Giáo dục',   icon: 'fa-graduation-cap',     color: 'violet',  type: 'expense' },
  healthcare:   { label: 'Y tế',       icon: 'fa-kit-medical',        color: 'red',     type: 'expense' },
  transport:    { label: 'Di chuyển',  icon: 'fa-taxi',               color: 'cyan',    type: 'expense' },
  other:        { label: 'Khác',       icon: 'fa-circle-dot',         color: 'slate',   type: 'expense' },
};

export const getCategory = (key) => CATEGORIES[key] || CATEGORIES.other;

// Tailwind safelist helpers — pre-compose class strings so JIT keeps them
export const bgSoft = (color) => {
  const map = {
    emerald: 'bg-emerald-50', pink: 'bg-pink-50', blue: 'bg-blue-50', orange: 'bg-orange-50',
    yellow: 'bg-yellow-50', violet: 'bg-violet-50', red: 'bg-red-50', cyan: 'bg-cyan-50',
    slate: 'bg-slate-100', amber: 'bg-amber-50',
  };
  return map[color] || map.slate;
};
export const textStrong = (color) => {
  const map = {
    emerald: 'text-emerald-600', pink: 'text-pink-500', blue: 'text-blue-500', orange: 'text-orange-500',
    yellow: 'text-yellow-500', violet: 'text-violet-500', red: 'text-red-500', cyan: 'text-cyan-600',
    slate: 'text-slate-500', amber: 'text-amber-500',
  };
  return map[color] || map.slate;
};

// ---- VietQR URL builder ----
// Docs: https://www.vietqr.io/danh-sach-api/link-tao-ma-nhanh
// Returns an image URL that renders a scannable VietQR for the given bank account.
export const buildVietQRUrl = ({ bankCode, accountNumber, accountHolder, amount, note } = {}) => {
  if (!bankCode || !accountNumber) return '';
  const base = `https://img.vietqr.io/image/${encodeURIComponent(bankCode)}-${encodeURIComponent(accountNumber)}-compact2.png`;
  const params = new URLSearchParams();
  if (accountHolder) params.set('accountName', accountHolder);
  if (amount && amount > 0) params.set('amount', String(amount));
  if (note) params.set('addInfo', note);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
};

// Common Vietnamese bank codes (subset) — used for <select> in settings
export const BANKS = [
  { code: 'VCB',          name: 'Vietcombank' },
  { code: 'TCB',          name: 'Techcombank' },
  { code: 'MB',           name: 'MB Bank' },
  { code: 'BIDV',         name: 'BIDV' },
  { code: 'ACB',          name: 'ACB' },
  { code: 'VPB',          name: 'VPBank' },
  { code: 'TPB',          name: 'TPBank' },
  { code: 'STB',          name: 'Sacombank' },
  { code: 'VIB',          name: 'VIB' },
  { code: 'VietinBank',   name: 'VietinBank' },
  { code: 'AGRIBANK',     name: 'Agribank' },
  { code: 'SHB',          name: 'SHB' },
  { code: 'HDBANK',       name: 'HDBank' },
  { code: 'OCB',          name: 'OCB' },
  { code: 'MSB',          name: 'MSB' },
];

// ---- DOM helpers ----
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export const escapeHtml = (str) =>
  String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const debounce = (fn, ms = 300) => {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
};
