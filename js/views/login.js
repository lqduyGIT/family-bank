// ============================================================
// views/login.js — Google sign-in screen
// ============================================================

import { store } from '../store.js';
import { toast } from '../components/toast.js';

export function render(mount) {
  mount.innerHTML = `
    <section class="px-6 pt-6 pb-10">
      <div class="text-center mb-10">
        <div class="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-xl shadow-emerald-500/30 mb-4">
          <i class="fa-solid fa-piggy-bank text-white text-3xl"></i>
        </div>
        <h1 class="text-2xl font-bold text-slate-800">Family Bank</h1>
        <p class="text-sm text-slate-500 mt-2">Quản lý quỹ gia đình, cùng nhau.</p>
      </div>

      <div class="bg-white rounded-3xl p-6 neu-soft mb-6">
        <h2 class="text-base font-semibold text-slate-800 mb-1">Đăng nhập</h2>
        <p class="text-xs text-slate-500 mb-5">Dùng tài khoản Google để đồng bộ với các thành viên trong nhóm.</p>

        <button id="google-btn" class="w-full flex items-center justify-center gap-3 py-3 rounded-2xl border-2 border-slate-200 hover:bg-slate-50 active:bg-slate-100 transition font-semibold text-slate-700">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Tiếp tục với Google
        </button>

        <div class="flex items-center gap-3 my-4">
          <div class="flex-1 h-px bg-slate-200"></div>
          <span class="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">hoặc</span>
          <div class="flex-1 h-px bg-slate-200"></div>
        </div>

        <button id="guest-btn" class="w-full flex items-center justify-center gap-3 py-3 rounded-2xl border-2 border-dashed border-slate-300 hover:bg-slate-50 active:bg-slate-100 transition font-semibold text-slate-600">
          <i class="fa-solid fa-user-secret text-slate-500"></i>
          Tiếp tục với khách
        </button>
        <p class="text-[10px] text-slate-400 mt-2 leading-snug text-center">
          Tài khoản tạm — sẽ <strong>bị xoá khi đăng xuất</strong> hoặc xoá ứng dụng.
          Không khôi phục được. Khuyên dùng Google nếu lưu dữ liệu lâu dài.
        </p>
      </div>

      <div class="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 text-[12px] text-emerald-800">
        <p class="font-semibold mb-1"><i class="fa-solid fa-info-circle mr-1"></i> Cách hoạt động</p>
        <ul class="space-y-1 list-disc list-inside">
          <li>Mỗi người đăng nhập Google cá nhân</li>
          <li>Một người tạo <strong>nhóm gia đình</strong> và chia sẻ mã mời</li>
          <li>Các thành viên khác nhập mã → tham gia → cùng theo dõi quỹ</li>
          <li>Mọi giao dịch đồng bộ real-time giữa các thiết bị trong nhóm</li>
        </ul>
      </div>
    </section>
  `;

  mount.querySelector('#google-btn').addEventListener('click', async () => {
    try {
      await store.signInWithGoogle();
    } catch (err) {
      console.error(err);
      const msg = (err && err.code === 'auth/popup-closed-by-user')
        ? 'Đã huỷ đăng nhập'
        : (err.message || 'Đăng nhập thất bại');
      toast(msg, 'error');
    }
  });

  const guestBtn = mount.querySelector('#guest-btn');
  guestBtn.addEventListener('click', async () => {
    const oldHtml = guestBtn.innerHTML;
    guestBtn.disabled = true;
    guestBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Đang vào...`;
    try {
      await store.signInAsGuest();
    } catch (err) {
      console.error(err);
      const msg = err?.code === 'auth/operation-not-allowed'
        ? 'Anonymous Auth chưa được bật trong Firebase Console'
        : (err?.message || 'Vào với khách thất bại');
      toast(msg, 'error');
      guestBtn.disabled = false;
      guestBtn.innerHTML = oldHtml;
    }
  });
}
