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

// Quick-launch map for VN bank apps. Uses VietQR's official deeplink router
// (https://dl.vietqr.io/pay?app=<appCode>) — a single HTTPS URL that works
// on both iOS (Universal Link) and Android (App Link), maintained by VietQR
// as bank schemes change.
//
// Docs: https://vietqr.io/danh-sach-api/deeplink-app-ngan-hang/
// Source: https://api.vietqr.io/v2/ios-app-deeplinks (same URL for Android)
//
// Note: VietQR confirms these deeplinks CANNOT auto-fill recipient/amount
// today — they only launch the bank app. User still needs to "Scan QR from
// gallery" inside the bank app after the QR image is saved to Photos.
export const BANK_APPS = [
  { code: 'MB',   appCode: 'mb',       name: 'MB Bank',       color: 'bg-red-600'    },
  { code: 'VCB',  appCode: 'vcb',      name: 'Vietcombank',   color: 'bg-green-700'  },
  { code: 'TCB',  appCode: 'tcb',      name: 'Techcombank',   color: 'bg-red-500'    },
  { code: 'TPB',  appCode: 'tpb',      name: 'TPBank',        color: 'bg-purple-600' },
  { code: 'BIDV', appCode: 'bidv',     name: 'BIDV',          color: 'bg-teal-600'   },
  { code: 'ACB',  appCode: 'acb',      name: 'ACB',           color: 'bg-blue-600'   },
  { code: 'VPB',  appCode: 'vpb',      name: 'VPBank',        color: 'bg-emerald-600'},
  { code: 'VTB',  appCode: 'icb',      name: 'VietinBank',    color: 'bg-blue-800'   },
  { code: 'AGR',  appCode: 'vba',      name: 'Agribank',      color: 'bg-red-700'    },
  { code: 'SHB',  appCode: 'shb',      name: 'SHB',           color: 'bg-blue-700'   },
  { code: 'HDB',  appCode: 'hdb',      name: 'HDBank',        color: 'bg-yellow-600' },
  { code: 'OCB',  appCode: 'ocb',      name: 'OCB',           color: 'bg-green-600'  },
  { code: 'VIB',  appCode: 'vib',      name: 'VIB',           color: 'bg-sky-600'    },
  { code: 'EIB',  appCode: 'eib',      name: 'Eximbank',      color: 'bg-blue-900'   },
  { code: 'SEAB', appCode: 'seab',     name: 'SeABank',       color: 'bg-orange-600' },
  { code: 'TIMO', appCode: 'timo',     name: 'Timo',          color: 'bg-pink-500'   },
  { code: 'CAKE', appCode: 'cake',     name: 'Cake (VPBank)', color: 'bg-pink-600'   },
];

export function getBankDeepLink({ appCode }) {
  return `https://dl.vietqr.io/pay?app=${encodeURIComponent(appCode)}`;
}

// Cross-platform bank-app launcher. The URL is a VietQR-maintained Universal
// Link (iOS) / App Link (Android) — no custom scheme or App Store fallback
// needed; VietQR handles install detection + install-prompt themselves.
export function openBankApp({ appCode }) {
  if (!appCode) return;
  window.location.href = getBankDeepLink({ appCode });
}

// Fetch an image URL into a local Blob. Tries HTTPS fetch first; if CORS
// blocks, falls back to loading the image into a canvas (which still works
// when the server sends Access-Control-Allow-Origin: * for the image bytes).
async function urlToImageBlob(url) {
  try {
    const res = await fetch(url, { mode: 'cors', cache: 'no-cache' });
    if (res.ok) return await res.blob();
  } catch {/* try canvas next */}

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timeout = setTimeout(() => reject(new Error('timeout')), 8000);
    img.onload = () => {
      clearTimeout(timeout);
      try {
        const canvas = document.createElement('canvas');
        canvas.width  = img.naturalWidth  || 400;
        canvas.height = img.naturalHeight || 400;
        canvas.getContext('2d').drawImage(img, 0, 0);
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error('canvas-tainted'));
        }, 'image/png', 0.95);
      } catch (e) { reject(e); }
    };
    img.onerror = () => { clearTimeout(timeout); reject(new Error('image-load-failed')); };
    img.src = url;
  });
}

// Save an image URL to the user's photo library / gallery. Uses the Web
// Share API (navigator.share) with a File, which on iOS/Android surfaces
// the native share sheet with "Save to Photos" / "Save to Gallery" — files
// land directly in the user's photo library, NOT Downloads.
//
// Returns:
//   'shared'    — share sheet opened (user may have tapped Save or anything)
//   'cancelled' — user dismissed share sheet
//   'opened'    — CORS blocked bytes; opened in new tab so user can long-press
//   'downloaded'— very old browser without share-files; fell back to download
export async function saveImageAs(url, filename = 'qr.png') {
  let blob;
  try {
    blob = await urlToImageBlob(url);
  } catch {
    // Bytes unreachable (CORS or network) — open in a new tab so the user
    // can long-press the image and pick "Save Image" natively.
    window.open(url, '_blank', 'noopener');
    return 'opened';
  }

  const file = new File([blob], filename, { type: blob.type || 'image/png' });

  // Preferred path on iOS 15+ and Android Chrome: native share sheet shows
  // "Save Image" (iOS) / "Save to gallery" (Android) — goes straight to
  // the photo library.
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return 'shared';
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled';
      // fall through to download
    }
  }

  // Last resort for browsers without Web Share files support — this lands
  // in the Downloads folder (not the gallery), so only used when truly
  // nothing else works.
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  return 'downloaded';
}

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
