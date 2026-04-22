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
      currentTab = 'home';
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
      currentTab = tab;
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
function renderSetupRequired() {
  const mount = $('#view');
  mount.innerHTML = `
    <section class="px-6 pt-8 pb-10">
      <div class="w-20 h-20 mx-auto rounded-3xl bg-amber-100 flex items-center justify-center mb-4">
        <i class="fa-solid fa-screwdriver-wrench text-amber-600 text-3xl"></i>
      </div>
      <h1 class="text-xl font-bold text-center text-slate-800 mb-2">Cần cấu hình Firebase</h1>
      <p class="text-sm text-slate-500 text-center mb-6">
        App chưa có thông tin Firebase. Mở file <code class="bg-slate-100 px-1.5 py-0.5 rounded text-[12px]">js/config.js</code> và điền theo hướng dẫn trong README.
      </p>
      <div class="bg-slate-900 text-slate-100 rounded-2xl p-4 font-mono text-[11px] overflow-x-auto mb-4">
<pre>// js/config.js
export const config = {
  firebase: {
    apiKey: '...',
    authDomain: '...firebaseapp.com',
    projectId: '...',
    storageBucket: '...',
    messagingSenderId: '...',
    appId: '...',
  },
};</pre>
      </div>
      <a href="https://console.firebase.google.com" target="_blank" rel="noopener" class="fb-btn fb-btn-primary inline-flex items-center justify-center">
        <i class="fa-solid fa-up-right-from-square mr-2"></i> Mở Firebase Console
      </a>
    </section>
  `;
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
