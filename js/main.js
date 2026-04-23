// ============================================================
// main.js — bootstrap + status-based routing
// ============================================================

import { store } from './store.js';
import { isConfigured } from './config.js';
import { $, $$, greeting, escapeHtml, relativeDate } from './utils.js';
import { openTransactionForm } from './components/transaction-form.js';
import { openModal, closeModal } from './components/modal.js';

const tabViews = {
  home:     () => import('./views/home.js'),
  stats:    () => import('./views/stats.js'),
  family:   () => import('./views/family.js'),
  settings: () => import('./views/settings.js'),
};

let currentDispose = null;
let lastStatus = null;

// ============ Bootstrap ============
async function bootstrap() {
  if (!(await isConfigured())) {
    renderSetupRequired();
    return;
  }

  bindTabs();
  bindHeader();

  store.subscribe(onStateChange);

  try {
    await store.init();
  } catch (err) {
    console.error('[main] init failed:', err);
    renderFatal(err);
  }
}

// ============ Routing ============
async function onStateChange(state) {
  syncHeader(state);

  const root = $('#app-root');
  root.dataset.status = state.status;

  // Only re-render when status changes, or when entering ready state render home view first time
  if (state.status === lastStatus && state.status !== 'ready') return;

  if (state.status !== 'ready' && currentDispose) {
    currentDispose(); currentDispose = null;
  }

  if (state.status === 'anonymous') {
    const mod = await import('./views/login.js');
    mod.render($('#view'));
  } else if (state.status === 'no-group') {
    const mod = await import('./views/group-gate.js');
    mod.render($('#view'));
  } else if (state.status === 'ready') {
    // Only re-render tab when first entering ready
    if (lastStatus !== 'ready') {
      setActiveTabButton('home');
      await renderTab('home');
    }
  } else if (state.status === 'loading') {
    $('#view').innerHTML = spinnerHtml();
  }

  lastStatus = state.status;
}

async function renderTab(tab) {
  if (!tabViews[tab]) return;
  if (currentDispose) { currentDispose(); currentDispose = null; }

  const mount = $('#view');
  mount.innerHTML = spinnerHtml();

  try {
    const mod = await tabViews[tab]();
    const dispose = mod.render(mount, store);
    currentDispose = typeof dispose === 'function' ? dispose : null;
  } catch (err) {
    console.error(`[main] render "${tab}" failed:`, err);
    mount.innerHTML = `<div class="px-5 py-10 text-center text-red-500">
      <i class="fa-solid fa-triangle-exclamation text-xl mb-2"></i>
      <p class="text-sm">Không tải được màn hình.</p>
    </div>`;
  }
}

function spinnerHtml() {
  return `<div class="px-5 py-20 text-center text-slate-400"><i class="fa-solid fa-spinner fa-spin text-2xl"></i></div>`;
}

// ============ Tabs & header ============
function bindTabs() {
  $$('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const tab = btn.dataset.tab;
      if (tab === 'scan') return handleFastActions();
      setActiveTabButton(tab);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      await renderTab(tab);
    });
  });
}

function setActiveTabButton(tab) {
  $$('.nav-btn').forEach((b) => {
    b.classList.remove('nav-active');
    b.classList.add('text-slate-400');
  });
  const active = $(`.nav-btn[data-tab="${tab}"]`);
  if (active) {
    active.classList.add('nav-active');
    active.classList.remove('text-slate-400');
  }
}

function handleFastActions() {
  if (store.getState().status !== 'ready') return;

  openModal({
    title: 'Thao tác nhanh',
    bodyHtml: `
      <div class="grid grid-cols-3 gap-3">
        <button data-act="income" class="flex flex-col items-center gap-2 p-4 rounded-2xl bg-emerald-50 hover:bg-emerald-100 transition">
          <div class="w-12 h-12 rounded-full bg-emerald-600 text-white flex items-center justify-center">
            <i class="fa-solid fa-plus text-lg"></i>
          </div>
          <span class="text-xs font-semibold text-emerald-700">Đóng Quỹ</span>
        </button>
        <button data-act="expense" class="flex flex-col items-center gap-2 p-4 rounded-2xl bg-red-50 hover:bg-red-100 transition">
          <div class="w-12 h-12 rounded-full bg-red-500 text-white flex items-center justify-center">
            <i class="fa-solid fa-minus text-lg"></i>
          </div>
          <span class="text-xs font-semibold text-red-600">Chi Tiêu</span>
        </button>
        <button data-act="showqr" class="flex flex-col items-center gap-2 p-4 rounded-2xl bg-indigo-50 hover:bg-indigo-100 transition">
          <div class="w-12 h-12 rounded-full bg-indigo-600 text-white flex items-center justify-center">
            <i class="fa-solid fa-qrcode text-lg"></i>
          </div>
          <span class="text-xs font-semibold text-indigo-700">Xem QR</span>
        </button>
      </div>
    `,
    onMount: (sheet) => {
      sheet.querySelector('[data-act="income"]').addEventListener('click',  () => { closeModal(); openTransactionForm({ type: 'income' }); });
      sheet.querySelector('[data-act="expense"]').addEventListener('click', () => { closeModal(); openTransactionForm({ type: 'expense' }); });
      sheet.querySelector('[data-act="showqr"]').addEventListener('click', async () => {
        closeModal();
        const mod = await import('./views/home.js');
        if (mod.openQRDetail) mod.openQRDetail();
      });
    },
  });
}

function bindHeader() {
  $('#notification-btn').addEventListener('click', () => {
    const state = store.getState();
    const unread = state.transactions.slice(0, 8);
    const body = unread.length === 0
      ? `<div class="empty-state"><i class="fa-regular fa-bell-slash"></i><p>Chưa có hoạt động nào</p></div>`
      : `<ul class="space-y-2 max-h-[60vh] overflow-y-auto smooth-scroll">${unread.map((tx) => `
          <li class="p-3 rounded-2xl bg-slate-50">
            <div class="flex items-start gap-2">
              <i class="fa-solid fa-${tx.type === 'income' ? 'arrow-down-to-line text-emerald-600' : 'arrow-up-from-bracket text-red-500'} mt-1"></i>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-semibold text-slate-800">${escapeHtml(tx.memberName || '—')}</p>
                <p class="text-xs text-slate-600 mt-0.5">${escapeHtml(tx.note || '')}</p>
                <p class="text-[10px] text-slate-400 mt-1">${relativeDate(tx.date)}</p>
              </div>
              <p class="text-sm font-bold ${tx.type === 'income' ? 'text-emerald-600' : 'text-red-500'} shrink-0">
                ${tx.type === 'income' ? '+' : '-'}${new Intl.NumberFormat('vi-VN').format(tx.amount)}
              </p>
            </div>
          </li>`).join('')}</ul>`;

    openModal({ title: 'Hoạt động gần đây', bodyHtml: body });
  });
}

function syncHeader(state) {
  if (state.status !== 'ready' || !state.user) return;

  $('#greeting-text').textContent = `${greeting()},`;
  $('#user-name').textContent = state.user.displayName || state.user.email;

  const avatarEl = $('#user-avatar');
  if (state.user.photoURL) {
    avatarEl.src = state.user.photoURL;
  } else {
    const seed = state.user.displayName || state.user.email || 'user';
    avatarEl.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(seed)}&backgroundColor=b6e3f4`;
  }

  $('#notif-dot').classList.toggle('hidden', state.transactions.length === 0);
}

// ============ Fatal / setup screens ============
async function renderSetupRequired() {
  const mount = $('#view');
  const diag = await diagnoseEnv();

  mount.innerHTML = `
    <section class="px-6 pt-8 pb-10">
      <div class="w-20 h-20 mx-auto rounded-3xl bg-amber-100 flex items-center justify-center mb-4">
        <i class="fa-solid fa-screwdriver-wrench text-amber-600 text-3xl"></i>
      </div>
      <h1 class="text-xl font-bold text-center text-slate-800 mb-2">Cần cấu hình Firebase</h1>
      <p class="text-sm text-slate-500 text-center mb-5">
        App đọc cấu hình từ file <code class="bg-slate-100 px-1.5 py-0.5 rounded text-[12px]">.env</code> cùng thư mục <code class="bg-slate-100 px-1.5 py-0.5 rounded text-[12px]">index.html</code>.
      </p>

      <div class="bg-white border border-slate-200 rounded-2xl p-4 mb-4">
        <p class="text-[11px] text-slate-500 uppercase tracking-wider mb-2">Chẩn đoán hiện tại</p>
        <div class="text-[12px] space-y-1.5">
          <div class="flex items-start gap-2">
            <i class="fa-solid ${diag.protocol.ok ? 'fa-circle-check text-emerald-500' : 'fa-circle-xmark text-red-500'} mt-0.5"></i>
            <div>
              <p class="font-semibold text-slate-800">Protocol: <span class="font-mono">${escapeHtml(diag.protocol.value)}</span></p>
              ${!diag.protocol.ok ? `<p class="text-[11px] text-slate-500">Bạn đang mở bằng <code>file://</code>. Fetch bị trình duyệt chặn. Hãy chạy qua server (xem bên dưới).</p>` : ''}
            </div>
          </div>
          <div class="flex items-start gap-2">
            <i class="fa-solid ${diag.env.ok ? 'fa-circle-check text-emerald-500' : 'fa-circle-xmark text-red-500'} mt-0.5"></i>
            <div>
              <p class="font-semibold text-slate-800">Fetch <code>./.env</code>: ${escapeHtml(diag.env.value)}</p>
              ${diag.env.hint ? `<p class="text-[11px] text-slate-500">${escapeHtml(diag.env.hint)}</p>` : ''}
            </div>
          </div>
          <div class="flex items-start gap-2">
            <i class="fa-solid ${diag.keys.ok ? 'fa-circle-check text-emerald-500' : 'fa-circle-xmark text-red-500'} mt-0.5"></i>
            <div>
              <p class="font-semibold text-slate-800">Keys tìm thấy: ${diag.keys.found}/6</p>
              ${diag.keys.missing.length ? `<p class="text-[11px] text-slate-500">Thiếu: <code>${diag.keys.missing.join(', ')}</code></p>` : ''}
            </div>
          </div>
        </div>
      </div>

      <div class="bg-slate-900 text-slate-100 rounded-2xl p-4 font-mono text-[11px] overflow-x-auto mb-4">
<pre># .env  (cùng thư mục index.html)
FB_API_KEY=AIzaSy...
FB_AUTH_DOMAIN=your-project.firebaseapp.com
FB_PROJECT_ID=your-project-id
FB_STORAGE_BUCKET=your-project.appspot.com
FB_MESSAGING_SENDER_ID=1234567890
FB_APP_ID=1:1234567890:web:abcdef...</pre>
      </div>

      <div class="bg-amber-50 border border-amber-200 rounded-2xl p-3 text-[12px] text-amber-900 mb-4">
        <p class="font-semibold mb-1">Chạy local đúng cách:</p>
        <pre class="text-[11px] overflow-x-auto">npx serve .
# hoặc
python -m http.server 8080</pre>
        <p class="mt-1">Sau đó mở <code>http://localhost:...</code>, <strong>không</strong> mở bằng <code>file://</code>.</p>
      </div>

      <div class="flex gap-2">
        <button onclick="location.reload()" class="fb-btn fb-btn-ghost flex-1"><i class="fa-solid fa-rotate-right mr-1"></i> Reload</button>
        <a href="https://console.firebase.google.com" target="_blank" rel="noopener" class="fb-btn fb-btn-primary flex-1 inline-flex items-center justify-center">
          <i class="fa-solid fa-up-right-from-square mr-2"></i> Firebase Console
        </a>
      </div>
    </section>
  `;
}

async function diagnoseEnv() {
  const protocol = { value: location.protocol, ok: location.protocol !== 'file:' };

  const env = { ok: false, value: '', hint: '' };
  try {
    const res = await fetch('./.env', { cache: 'no-store' });
    env.value = `${res.status} ${res.statusText}`;
    if (res.ok) {
      const text = await res.text();
      if (text.trim().toLowerCase().startsWith('<!doctype')) {
        env.hint = 'Server trả về HTML thay vì file .env (có thể server chặn dotfile). Thử server khác như "npx serve .".';
      } else {
        env.ok = true;
      }
    } else if (res.status === 404) {
      env.hint = 'File .env không tồn tại ở đường dẫn. Tạo file .env cùng thư mục với index.html.';
    }
  } catch (e) {
    env.value = 'Network error';
    env.hint = protocol.ok
      ? 'Có thể file không tồn tại hoặc server đang offline.'
      : 'Đang dùng file:// — fetch bị chặn. Dùng static server (xem bên dưới).';
  }

  const { loadConfig } = await import('./config.js');
  const cfg = await loadConfig();
  const expected = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
  const missing = expected.filter((k) => !cfg.firebase[k]);
  const keys = { found: expected.length - missing.length, missing, ok: missing.length === 0 };

  return { protocol, env, keys };
}

function renderFatal(err) {
  $('#view').innerHTML = `
    <section class="px-6 pt-10 text-center">
      <i class="fa-solid fa-triangle-exclamation text-red-500 text-3xl mb-3"></i>
      <p class="text-sm text-slate-700 font-semibold">Không khởi tạo được Firebase</p>
      <p class="text-xs text-slate-500 mt-2">${escapeHtml(err.message || String(err))}</p>
    </section>
  `;
}

bootstrap();
