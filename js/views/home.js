// ============================================================
// views/home.js — dashboard (balance card, quick actions, QR, recent tx)
// ============================================================

import { store } from '../store.js';
import {
  formatVND, relativeDate, monthKey, getCategory,
  bgSoft, textStrong, escapeHtml, buildVietQRUrl,
  BANK_APPS, openBankApp, saveImageAs,
} from '../utils.js';
import { openTransactionForm } from '../components/transaction-form.js';
import { openModal, closeModal, confirmDialog } from '../components/modal.js';
import { toast } from '../components/toast.js';

export function render(mount, storeRef = store) {
  mount.innerHTML = shell();

  // Bind QA buttons once
  mount.querySelector('[data-qa="income"]').addEventListener('click', () => openTransactionForm({ type: 'income' }));
  mount.querySelector('[data-qa="expense"]').addEventListener('click', () => openTransactionForm({ type: 'expense' }));
  mount.querySelector('[data-qa="history"]').addEventListener('click', () => openHistory());
  mount.querySelector('[data-qa="qr"]').addEventListener('click', () => openQRDetail());
  mount.querySelector('[data-view-all]').addEventListener('click', () => openHistory());
  mount.querySelector('[data-share-qr]').addEventListener('click', () => openQRDetail());

  const unsub = storeRef.subscribe((state) => {
    if (state.status !== 'ready' || !state.group) return;

    const balance = state.transactions.reduce((s, t) => s + (t.type === 'income' ? t.amount : -t.amount), 0);
    mount.querySelector('[data-balance]').innerHTML =
      `${new Intl.NumberFormat('vi-VN').format(balance)} <span class="text-base font-medium text-emerald-100 align-top ml-1">VND</span>`;

    const trend = computeMonthTrend(state.transactions);
    mount.querySelector('[data-trend]').innerHTML = trend;

    mount.querySelector('[data-period]').textContent = `Kỳ: Tháng ${new Date().getMonth() + 1} / ${new Date().getFullYear()}`;
    mount.querySelector('[data-acct]').textContent = formatAccount(state.group.accountNumber);
    mount.querySelector('[data-group-name]').textContent = state.group.name || '—';

    mount.querySelector('[data-qr-bank]').textContent = state.group.bankName || 'Chưa cấu hình';
    mount.querySelector('[data-qr-acct]').textContent = formatAccount(state.group.accountNumber, { spaced: true });

    const qrUrl = buildVietQRUrl({
      bankCode: state.group.bankCode,
      accountNumber: state.group.accountNumber,
      accountHolder: state.group.accountHolder,
      amount: state.group.monthlyTarget,
      note: `Dong quy thang ${new Date().getMonth() + 1}`,
    });
    const qrImg = mount.querySelector('[data-qr-img]');
    const qrPlaceholder = mount.querySelector('[data-qr-placeholder]');
    if (qrUrl) {
      qrImg.src = qrUrl;
      qrImg.classList.remove('hidden');
      qrPlaceholder.classList.add('hidden');
    } else {
      qrImg.classList.add('hidden');
      qrPlaceholder.classList.remove('hidden');
    }

    renderTransactions(mount.querySelector('[data-tx-list]'), state.transactions.slice(0, 10));
  });

  return () => unsub();
}

export function openQRDetail() {
  const { group } = store.getState();
  if (!group) return;

  const qrUrl = buildVietQRUrl({
    bankCode: group.bankCode,
    accountNumber: group.accountNumber,
    accountHolder: group.accountHolder,
    amount: group.monthlyTarget,
    note: `Dong quy thang ${new Date().getMonth() + 1}`,
  });

  const bankGridHtml = BANK_APPS.map((b) => `
    <button data-bank="${b.code}" class="flex flex-col items-center gap-1 p-2 rounded-xl bg-slate-50 hover:bg-emerald-50 active:scale-95 transition">
      <div class="w-10 h-10 rounded-xl ${b.color} text-white flex items-center justify-center text-[10px] font-bold shadow">${b.code}</div>
      <span class="text-[10px] font-medium text-slate-700 truncate max-w-full">${escapeHtml(b.name)}</span>
    </button>
  `).join('');

  openModal({
    title: 'Chuyển tiền đóng quỹ',
    bodyHtml: `
      <div class="flex flex-col items-center">
        ${qrUrl
          ? `<button id="qr-image-btn" class="w-56 h-56 rounded-2xl border-2 border-emerald-100 overflow-hidden active:scale-95 transition" title="Bấm để mở app ngân hàng">
               <img src="${qrUrl}" alt="VietQR" class="w-full h-full" />
             </button>
             <p class="text-[10px] text-slate-400 mt-2 flex items-center gap-1">
               <i class="fa-solid fa-hand-pointer"></i> Bấm vào QR để chọn app ngân hàng
             </p>`
          : `<div class="w-56 h-56 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 text-center px-4"><p class="text-sm">Chưa có thông tin tài khoản.<br/>Vào <strong>Cài đặt</strong> để cấu hình.</p></div>`}

        <div class="w-full mt-4 space-y-1.5 text-sm">
          <div class="flex justify-between"><span class="text-slate-500">Ngân hàng</span><span class="font-semibold text-slate-800">${escapeHtml(group.bankName || '—')}</span></div>
          <div class="flex justify-between"><span class="text-slate-500">Số tài khoản</span><span class="font-mono font-semibold text-slate-800">${escapeHtml(group.accountNumber || '—')}</span></div>
          <div class="flex justify-between"><span class="text-slate-500">Chủ tài khoản</span><span class="font-semibold text-slate-800 text-right">${escapeHtml(group.accountHolder || '—')}</span></div>
          <div class="flex justify-between"><span class="text-slate-500">Gợi ý số tiền</span><span class="font-semibold text-emerald-600">${formatVND(group.monthlyTarget || 0)}</span></div>
        </div>

        ${qrUrl ? `
          <div class="w-full mt-5">
            <p class="text-xs font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
              <i class="fa-solid fa-bolt text-emerald-600"></i> Chuyển nhanh qua app ngân hàng
            </p>
            <div class="grid grid-cols-4 gap-2 mb-2">
              ${bankGridHtml}
            </div>
            <p class="text-[10px] text-slate-400 leading-relaxed">
              Mẹo: trước tiên bấm <strong>Lưu QR</strong> (lưu vào ảnh), rồi mở app ngân hàng → <strong>Quét QR</strong> → <strong>Chọn từ thư viện</strong> → ảnh QR vừa lưu → thông tin tự điền.
            </p>
          </div>
        ` : ''}
      </div>
    `,
    footerHtml: qrUrl ? `
      <div class="grid grid-cols-3 gap-2">
        <button class="fb-btn fb-btn-ghost" data-act="copy"><i class="fa-regular fa-copy mr-1"></i> Copy STK</button>
        <button class="fb-btn fb-btn-primary" data-act="save"><i class="fa-solid fa-download mr-1"></i> Lưu QR</button>
        <button class="fb-btn fb-btn-ghost" data-act="share"><i class="fa-solid fa-share-nodes mr-1"></i> Chia sẻ</button>
      </div>
    ` : '',
    onMount: (sheet) => {
      // Tap on the QR image itself scrolls the bank grid into view on small
      // screens — equivalent to picking a bank.
      sheet.querySelector('#qr-image-btn')?.addEventListener('click', () => {
        const grid = sheet.querySelector('.grid.grid-cols-4');
        if (grid) grid.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });

      sheet.querySelector('[data-act="copy"]')?.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(group.accountNumber || ''); toast('Đã copy số tài khoản', 'success'); }
        catch { toast('Không thể copy', 'error'); }
      });

      sheet.querySelector('[data-act="save"]')?.addEventListener('click', async () => {
        if (!qrUrl) return;
        toast('Đang lưu...', 'info');
        const filename = `VietQR-${group.bankCode || 'bank'}-${(group.accountNumber || '').slice(-4)}.png`;
        const result = await saveImageAs(qrUrl, filename);
        if (result === 'downloaded') toast('Đã tải QR về máy', 'success');
        else if (result === 'shared') toast('Đã lưu QR', 'success');
        else toast('QR đã mở — giữ & "Lưu vào Ảnh"', 'info');
      });

      sheet.querySelector('[data-act="share"]')?.addEventListener('click', async () => {
        const text = `Đóng quỹ gia đình "${group.name}":\n${group.bankName} — ${group.accountNumber}\nChủ TK: ${group.accountHolder}`;
        if (navigator.share) {
          try { await navigator.share({ title: 'Mã đóng quỹ', text, url: qrUrl || undefined }); } catch {}
        } else {
          try { await navigator.clipboard.writeText(text); toast('Đã copy thông tin', 'success'); }
          catch { toast('Không thể chia sẻ', 'error'); }
        }
      });

      sheet.querySelectorAll('[data-bank]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const bank = BANK_APPS.find((b) => b.code === btn.dataset.bank);
          if (!bank) return;
          toast(`Đang mở ${bank.name}...`, 'info');
          openBankApp(bank);
        });
      });
    },
  });
}

// ---- Render helpers ----
function shell() {
  return `
    <section class="px-5">
      <div class="card-gradient card-decor rounded-3xl p-6 text-white">
        <div class="relative z-10">
          <div class="flex justify-between items-start mb-8">
            <div>
              <p class="text-[10px] text-emerald-100 uppercase tracking-[0.15em]" data-group-name>—</p>
              <p class="text-[10px] text-emerald-200/80 mt-1" data-period></p>
            </div>
            <div class="chip"></div>
          </div>
          <div class="mb-8">
            <p class="text-[32px] leading-none font-extrabold tracking-tight" data-balance>0 VND</p>
            <div class="flex items-center gap-2 mt-3" data-trend></div>
          </div>
          <div class="flex justify-between items-end">
            <div>
              <p class="text-[9px] text-emerald-200/80 uppercase tracking-widest">Số Tài Khoản</p>
              <p class="text-sm font-mono font-semibold tracking-widest mt-0.5" data-acct>—</p>
            </div>
            <div class="text-right">
              <p class="text-[9px] text-emerald-200/80 uppercase tracking-widest">Chủ tài khoản</p>
              <p class="text-sm font-semibold mt-0.5" data-treasurer>Quỹ chung</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="px-5 mt-6">
      <div class="grid grid-cols-4 gap-3">
        <button data-qa="income" class="flex flex-col items-center gap-2">
          <div class="w-14 h-14 rounded-2xl neu flex items-center justify-center neu-inset"><i class="fa-solid fa-plus text-emerald-600 text-lg"></i></div>
          <span class="text-[11px] text-slate-700 font-medium">Đóng Quỹ</span>
        </button>
        <button data-qa="expense" class="flex flex-col items-center gap-2">
          <div class="w-14 h-14 rounded-2xl neu flex items-center justify-center neu-inset"><i class="fa-solid fa-receipt text-red-500 text-lg"></i></div>
          <span class="text-[11px] text-slate-700 font-medium">Chi Tiêu</span>
        </button>
        <button data-qa="history" class="flex flex-col items-center gap-2">
          <div class="w-14 h-14 rounded-2xl neu flex items-center justify-center neu-inset"><i class="fa-solid fa-clock-rotate-left text-amber-500 text-lg"></i></div>
          <span class="text-[11px] text-slate-700 font-medium">Lịch Sử</span>
        </button>
        <button data-qa="qr" class="flex flex-col items-center gap-2">
          <div class="w-14 h-14 rounded-2xl neu flex items-center justify-center neu-inset"><i class="fa-solid fa-qrcode text-indigo-600 text-lg"></i></div>
          <span class="text-[11px] text-slate-700 font-medium">QR Code</span>
        </button>
      </div>
    </section>

    <section class="px-5 mt-6">
      <div class="bg-white rounded-3xl p-5 neu-soft relative overflow-hidden">
        <div class="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-emerald-50"></div>
        <div class="absolute -bottom-10 -left-10 w-24 h-24 rounded-full bg-emerald-50"></div>
        <div class="relative z-10">
          <div class="flex items-center justify-between mb-4">
            <div>
              <h3 class="text-sm font-semibold text-slate-800 flex items-center gap-2"><i class="fa-solid fa-qrcode text-emerald-600"></i> Mã VietQR Đóng Quỹ</h3>
              <p class="text-[11px] text-slate-500 mt-1">Quét để đóng quỹ tháng này</p>
            </div>
            <div class="flex items-center gap-1.5 bg-emerald-50 text-emerald-700 text-[10px] font-bold px-2.5 py-1 rounded-full">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> ACTIVE
            </div>
          </div>
          <div class="flex items-center gap-4">
            <div class="qr-pulse shrink-0">
              <div class="w-32 h-32 bg-white p-2 rounded-2xl border-2 border-emerald-100 flex items-center justify-center">
                <img data-qr-img alt="VietQR" class="hidden w-full h-full rounded-lg object-contain" loading="lazy" />
                <div data-qr-placeholder class="text-center text-slate-400 text-[10px] px-2">Cấu hình ngân hàng trong Cài đặt</div>
              </div>
            </div>
            <div class="flex-1 min-w-0">
              <div class="mb-2">
                <p class="text-[9px] text-slate-500 uppercase tracking-wider">Ngân hàng</p>
                <p class="text-sm font-bold text-slate-800" data-qr-bank>—</p>
              </div>
              <div class="mb-3">
                <p class="text-[9px] text-slate-500 uppercase tracking-wider">Số tài khoản</p>
                <p class="text-[13px] font-mono font-semibold text-slate-800" data-qr-acct>—</p>
              </div>
              <button data-share-qr class="w-full text-xs bg-emerald-600 text-white font-semibold py-2 rounded-xl hover:bg-emerald-700 transition flex items-center justify-center gap-1.5">
                <i class="fa-solid fa-share-nodes text-[10px]"></i> Chia sẻ QR
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="px-5 mt-6">
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-base font-semibold text-slate-800">Giao dịch gần đây</h3>
        <button data-view-all class="text-xs text-emerald-600 font-semibold flex items-center gap-1">
          Xem tất cả <i class="fa-solid fa-arrow-right text-[10px]"></i>
        </button>
      </div>
      <div class="bg-white rounded-3xl p-2 neu-soft">
        <div class="smooth-scroll max-h-80 overflow-y-auto pr-1" data-tx-list></div>
      </div>
    </section>
  `;
}

function renderTransactions(container, list) {
  if (list.length === 0) {
    container.innerHTML = `<div class="empty-state">
      <i class="fa-regular fa-folder-open"></i>
      <p class="text-sm">Chưa có giao dịch nào</p>
      <p class="text-xs text-slate-400 mt-1">Bấm "Đóng Quỹ" để bắt đầu</p>
    </div>`;
    return;
  }

  container.innerHTML = list.map((tx) => {
    const cat = getCategory(tx.category);
    const sign = tx.type === 'income' ? '+' : '-';
    const color = tx.type === 'income' ? 'text-emerald-600' : 'text-red-500';
    return `
      <div class="flex items-center gap-3 p-3 rounded-2xl hover:bg-slate-50 transition cursor-pointer" data-tx-id="${tx.id}">
        <div class="w-11 h-11 rounded-xl ${bgSoft(cat.color)} flex items-center justify-center shrink-0">
          <i class="fa-solid ${cat.icon} ${textStrong(cat.color)}"></i>
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-semibold text-slate-800 truncate">${escapeHtml(tx.note || cat.label)}</p>
          <p class="text-[11px] text-slate-500 mt-0.5">${escapeHtml(tx.memberName || '—')} · ${relativeDate(tx.date)}</p>
        </div>
        <p class="text-sm font-bold ${color} shrink-0">${sign}${new Intl.NumberFormat('vi-VN').format(tx.amount)}</p>
      </div>
    `;
  }).join('');

  container.querySelectorAll('[data-tx-id]').forEach((row) => {
    row.addEventListener('click', () => openTxDetail(row.dataset.txId));
  });
}

function openTxDetail(id) {
  const state = store.getState();
  const tx = state.transactions.find((t) => t.id === id);
  if (!tx) return;
  const cat = getCategory(tx.category);
  const sign = tx.type === 'income' ? '+' : '-';
  const user = state.user;
  const canDelete = user && (tx.createdBy === user.uid || tx.memberUid === user.uid || store.isOwner());

  openModal({
    title: 'Chi tiết giao dịch',
    bodyHtml: `
      <div class="text-center mb-5">
        <div class="inline-flex w-16 h-16 rounded-2xl ${bgSoft(cat.color)} items-center justify-center mb-3">
          <i class="fa-solid ${cat.icon} ${textStrong(cat.color)} text-2xl"></i>
        </div>
        <p class="text-3xl font-bold ${tx.type === 'income' ? 'text-emerald-600' : 'text-red-500'}">
          ${sign}${new Intl.NumberFormat('vi-VN').format(tx.amount)} <span class="text-base font-medium">VND</span>
        </p>
      </div>
      <div class="space-y-3 text-sm bg-slate-50 rounded-2xl p-4">
        <div class="flex justify-between"><span class="text-slate-500">Loại</span><span class="font-semibold">${cat.label}</span></div>
        <div class="flex justify-between"><span class="text-slate-500">Người ${tx.type === 'income' ? 'đóng' : 'chi'}</span><span class="font-semibold">${escapeHtml(tx.memberName || '—')}</span></div>
        <div class="flex justify-between"><span class="text-slate-500">Thời gian</span><span class="font-semibold">${new Date(tx.date).toLocaleString('vi-VN')}</span></div>
        <div class="pt-2 border-t border-slate-200">
          <p class="text-slate-500 mb-1">Ghi chú</p>
          <p class="font-medium text-slate-800">${escapeHtml(tx.note || '—')}</p>
        </div>
      </div>
    `,
    footerHtml: canDelete
      ? `<button class="fb-btn fb-btn-danger" data-act="delete"><i class="fa-regular fa-trash-can mr-1"></i> Xoá giao dịch</button>`
      : '',
    onMount: (sheet) => {
      const btn = sheet.querySelector('[data-act="delete"]');
      if (btn) {
        btn.addEventListener('click', async () => {
          const ok = await confirmDialog({
            title: 'Xoá giao dịch?',
            message: 'Hành động không thể hoàn tác. Số dư sẽ được tính lại cho cả nhóm.',
            confirmText: 'Xoá', danger: true,
          });
          if (!ok) return;
          try {
            await store.deleteTransaction(id);
            toast('Đã xoá giao dịch', 'info');
          } catch (err) {
            toast(err.message || 'Không xoá được', 'error');
          }
        });
      }
    },
  });
}

function openHistory() {
  const allTx = store.getTransactions();

  openModal({
    title: 'Lịch sử giao dịch',
    bodyHtml: `
      <div class="space-y-3 mb-4">
        <input type="text" id="history-search" class="fb-input" placeholder="🔍 Tìm theo ghi chú, thành viên..." />
        <div class="flex gap-2">
          <select id="history-type" class="fb-input flex-1">
            <option value="all">Tất cả</option>
            <option value="income">Thu</option>
            <option value="expense">Chi</option>
          </select>
          <select id="history-month" class="fb-input flex-1">
            <option value="all">Mọi tháng</option>
            ${[...new Set(allTx.map((t) => monthKey(t.date)))].sort().reverse().map((m) => `<option value="${m}">${m}</option>`).join('')}
          </select>
        </div>
      </div>
      <div id="history-list" class="space-y-1 max-h-[55vh] overflow-y-auto smooth-scroll -mx-1 px-1"></div>
    `,
    onMount: (sheet) => {
      const search = sheet.querySelector('#history-search');
      const typeSel = sheet.querySelector('#history-type');
      const monthSel = sheet.querySelector('#history-month');
      const list = sheet.querySelector('#history-list');

      const refresh = () => {
        const q = search.value.trim().toLowerCase();
        const type = typeSel.value;
        const m = monthSel.value;
        const filtered = allTx.filter((t) => {
          if (type !== 'all' && t.type !== type) return false;
          if (m !== 'all' && monthKey(t.date) !== m) return false;
          if (q) {
            const hay = `${t.note || ''} ${t.memberName || ''} ${getCategory(t.category).label}`.toLowerCase();
            if (!hay.includes(q)) return false;
          }
          return true;
        });

        if (filtered.length === 0) {
          list.innerHTML = `<div class="empty-state"><i class="fa-regular fa-face-meh"></i><p class="text-sm">Không có giao dịch phù hợp</p></div>`;
          return;
        }

        list.innerHTML = filtered.map((tx) => {
          const cat = getCategory(tx.category);
          const sign = tx.type === 'income' ? '+' : '-';
          const color = tx.type === 'income' ? 'text-emerald-600' : 'text-red-500';
          return `
            <div class="flex items-center gap-3 p-3 rounded-2xl hover:bg-slate-50 transition cursor-pointer" data-tx-id="${tx.id}">
              <div class="w-10 h-10 rounded-xl ${bgSoft(cat.color)} flex items-center justify-center shrink-0">
                <i class="fa-solid ${cat.icon} ${textStrong(cat.color)} text-sm"></i>
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-semibold text-slate-800 truncate">${escapeHtml(tx.note || cat.label)}</p>
                <p class="text-[11px] text-slate-500">${escapeHtml(tx.memberName || '—')} · ${relativeDate(tx.date)}</p>
              </div>
              <p class="text-sm font-bold ${color}">${sign}${new Intl.NumberFormat('vi-VN').format(tx.amount)}</p>
            </div>
          `;
        }).join('');

        list.querySelectorAll('[data-tx-id]').forEach((row) => {
          row.addEventListener('click', () => { closeModal(); openTxDetail(row.dataset.txId); });
        });
      };

      [search, typeSel, monthSel].forEach((el) => el.addEventListener('input', refresh));
      refresh();
    },
  });
}

// ---- helpers ----
function formatAccount(acct, { spaced = false } = {}) {
  if (!acct) return '—';
  if (acct.length < 6) return acct;
  if (spaced) return acct.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
  return `**** **** ${acct.slice(-4)}`;
}

function computeMonthTrend(transactions) {
  const now = new Date();
  const thisKey = monthKey(now);
  const lastKey = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 15));

  const netOf = (key) =>
    transactions.filter((t) => monthKey(t.date) === key)
      .reduce((s, t) => s + (t.type === 'income' ? t.amount : -t.amount), 0);

  const thisNet = netOf(thisKey);
  const lastNet = netOf(lastKey);
  if (lastNet === 0) {
    return thisNet === 0 ? '' : `<span class="text-[11px] text-emerald-100">Tháng này: ${formatVND(thisNet, { signed: true })}</span>`;
  }
  const diffPct = ((thisNet - lastNet) / Math.abs(lastNet)) * 100;
  const icon = diffPct >= 0 ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down';
  const sign = diffPct >= 0 ? '+' : '';
  return `
    <span class="text-[11px] bg-white/15 backdrop-blur px-2 py-0.5 rounded-full">
      <i class="fa-solid ${icon} mr-1"></i>${sign}${diffPct.toFixed(1)}%
    </span>
    <span class="text-[11px] text-emerald-100/90">so với tháng trước</span>
  `;
}
