import { Link } from 'react-router';
import { BrandMark } from '../../shared/ui/BrandMark.js';
import './AboutPage.css';

const history = [
  [
    '01',
    'Lý thuyết / Thực tiễn',
    'Khởi đầu là khoảng cách giữa việc đọc lý thuyết và việc lần lại chứng cứ trong một lập luận cụ thể.'
  ],
  [
    '02',
    'Evidence Matrix',
    'Nhóm tạo một cách làm việc để đặt nguồn, nhận định và câu hỏi vào cùng một ma trận có thể kiểm tra.'
  ],
  [
    '03',
    'Capital Arena',
    'Không gian tranh luận cấu trúc được thêm vào để một lập trường có thể được chất vấn trước khi được giữ lại.'
  ]
] as const;

const workflow = [
  ['01', 'Thu thập', 'Đưa tài liệu hoặc nguồn cần đọc vào không gian làm việc.'],
  ['02', 'Trích xuất', 'Xác định đoạn văn, thực thể và chi tiết cần được xem lại.'],
  ['03', 'Liên kết', 'Giữ nhận định gắn với tài liệu ủng hộ hoặc thách thức nhận định đó.'],
  ['04', 'Chất vấn', 'Dùng Copilot và trao đổi nhóm để kiểm tra diễn giải.'],
  ['05', 'Ghi nhận', 'Lưu kết luận cùng bằng chứng, giới hạn và câu hỏi còn mở.']
] as const;

const protocol = [
  ['Nguồn', 'Ghi rõ tài liệu, bối cảnh và vị trí của chất liệu đang được sử dụng.'],
  ['Trích xuất', 'Tách đoạn, thực thể hoặc chi tiết liên quan ra để kiểm tra.'],
  ['Đối chiếu', 'Đặt các nguồn và dữ kiện cạnh nhau, bao gồm cả phần chưa khớp.'],
  ['Luận giải', 'Phân biệt điều tài liệu nói với điều người đọc đang suy luận.'],
  ['Phản biện', 'Mở kết luận cho câu hỏi, phản biện và cập nhật khi có chứng cứ mới.']
] as const;

const team = [
  'Vương Giang Trường HE186135',
  'Vũ Kim Kỳ HE182094',
  'Dương Tuấn Anh HE180437',
  'Nguyễn Xuân Dương HE190405',
  'Trần Đức Minh HE190690',
  'Phạm Hải Trung HE190486',
  'Nguyễn Khắc Tráng HE186034'
] as const;

export function AboutPage() {
  return (
    <div className="about" data-screen="about-01">
      <p className="about__utility-line">MARXMATRIX / HỒ SƠ DỰ ÁN / HỒ SƠ CÔNG KHAI</p>

      <main id="main-content" tabIndex={-1}>
        <section className="about__hero about__frame" aria-labelledby="about-title">
          <div>
            <p className="about__eyebrow">01 / LUẬN ĐỀ</p>
            <h1 id="about-title">
              Chúng tôi không bắt đầu bằng một sản phẩm. Chúng tôi bắt đầu bằng một câu hỏi.
            </h1>
            <p className="about__mantra">Không có bằng chứng, không có kết luận.</p>
            <p className="about__lede">
              MarxMatrix là không gian học tập do sinh viên xây dựng để đọc tài liệu, lần theo nhận
              định và kiểm tra một lập luận bên cạnh nguồn của nó. Hệ thống không thay thế phán
              đoán; nó làm cho con đường đi tới phán đoán dễ được xem xét hơn.
            </p>
            <div className="about__actions">
              <Link className="about__button about__button--amber" to="/scanner/new">
                Bắt đầu với tài liệu
              </Link>
              <Link className="about__button about__button--outline" to="/#method">
                Xem phương pháp
              </Link>
            </div>
          </div>
          <aside className="about__specimen" aria-label="Tóm tắt hồ sơ bằng chứng">
            <p>HỒ SƠ / MM-ABOUT</p>
            <dl>
              <div>
                <dt>Chủ đề</dt>
                <dd>Học tập cùng bằng chứng</dd>
              </div>
              <div>
                <dt>Tiêu chuẩn</dt>
                <dd>Nguồn được nhìn thấy</dd>
              </div>
              <div>
                <dt>Vị trí</dt>
                <dd>Dự án sinh viên</dd>
              </div>
            </dl>
          </aside>
        </section>

        <section className="about__origin about__frame" aria-labelledby="origin-title">
          <div>
            <p className="about__eyebrow about__eyebrow--amber">02 / HỒ SƠ KHỞI NGUỒN</p>
            <h2 id="origin-title">Ghi lại mục đích, không phải một lời quảng cáo.</h2>
          </div>
          <div className="about__origin-copy">
            <p>
              MarxMatrix được thực hiện bởi nhóm sinh viên có tên trong hồ sơ này. Điểm xuất phát là
              một tiền đề làm việc: khi một nhận định quan trọng, người đọc cần tìm được nguồn, xem
              được lối suy luận và gọi tên điều còn chưa chắc chắn.
            </p>
            <p>
              Trang này ghi lại mục đích và quy trình hiện tại của nhóm. Nó không tuyên bố về quy mô
              vận hành, sự chứng thực của tổ chức hay kết quả chưa được đo lường độc lập.
            </p>
          </div>
        </section>

        <section className="about__history about__frame" aria-labelledby="history-title">
          <div className="about__section-heading">
            <p className="about__eyebrow">03 / BA MỐC PHÁT TRIỂN</p>
            <h2 id="history-title">Từ một câu hỏi đến môi trường học tập đang được hoàn thiện.</h2>
          </div>
          <ol>
            {history.map(([number, title, description]) => (
              <li key={number}>
                <span>{number}</span>
                <div>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="about__workflow about__frame" aria-labelledby="workflow-title">
          <div className="about__section-heading">
            <p className="about__eyebrow about__eyebrow--amber">04 / PHƯƠNG PHÁP TRONG THỰC HÀNH</p>
            <h2 id="workflow-title">Đi từ một tài liệu đến bước tiếp theo có thể bảo vệ được.</h2>
          </div>
          <div className="about__before-after">
            <article>
              <p>Trước</p>
              <h3>Nguồn, nhận định và kết luận đứng tách rời.</h3>
              <span>Khó xem lại, giải thích hoặc quay về khi cần sửa đổi.</span>
            </article>
            <article>
              <p>Sau</p>
              <h3>Mỗi kết luận mang theo một đường dẫn về tài liệu và câu hỏi.</h3>
              <span>Được thiết kế để xem xét, thảo luận và điều chỉnh.</span>
            </article>
          </div>
          <ol className="about__steps">
            {workflow.map(([number, title, description]) => (
              <li key={number}>
                <span>{number}</span>
                <h3>{title}</h3>
                <p>{description}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="about__manifesto" aria-labelledby="manifesto-title">
          <div className="about__frame">
            <p className="about__eyebrow">05 / TUYÊN NGÔN</p>
            <h2 id="manifesto-title">Làm cho bằng chứng dễ đọc. Giữ cho bất đồng có ích.</h2>
            <p>
              Chúng tôi ưu tiên một liên kết nguồn hơn một khẳng định không căn cứ, một giới hạn
              được nói rõ hơn sự chắc chắn giả tạo, và một lập luận có thể sửa đổi hơn một câu trả
              lời bóng bẩy nhưng không thể kiểm tra. Kết luận cuối cùng thuộc về con người và phải
              qua đánh giá của con người.
            </p>
          </div>
        </section>

        <section
          className="about__tools about__frame"
          id="tools"
          tabIndex={-1}
          aria-labelledby="tools-title"
        >
          <div className="about__section-heading">
            <p className="about__eyebrow about__eyebrow--amber">06 / KHÔNG GIAN LÀM VIỆC</p>
            <h2 id="tools-title">Ba nơi kết nối để làm công việc này.</h2>
          </div>
          <div className="about__tool-grid">
            <article>
              <p>Scanner</p>
              <h3>Biến tài liệu thành chất liệu có thể xem xét.</h3>
              <span>Bắt đầu phân tích tài liệu và giữ đường dẫn quay về chất liệu gốc.</span>
              <Link to="/scanner/new">Mở Scanner</Link>
            </article>
            <article>
              <p>Copilot</p>
              <h3>Đặt câu hỏi khi nguồn vẫn ở trong tầm nhìn.</h3>
              <span>
                Dùng không gian làm việc có căn cứ nguồn để phát triển và kiểm tra diễn giải.
              </span>
              <Link to="/copilot">Mở Copilot</Link>
            </article>
            <article>
              <p>Capital Arena</p>
              <h3>Thử độ vững của một lập trường qua tranh luận cấu trúc.</h3>
              <span>Đưa lập luận vào một môi trường dành cho chất vấn và điều chỉnh.</span>
              <Link to="/arena">Vào Capital Arena</Link>
            </article>
          </div>
        </section>

        <section className="about__outcomes about__frame" aria-labelledby="outcomes-title">
          <div>
            <p className="about__eyebrow">07 / ĐIỀU CHÚNG TÔI THEO ĐUỔI</p>
            <h2 id="outcomes-title">Những kết quả định tính đáng được nhận ra.</h2>
          </div>
          <ul>
            <li>Sinh viên có thể chỉ về chất liệu đứng sau một nhận định.</li>
            <li>Câu hỏi và bất định vẫn gắn với kết luận đang hình thành.</li>
            <li>Cộng tác để lại bản ghi có thể đọc được về cách một lập luận thay đổi.</li>
          </ul>
        </section>

        <section className="about__team about__frame" aria-labelledby="team-title">
          <div className="about__section-heading">
            <p className="about__eyebrow about__eyebrow--amber">08 / CON NGƯỜI</p>
            <h2 id="team-title">Nhóm thực hiện dự án.</h2>
          </div>
          <div className="about__team-grid">
            <article>
              <p>Trưởng nhóm</p>
              <h3>Nguyễn Ngọc Thành HE186491</h3>
            </article>
            <ul aria-label="Thành viên dự án">
              {team.map((member) => (
                <li key={member}>{member}</li>
              ))}
              <li>Các thành viên và cộng tác viên khác</li>
            </ul>
          </div>
        </section>

        <section className="about__protocol about__frame" aria-labelledby="protocol-title">
          <div>
            <p className="about__eyebrow">09 / GIAO THỨC BẰNG CHỨNG</p>
            <h2 id="protocol-title">Một nhận định chỉ hữu ích khi có đường dẫn đi cùng.</h2>
          </div>
          <ol>
            {protocol.map(([title, description]) => (
              <li key={title}>
                <strong>{title}</strong>
                <span>{description}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="about__future about__frame" aria-labelledby="future-title">
          <p className="about__eyebrow about__eyebrow--amber">
            10 / HƯỚNG ĐI, KHÔNG PHẢI KHẢ NĂNG HIỆN TẠI
          </p>
          <h2 id="future-title">Hướng phát triển (không phải khả năng hiện tại)</h2>
          <p>
            Nhóm dự định tiếp tục cải thiện quy trình xem xét, làm việc cùng bằng chứng và độ rõ
            ràng của nguồn gốc tài liệu. Đây là hướng phát triển trong tương lai, không phải cam kết
            về chức năng đang có hôm nay.
          </p>
        </section>

        <section className="about__cta about__frame" aria-labelledby="cta-title">
          <h2 id="cta-title">Bắt đầu với bằng chứng đang ở trước mắt bạn.</h2>
          <Link className="about__button about__button--amber" to="/scanner/new">
            Mở Scanner
          </Link>
        </section>
      </main>

      <footer className="about__footer about__frame">
        <div>
          <BrandMark />
          <p>MarxMatrix / dự án sinh viên / học tập cùng bằng chứng.</p>
        </div>
        <nav aria-label="Product">
          <strong>Product</strong>
          <Link to="/scanner/new">Scanner</Link>
          <Link to="/copilot">Copilot</Link>
          <Link to="/arena">Capital Arena</Link>
        </nav>
        <nav id="resources" tabIndex={-1} aria-label="Resources">
          <strong>Resources</strong>
          <Link to="/#method">Phương pháp</Link>
          <Link to="/#tools">Công cụ</Link>
          <Link to="/about" aria-current="page">
            Giới thiệu
          </Link>
        </nav>
        <nav aria-label="Legal">
          <strong>Legal</strong>
          <Link to="/#privacy">Quyền riêng tư</Link>
          <Link to="/#privacy">Điều khoản sử dụng</Link>
          <Link to="/#privacy">Giới hạn</Link>
        </nav>
      </footer>
    </div>
  );
}
