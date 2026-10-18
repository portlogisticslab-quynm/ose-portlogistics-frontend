# Đếm người truy cập từng app (Admin › Truy cập app)

Mục đích: biết app nào có nhiều người dùng để quyết định mở thu phí từng app.
Hiện tại mọi app vẫn miễn phí và mở hoàn toàn; khi có 5–6 app thu phí thì làm gói 5–10 app.
Cách này thay cho phương án "miễn phí 3 tháng rồi thu phí cùng lúc" (`PAYWALL_FROM`).

## Cách hoạt động

```
route.ose.vn, ukc.ose.vn, ... (và portlogistics.ose.vn)
   └─ <script src="https://portlogistics.ose.vn/ose-track.js" defer>
        ├─ mã khách ẩn danh: cookie ose_vid, Domain=.ose.vn (dùng chung mọi app)
        └─ 1 beacon / phiên / app  →  POST https://api-portlogistics.ose.vn/api/v1/visit
                                         └─ bảng app_visits (SQLite home server)
Admin › Truy cập app  ←  GET /api/v1/admin/stats/visits?days=30
```

- Đếm cả khi người dùng vào thẳng app, không qua trang chủ.
- Cùng một người mở 5 app được tính là 1 người (cột "Dùng từ 2 app" gợi ý cho gói nhiều app).
- Cùng người, cùng app, trong 30 phút chỉ tính 1 lượt. Bỏ qua bot, trình duyệt tự động, localhost, *.pages.dev.
- Không lưu IP, tên, email. Mã khách được băm thêm với `VISIT_SALT` trước khi lưu.
- Render (`READ_ONLY=true`) nhận beacon nhưng không ghi: lúc home server lỗi thì mất vài lượt, chấp nhận được.

Bảng trong Admin: người truy cập, so với kỳ trước (▲▼ %), lượt, người quay lại (≥ 2 ngày khác nhau),
nguồn đến (qua hub / từ app khác / tìm kiếm / mạng xã hội / vào thẳng / trang khác), biểu đồ theo ngày,
lần cuối; ô "Ngưỡng xem xét thu phí" tô màu các app vượt ngưỡng; tải CSV.

Link quảng bá trên fanpage nên thêm `?utm_source=facebook` để tách riêng nguồn Facebook.

## Triển khai

### 1. Backend (repo ose-portlogistics-backend)

```powershell
cd C:\apps\ose-portlogistics-backend
Copy-Item <đường dẫn frontend>\docs\backend\visits.py app\visits.py
Copy-Item <đường dẫn frontend>\docs\backend\test_visits.py tests\test_visits.py   # nếu backend có thư mục tests

# Tìm tên engine, get_db và dependency kiểm tra admin đang dùng cho /admin/stats/clicks
Select-String -Path app\*.py, app\*\*.py -Pattern "stats/clicks|def get_db|create_engine" -Context 0,3
```

Thêm vào `app/main.py` (đổi tên cho khớp với kết quả tìm ở trên):

```python
from app.visits import build_visits_router, init_visits

init_visits(engine)                                         # tạo bảng app_visits nếu chưa có
app.include_router(build_visits_router(get_db, require_staff))  # require_staff = dependency của /admin/stats/clicks
```

Chạy test rồi triển khai lên home server (Render tự build khi push):

```powershell
docker compose run --rm backend pytest -q tests/test_visits.py
docker compose up -d --build
git add app/visits.py app/main.py tests/test_visits.py
git commit -m "Add per-app visitor counter (app_visits)"
git push
```

Biến môi trường (tuỳ chọn, đặt giống nhau trên home và Render): `VISIT_SALT=<chuỗi ngẫu nhiên>`.
Không đặt thì dùng `GATE_SECRET`.

Kiểm tra:

```powershell
curl.exe -s -o NUL -w "%{http_code}`n" -X POST https://api-portlogistics.ose.vn/api/v1/visit `
  -H "Content-Type: text/plain" -A "Mozilla/5.0" `
  --data '{\"host\":\"route.ose.vn\",\"vid\":\"test0000000000000001\",\"new\":1}'
# → 204, rồi mở Admin › Truy cập app: route.ose.vn có 1 người
```

### 2. Frontend hub (repo này)

`git push` → Cloudflare Pages tự build. Bản này thêm:
`public/ose-track.js`, tab Admin "Truy cập app" (`src/admin/VisitsPanel.tsx`), dòng script trong `index.html`
để đếm cả trang chủ, và tiêu đề cache cho `/ose-track.js` (1 giờ) trong `public/_headers`.

### 3. Gắn vào các app

```powershell
cd C:\apps\ose-portlogistics-frontend\scripts
powershell -ExecutionPolicy Bypass -File .\add-ose-track.ps1               # xem trước file nào sẽ sửa
powershell -ExecutionPolicy Bypass -File .\add-ose-track.ps1 -Apply -Push  # sửa + push, Pages tự build
```

App không nằm trong `C:\apps\*-frontend` thì thêm tay 1 dòng trong `<head>`:

```html
<script src="https://portlogistics.ose.vn/ose-track.js" defer></script>
```

Nếu app có Content-Security-Policy, thêm `https://portlogistics.ose.vn` vào `script-src`
và `https://api-portlogistics.ose.vn` vào `connect-src`.

### 4. Quyền riêng tư

Thêm vào chính sách quyền riêng tư (trang chủ, chân trang) một câu, ví dụ:
"Chúng tôi đếm số lượt sử dụng ẩn danh của từng ứng dụng (không lưu IP, tên hay email) để cải thiện dịch vụ."
