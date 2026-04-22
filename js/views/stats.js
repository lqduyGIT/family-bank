// ============================================================
// views/stats.js — 6-month bar chart + top categories + summary
// ============================================================

import { store } from '../store.js';
import {
  formatVND, formatCompactVND, monthKey, monthLabel, getCategory,
  bgSoft, textStrong, escapeHtml,
} from '../utils.js';

export function render(mount, storeRef = store) {
  mount.innerHTML = shell();
  const unsub = storeRef.subscribe((state) => {
    if (state.status !== 'ready') return;
    update(mount, state);
  });
  return () => unsub();
}

function shell() {
  return `
    <section class="px-5">
      <h2 class="text-xl font-bold text-slate-800 mb-1">Thống kê</h2>
      <p class="text-sm text-slate-500 mb-5">Tổng quan thu / chi theo tháng</p>

      <div class="grid grid-cols-3 gap-3 mb-5">
        <div class="bg-white rounded-2xl p-3 neu-soft">
          <p class="text-[10px] text-slate-500 uppercase tracking-wider">Thu tháng</p>
          <p class="text-sm font-bold text-emerald-600 mt-1" data-income-month>—</p>
        </div>
        <div class="bg-white rounded-2xl p-3 neu-soft">
          <p class="text-[10px] text-slate-500 uppercase tracking-wider">Chi tháng</p>
          <p class="text-sm font-bold text-red-500 mt-1" data-expense-month>—</p>
        </div>
        <div class="bg-white rounded-2xl p-3 neu-soft">
          <p class="text-[10px] text-slate-500 uppercase tracking-wider">Còn lại</p>
          <p class="text-sm font-bold text-slate-800 mt-1" data-net-month>—</p>
        </div>
      </div>

      <div class="bg-white rounded-3xl p-5 neu-soft mb-5">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-sm font-semibold text-slate-800">6 tháng gần nhất</h3>
          <div class="flex items-center gap-3 text-[11px]">
            <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-emerald-500"></span>Thu</span>
            <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-red-400"></span>Chi</span>
          </div>
        </div>
        <div data-chart></div>
      </div>

      <div class="bg-white rounded-3xl p-5 neu-soft mb-8">
        <h3 class="text-sm font-semibold text-slate-800 mb-4">Top danh mục chi (tháng này)</h3>
        <div data-top-cats class="space-y-3"></div>
      </div>
    </section>
  `;
}

function update(mount, state) {
  const now = new Date();
  const thisKey = monthKey(now);
  const txs = state.transactions;

  const txThisMonth = txs.filter((t) => monthKey(t.date) === thisKey);
  const incomeMonth = txThisMonth.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expenseMonth = txThisMonth.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const netMonth = incomeMonth - expenseMonth;

  mount.querySelector('[data-income-month]').textContent = formatCompactVND(incomeMonth);
  mount.querySelector('[data-expense-month]').textContent = formatCompactVND(expenseMonth);
  const netEl = mount.querySelector('[data-net-month]');
  netEl.textContent = formatCompactVND(netMonth);
  netEl.className = `text-sm font-bold mt-1 ${netMonth >= 0 ? 'text-emerald-600' : 'text-red-500'}`;

  mount.querySelector('[data-chart]').innerHTML = renderChart(txs);
  mount.querySelector('[data-top-cats]').innerHTML = renderTopCategories(txThisMonth);
}

function renderChart(transactions) {
  const now = new Date();
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 15);
    months.push(monthKey(d));
  }

  const data = months.map((key) => {
    const inMonth = transactions.filter((t) => monthKey(t.date) === key);
    return {
      key,
      income:  inMonth.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0),
      expense: inMonth.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0),
    };
  });

  const max = Math.max(1, ...data.flatMap((d) => [d.income, d.expense]));
  const W = 320, H = 180, PAD = 24, BW = 12, GAP = 4;
  const groupW = (W - PAD * 2) / data.length;

  const bars = data.map((d, i) => {
    const groupX = PAD + i * groupW + groupW / 2;
    const x1 = groupX - BW - GAP / 2;
    const x2 = groupX + GAP / 2;
    const h1 = (d.income  / max) * (H - PAD * 2);
    const h2 = (d.expense / max) * (H - PAD * 2);
    return `
      <g>
        <rect x="${x1}" y="${H - PAD - h1}" width="${BW}" height="${h1}" rx="4" fill="#10b981">
          <title>Thu ${monthLabel(d.key)}: ${formatVND(d.income)}</title>
        </rect>
        <rect x="${x2}" y="${H - PAD - h2}" width="${BW}" height="${h2}" rx="4" fill="#f87171">
          <title>Chi ${monthLabel(d.key)}: ${formatVND(d.expense)}</title>
        </rect>
        <text x="${groupX}" y="${H - 6}" text-anchor="middle" font-size="10" fill="#64748b" font-family="Inter">${monthLabel(d.key)}</text>
      </g>
    `;
  }).join('');

  const gridLines = [0.25, 0.5, 0.75, 1].map((f) => {
    const y = H - PAD - f * (H - PAD * 2);
    return `<line x1="${PAD}" y1="${y}" x2="${W - PAD}" y2="${y}" stroke="#e2e8f0" stroke-dasharray="2 3"/>
            <text x="${PAD - 4}" y="${y + 3}" text-anchor="end" font-size="8" fill="#94a3b8" font-family="Inter">${formatCompactVND(max * f)}</text>`;
  }).join('');

  return `<svg viewBox="0 0 ${W} ${H}" class="w-full h-auto">${gridLines}${bars}</svg>`;
}

function renderTopCategories(monthTxs) {
  const expenses = monthTxs.filter((t) => t.type === 'expense');
  if (expenses.length === 0) {
    return `<div class="empty-state"><i class="fa-regular fa-chart-bar"></i><p class="text-sm">Chưa có chi tiêu tháng này</p></div>`;
  }

  const byCat = {};
  for (const tx of expenses) byCat[tx.category] = (byCat[tx.category] || 0) + tx.amount;
  const total = Object.values(byCat).reduce((s, v) => s + v, 0);
  const sorted = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 5);

  return sorted.map(([key, amount]) => {
    const cat = getCategory(key);
    const pct = (amount / total) * 100;
    return `
      <div>
        <div class="flex items-center justify-between mb-1.5">
          <div class="flex items-center gap-2">
            <div class="w-8 h-8 rounded-lg ${bgSoft(cat.color)} flex items-center justify-center">
              <i class="fa-solid ${cat.icon} ${textStrong(cat.color)} text-xs"></i>
            </div>
            <span class="text-sm font-medium text-slate-700">${escapeHtml(cat.label)}</span>
          </div>
          <div class="text-right">
            <p class="text-sm font-bold text-slate-800">${formatCompactVND(amount)}</p>
            <p class="text-[10px] text-slate-500">${pct.toFixed(1)}%</p>
          </div>
        </div>
        <div class="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div class="h-full rounded-full ${textStrong(cat.color).replace('text-', 'bg-')}" style="width: ${pct}%"></div>
        </div>
      </div>
    `;
  }).join('');
}
