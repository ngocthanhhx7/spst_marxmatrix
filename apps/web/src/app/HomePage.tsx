import { Link } from 'react-router';
export function HomePage() {
  return (
    <section>
      <h1>MarxMatrix</h1>
      <p>
        Không gian học tập giúp bạn đọc, đối thoại và kiểm tra lập luận một cách có trách nhiệm.
      </p>
      <Link to="/register">Tạo tài khoản</Link>
    </section>
  );
}
