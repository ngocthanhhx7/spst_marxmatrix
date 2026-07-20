import { Link } from 'react-router';
export function NotFoundPage() {
  return (
    <section>
      <h1>Không tìm thấy trang</h1>
      <p>Đường dẫn này không tồn tại hoặc đã được chuyển.</p>
      <Link to="/">Về trang chủ</Link>
    </section>
  );
}
