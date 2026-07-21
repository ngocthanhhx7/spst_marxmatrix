# Thiết kế header thống nhất MarxMatrix

**Ngày:** 2026-07-21

**Trạng thái:** Đã được người dùng duyệt

**Phạm vi:** Header trên Home, About và toàn bộ workspace web

## Vấn đề

MarxMatrix hiện có ba implementation header độc lập trong `LandingPage`, `AboutPage` và `AppShell`. Mỗi implementation tự quản lý nhãn, route, trạng thái tài khoản, menu mobile và CSS. Vì vậy Home không hiển thị đầy đủ các tính năng hiện có, đặc biệt là AI Chat và Bảng điều khiển, còn About và workspace có thứ tự và hành vi điều hướng khác nhau.

Nguyên nhân gốc là navigation sản phẩm không có một nguồn dữ liệu và component dùng chung. Việc bổ sung tính năng vào `AppShell` không tự cập nhật Home hoặc About.

## Mục tiêu

- Home, About và các trang workspace dùng cùng một header sản phẩm.
- Header luôn hiển thị đủ năm mục theo cùng thứ tự: Bảng điều khiển, Scanner, Copilot, Capital Arena, AI Chat.
- Mỗi route, nhãn, trạng thái active và hành vi mobile chỉ được khai báo một lần.
- Khách chưa đăng nhập vẫn nhìn thấy toàn bộ khả năng của sản phẩm.
- Khi khách mở một tính năng được bảo vệ, hệ thống chuyển tới đăng nhập và giữ đường dẫn đích để quay lại sau khi xác thực.
- Người đã đăng nhập tiếp tục có Tư liệu, tên tài khoản và Đăng xuất.
- Home và About giữ được nội dung, nhận diện editorial và các liên kết nội trang hiện có.

## Không thuộc phạm vi

- Không thiết kế lại nội dung hero, bảng phân tích, footer hoặc các workspace.
- Không thay đổi API xác thực hay quyền truy cập backend.
- Không biến Phương pháp, Tài liệu hoặc Giới thiệu thành navigation sản phẩm chính.
- Không thêm tính năng sản phẩm mới ngoài các route hiện có.

## Kiến trúc đề xuất

### Nguồn navigation duy nhất

Tạo module cấu hình navigation dùng chung, xuất danh sách bất biến gồm:

| Nhãn | Route | Yêu cầu đăng nhập |
| --- | --- | --- |
| Bảng điều khiển | `/dashboard` | Có |
| Scanner | `/scanner` | Có |
| Copilot | `/copilot` | Có |
| Capital Arena | `/arena` | Có |
| AI Chat | `/chat` | Có |

Desktop navigation, mobile navigation và test đều đọc từ danh sách này. Admin có thêm Học liệu theo vai trò nhưng không thay đổi năm mục chính.

### Component `SiteHeader`

`SiteHeader` là component duy nhất chịu trách nhiệm cho:

- Brand MarxMatrix liên kết về `/`.
- Desktop navigation sản phẩm.
- Mobile bottom navigation tương ứng với cùng danh sách sản phẩm.
- Trạng thái active dựa trên route hiện tại, bao gồm route con.
- Hành động tài khoản theo trạng thái phiên.
- Nhãn truy cập, focus và kích thước touch target tối thiểu 44px.

`SiteHeader` không nhận navigation từ từng trang. Utility line editorial của Home và About nằm ngoài component nên không tạo biến thể hành vi.

### Tích hợp trang

- `AppShell` render `SiteHeader` trên Home, About và workspace thay vì ẩn shell rồi để từng trang tự render header.
- `LandingPage` bỏ header và state menu cục bộ. Nội dung bắt đầu từ utility line và hero.
- `AboutPage` bỏ header và state menu cục bộ. Nội dung chính và utility line được giữ nguyên.
- Login và Register tiếp tục dùng `AuthFrame`; không render thêm `SiteHeader` để tránh chrome trùng lặp.
- Footer hiện tại không thuộc thay đổi này.

## Hành vi xác thực và điều hướng

### Khách chưa đăng nhập

- Thấy đủ năm mục sản phẩm cùng nút Đăng nhập và Đăng ký.
- Khi bấm một mục bảo vệ, route guard chuyển sang `/login` và lưu đường dẫn đích bằng cơ chế `returnTo` hiện có.
- Sau đăng nhập hoặc đăng ký thành công, người dùng quay lại đúng route đã chọn.

### Người đã đăng nhập

- Thấy đủ năm mục sản phẩm.
- Thấy liên kết Tư liệu, trạng thái hệ thống, tên tài khoản và nút Đăng xuất.
- Admin thấy thêm Học liệu.
- Home và About cũng dùng đúng trạng thái tài khoản này, không có implementation riêng.

### Liên kết nội trang

Phương pháp, Công cụ, Tài liệu và Giới thiệu được giữ trong nội dung Home, CTA hoặc footer. Chúng không cạnh tranh không gian với navigation sản phẩm chính. Các anchor hiện tại vẫn giữ focus management và smooth scrolling phù hợp.

## Responsive và giao diện

- Desktop giữ cấu trúc brand, navigation và account actions của workspace hiện tại.
- Mobile dùng bottom navigation hiện có của workspace cho tất cả trang; không duy trì hamburger menu riêng cho Landing/About.
- Header không che nội dung, không tạo hai navigation cùng lúc và hỗ trợ safe-area ở thiết bị di động.
- Màu, border, typography và trạng thái active lấy từ design tokens/CSS hiện có của `site-header`.
- Utility line của Home/About nằm dưới header chung để giữ cá tính editorial mà không làm phân mảnh navigation.

## Khả năng truy cập

- Chỉ có một landmark `banner` trên mỗi trang.
- Navigation desktop và mobile có tên truy cập rõ ràng.
- Route hiện tại dùng `aria-current="page"`.
- Mobile navigation có tên truy cập rõ ràng, trạng thái active và focus-visible.
- Mọi liên kết/nút đạt touch target tối thiểu 44px.
- Khi điều hướng route, viewport và focus behavior hiện có của `AppShell` được giữ.

## Kiểm thử

### Component

- Test cấu hình chứa đủ năm route đúng thứ tự.
- Test Home, About và workspace đều render cùng navigation sản phẩm.
- Test khách thấy đủ tính năng và hành động đăng nhập/đăng ký.
- Test người đã đăng nhập thấy account actions; admin thấy Học liệu.
- Test `aria-current` hoạt động trên route chính và route con.
- Test mobile navigation được tạo từ cùng cấu hình và không trùng chrome.

### Routing

- Test khách bấm AI Chat hoặc Scanner được chuyển tới login với `returnTo` chính xác.
- Test đăng nhập xong quay lại route đã chọn.
- Test Login/Register không render header thứ hai.

### Hồi quy

- Landing và About vẫn có một `main`, một `banner` và footer đúng cấu trúc.
- Anchor Phương pháp/Công cụ/Tài liệu vẫn hoạt động.
- Toàn bộ web unit tests, lint, typecheck và build phải xanh.
- QA responsive ở desktop, tablet và mobile phải xác nhận cùng danh sách chức năng.

## Chiến lược chuyển đổi

1. Viết test thất bại thể hiện Home/About thiếu navigation chung.
2. Tạo cấu hình navigation dùng chung và `SiteHeader` tối thiểu.
3. Chuyển `AppShell` sang render header chung trên các route phù hợp.
4. Xóa header/state/CSS không còn dùng khỏi Landing và About.
5. Chạy test, lint, typecheck, build và QA responsive.
6. Sau khi xác minh, merge vào `main`, push GitHub và triển khai EC2 bằng updater hiện có.

## Tiêu chí hoàn tất

- Home, About và workspace hiển thị cùng năm tính năng theo cùng thứ tự.
- Không còn ba nguồn khai báo header/navigation độc lập.
- Khách có thể khám phá đầy đủ tính năng và được đưa qua đăng nhập đúng cách.
- Người đăng nhập giữ đầy đủ account actions và quyền admin.
- Không có header trùng lặp trên Home, About, Login hoặc Register.
- Production desktop/mobile vượt qua kiểm tra điều hướng, console và responsive.
