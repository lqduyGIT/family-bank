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
// Returns an image URL from VietQR's hosted PNG service. Used as a fallback
// when the local QR renderer is unavailable (e.g. qrcode library not loaded).
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

// ---- Local VietQR EMV string builder ----
// Generates the EMV TLV string per NAPAS VietQR spec so we can render the
// QR locally (no dependency on img.vietqr.io). Includes CRC16-CCITT at the
// tail as required by the spec.
export function buildVietQrEmv({ bankBin, accountNumber, amount = 0, addInfo = '' } = {}) {
  if (!bankBin || !accountNumber) return '';

  const tlv = (id, val) => {
    const v = String(val);
    const len = String(v.length).padStart(2, '0');
    return id + len + v;
  };

  // Field 38 (Merchant Account Information) contains:
  //   00 10 A000000727         GUID for NAPAS VietQR
  //   01 <len>                 sub-template
  //     00 06 <bankBin>        beneficiary bank BIN
  //     01 <len> <account>     beneficiary account
  //   02 08 QRIBFTTA           service code (account transfer by account)
  const acctSub = tlv('00', String(bankBin)) + tlv('01', String(accountNumber));
  const merchantInfo =
    tlv('00', 'A000000727') +
    tlv('01', acctSub) +
    tlv('02', 'QRIBFTTA');

  let emv = '';
  emv += tlv('00', '01');                       // Payload format version
  emv += tlv('01', amount > 0 ? '12' : '11');   // 12 = dynamic (w/ amount), 11 = static
  emv += tlv('38', merchantInfo);
  emv += tlv('52', '0000');                     // MCC
  emv += tlv('53', '704');                      // Currency VND
  if (amount > 0) emv += tlv('54', String(amount));
  emv += tlv('58', 'VN');                       // Country
  if (addInfo) {
    // Field 62 → sub-field 08 (purpose/note)
    emv += tlv('62', tlv('08', addInfo));
  }

  // Append CRC16 per NAPAS spec (polynomial 0x1021, seed 0xFFFF, no xorout)
  emv += '6304';
  const crc = crc16ccitt(emv).toString(16).toUpperCase().padStart(4, '0');
  return emv + crc;
}

function crc16ccitt(str) {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
    }
  }
  return crc;
}

// Render an EMV QR string to a data: URL using the bundled qrcode library.
// Falls back to throwing if the library didn't load (caller can use the
// img.vietqr.io URL as backup).
export async function renderQrDataUrl(emv, { width = 400, margin = 1 } = {}) {
  if (!window.QRCode || typeof window.QRCode.toDataURL !== 'function') {
    throw new Error('QRCode library not available');
  }
  return window.QRCode.toDataURL(emv, {
    errorCorrectionLevel: 'M',
    width, margin,
    color: { dark: '#0f172a', light: '#ffffff' },
  });
}

// VN bank apps — direct URL schemes that jump straight into the app when
// tapped (no intermediate web redirect page). On iOS the bank app opens
// immediately if installed; if not, the browser shows its native "Cannot
// open URL" dialog (accepted tradeoff — no more VietQR landing page).
//
// `appCode` is kept as a fallback route via VietQR's dl.vietqr.io redirector
// for banks whose direct scheme we don't have confirmed.
export const BANK_APPS = [
  { code: 'MB',   scheme: 'mbbank://',      appCode: 'mb',   name: 'MB Bank',       color: 'bg-red-600'    },
  { code: 'VCB',  scheme: 'vietcombank://', appCode: 'vcb',  name: 'Vietcombank',   color: 'bg-green-700'  },
  { code: 'TCB',  scheme: 'tcb://',         appCode: 'tcb',  name: 'Techcombank',   color: 'bg-red-500'    },
  { code: 'TPB',  scheme: 'tpb://',         appCode: 'tpb',  name: 'TPBank',        color: 'bg-purple-600' },
  { code: 'BIDV', scheme: 'bidv://',        appCode: 'bidv', name: 'BIDV',          color: 'bg-teal-600'   },
  { code: 'ACB',  scheme: 'acb://',         appCode: 'acb',  name: 'ACB',           color: 'bg-blue-600'   },
  { code: 'VPB',  scheme: 'vpbank://',      appCode: 'vpb',  name: 'VPBank',        color: 'bg-emerald-600'},
  { code: 'VTB',  scheme: 'vietinbank://',  appCode: 'icb',  name: 'VietinBank',    color: 'bg-blue-800'   },
  { code: 'AGR',  scheme: 'agribank://',    appCode: 'vba',  name: 'Agribank',      color: 'bg-red-700'    },
  { code: 'SHB',  scheme: 'shb://',         appCode: 'shb',  name: 'SHB',           color: 'bg-blue-700'   },
  { code: 'HDB',  scheme: 'hdbank://',      appCode: 'hdb',  name: 'HDBank',        color: 'bg-yellow-600' },
  { code: 'OCB',  scheme: 'ocb://',         appCode: 'ocb',  name: 'OCB',           color: 'bg-green-600'  },
  { code: 'VIB',  scheme: 'vib://',         appCode: 'vib',  name: 'VIB',           color: 'bg-sky-600'    },
  { code: 'EIB',  scheme: 'eximbank://',    appCode: 'eib',  name: 'Eximbank',      color: 'bg-blue-900'   },
  { code: 'SEAB', scheme: 'seabank://',     appCode: 'seab', name: 'SeABank',       color: 'bg-orange-600' },
  { code: 'TIMO', scheme: 'timo://',        appCode: 'timo', name: 'Timo',          color: 'bg-pink-500'   },
  { code: 'CAKE', scheme: 'cake://',        appCode: 'cake', name: 'Cake (VPBank)', color: 'bg-pink-600'   },
];

// Launch a bank app using its direct URL scheme. No redirect page, no
// landing — on iOS/Android this triggers the app if installed or shows
// the native "Cannot open" dialog otherwise.
export function openBankApp({ scheme, appCode }) {
  if (scheme) {
    window.location.href = scheme;
    return;
  }
  // Fallback to VietQR's redirector only if we don't know the direct scheme.
  if (appCode) {
    window.location.href = `https://dl.vietqr.io/pay?app=${encodeURIComponent(appCode)}`;
  }
}

// Fetch an image URL into a local Blob. Tries HTTPS fetch first; if CORS
// blocks, falls back to loading the image into a canvas (which still works
// when the server sends Access-Control-Allow-Origin: * for the image bytes).
async function urlToImageBlob(url) {
  // data: URLs (from local QR renderer) can be decoded directly — no fetch
  // needed and no CORS concerns.
  if (url.startsWith('data:')) {
    const comma = url.indexOf(',');
    const meta = url.slice(5, comma);              // e.g. "image/png;base64"
    const body = url.slice(comma + 1);
    const mime = meta.split(';')[0] || 'image/png';
    if (meta.includes('base64')) {
      const bin = atob(body);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      return new Blob([arr], { type: mime });
    }
    return new Blob([decodeURIComponent(body)], { type: mime });
  }

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
