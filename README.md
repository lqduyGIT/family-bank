# Family Bank — Quỹ Gia Đình

Prototype Mobile Web (PWA) cho ứng dụng quỹ gia đình nội bộ.

## Tech

- HTML5 + Tailwind CSS (CDN)
- Font Awesome 6 (CDN)
- Google Fonts — Inter
- Zero build step — mở `index.html` là chạy

## Preview

```bash
# Option 1 — open directly
start index.html      # Windows

# Option 2 — static server
npx serve .
# hoặc
python -m http.server 8080
```

Sau đó mở trình duyệt: `http://localhost:8080` — khuyến nghị bật DevTools → Device Toolbar (Ctrl+Shift+M) → chọn iPhone 14 để xem giao diện mobile đúng chuẩn.

## Cấu trúc

| Thành phần              | Mô tả                                                        |
| ----------------------- | ------------------------------------------------------------ |
| **Header**              | Lời chào + avatar + chuông thông báo                         |
| **Main Balance Card**   | Thẻ tín dụng gradient emerald — hiển thị tổng quỹ            |
| **Quick Actions**       | 4 nút: Đóng Quỹ · Chi Tiêu · Lịch Sử · QR Code               |
| **VietQR Section**      | Mã QR SVG + thông tin ngân hàng + nút chia sẻ                |
| **Recent Transactions** | Danh sách scrollable — 8 giao dịch mẫu                       |
| **Bottom Navigation**   | 5 tab với FAB trung tâm (Quét QR)                            |

