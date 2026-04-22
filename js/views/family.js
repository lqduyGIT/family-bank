// ============================================================
// views/family.js — group members list + invite code + leaderboard
// ============================================================

import { store } from '../store.js';
import { formatCompactVND, escapeHtml, monthKey } from '../utils.js';
import { toast } from '../components/toast.js';

export function render(mount, storeRef = store) {
  mount.innerHTML = shell();

  const unsub = storeRef.subscribe((state) => {
    if (state.status !== 'ready' || !state.group) return;
    update(mount, state);
  });

  mount.querySelector('[data-copy-code]').addEventListener('click', () => {
    const code = store.getGroup()?.inviteCode || '';
    navigator.clipboard.writeText(code).then(
      () => toast(`Đã copy mã "${code}"`, 'success'),
      () => toast('Không thể copy', 'error'),
    );
  });

  mount.querySelector('[data-share-code]').addEventListener('click', async () => {
    const group = store.getGroup();
    if (!group) return;
    const url = `${location.origin}${location.pathname}?invite=${group.inviteCode}`;
    const text = `Tham gia quỹ gia đình "${group.name}"\nMã mời: ${group.inviteCode}\n${url}`;
    if (navigator.share) {
      try { await navigator.share({ title: 'Lời mời tham gia', text, url }); } catch {}
    } else {
      try { await navigator.clipboard.writeText(text); toast('Đã copy lời mời', 'success'); }
      catch { toast('Không chia sẻ được', 'error'); }
    }
  });

  return () => unsub();
}

function shell() {
  return `
    <section class="px-5">
      <h2 class="text-xl font-bold text-slate-800 mb-1">Gia đình</h2>
      <p class="text-sm text-slate-500 mb-5">Thành viên & mã mời</p>

      <div class="bg-white rounded-3xl p-5 neu-soft mb-5">
        <div class="flex items-start justify-between gap-3 mb-3">
          <div>
            <p class="text-[10px] text-slate-500 uppercase tracking-wider">Tên nhóm</p>
            <p class="text-base font-bold text-slate-800" data-group-name>—</p>
            <p class="text-[11px] text-slate-400 mt-0.5" data-member-count></p>
          </div>
          <div class="text-right">
            <p class="text-[10px] text-slate-500 uppercase tracking-wider">Mã mời</p>
            <p class="text-2xl font-bold font-mono tracking-[0.2em] text-emerald-600" data-invite-code>——————</p>
          </div>
        </div>
        <div class="flex gap-2 mt-3">
          <button class="fb-btn fb-btn-ghost flex-1" data-copy-code>
            <i class="fa-regular fa-copy mr-1"></i> Copy mã
          </button>
          <button class="fb-btn fb-btn-primary flex-1" data-share-code>
            <i class="fa-solid fa-share-nodes mr-1"></i> Chia sẻ
          </button>
        </div>
      </div>

      <h3 class="text-sm font-semibold text-slate-800 mb-3">Thành viên nhóm</h3>
      <div class="bg-white rounded-3xl p-2 neu-soft mb-5" data-members></div>

      <h3 class="text-sm font-semibold text-slate-800 mb-3">🏆 Đóng góp tháng này</h3>
      <div class="bg-white rounded-3xl p-5 neu-soft mb-8" data-leaderboard></div>
    </section>
  `;
}

function update(mount, state) {
  const { group, members, transactions, user } = state;

  mount.querySelector('[data-group-name]').textContent = group.name;
  mount.querySelector('[data-member-count]').textContent = `${members.length} thành viên`;
  mount.querySelector('[data-invite-code]').textContent = group.inviteCode || '—';

  // Members list
  const ownerUid = group.ownerUid;
  mount.querySelector('[data-members]').innerHTML = members.length === 0
    ? `<div class="empty-state"><i class="fa-regular fa-user"></i><p class="text-sm">Chưa có thành viên</p></div>`
    : members.map((m) => {
        const isYou = user && m.uid === user.uid;
        const isOwner = m.uid === ownerUid;
        const avatar = m.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(m.displayName || m.uid)}&backgroundColor=b6e3f4`;
        return `
          <div class="flex items-center gap-3 p-3 rounded-2xl hover:bg-slate-50 transition">
            <img src="${avatar}" referrerpolicy="no-referrer" class="w-10 h-10 rounded-full bg-slate-100" />
            <div class="flex-1 min-w-0">
              <p class="text-sm font-semibold text-slate-800 truncate">${escapeHtml(m.displayName || 'Ẩn danh')}${isYou ? ' <span class="text-[10px] text-emerald-600 font-normal">(bạn)</span>' : ''}</p>
              <p class="text-[11px] text-slate-500">${isOwner ? '👑 Chủ nhóm' : 'Thành viên'} · Tham gia ${formatJoinDate(m.joinedAt)}</p>
            </div>
          </div>
        `;
      }).join('');

  // Leaderboard — contribution this month by member
  const thisKey = monthKey(new Date());
  const totals = {};
  for (const tx of transactions) {
    if (tx.type !== 'income') continue;
    if (monthKey(tx.date) !== thisKey) continue;
    totals[tx.memberUid] = (totals[tx.memberUid] || 0) + tx.amount;
  }
  const ranked = members
    .map((m) => ({ ...m, total: totals[m.uid] || 0 }))
    .sort((a, b) => b.total - a.total);

  const max = Math.max(1, ...ranked.map((r) => r.total));
  const lb = mount.querySelector('[data-leaderboard]');
  const totalContributed = Object.values(totals).reduce((s, v) => s + v, 0);

  if (totalContributed === 0) {
    lb.innerHTML = `<div class="empty-state"><i class="fa-regular fa-hand"></i><p class="text-sm">Chưa ai đóng quỹ tháng này</p></div>`;
  } else {
    lb.innerHTML = `
      <p class="text-xs text-slate-500 mb-3">Tổng: <span class="font-bold text-emerald-600">${formatCompactVND(totalContributed)}</span></p>
      <div class="space-y-3">
        ${ranked.slice(0, 10).map((r, idx) => {
          const pct = (r.total / max) * 100;
          const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}.`;
          return `
            <div>
              <div class="flex items-center justify-between text-sm mb-1">
                <span class="flex items-center gap-2 text-slate-700">
                  <span class="w-5 text-center">${medal}</span>
                  <span class="font-medium truncate">${escapeHtml(r.displayName || 'Ẩn danh')}</span>
                </span>
                <span class="font-bold ${r.total > 0 ? 'text-emerald-600' : 'text-slate-400'}">${formatCompactVND(r.total)}</span>
              </div>
              <div class="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div class="h-full rounded-full bg-emerald-500" style="width: ${pct}%"></div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }
}

function formatJoinDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('vi-VN');
}
