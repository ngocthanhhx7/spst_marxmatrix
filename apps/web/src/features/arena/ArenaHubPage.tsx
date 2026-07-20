import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { arenaApi } from './arena.api.js';
import './ArenaHubPage.css';

type Panel = 'create' | 'join' | null;

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : 'Không thể hoàn tất yêu cầu. Vui lòng thử lại.';
}

function formText(values: FormData, key: string) {
  const value = values.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

export function ArenaHubPage() {
  const navigate = useNavigate();
  const [panel, setPanel] = useState<Panel>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function openPanel(nextPanel: Exclude<Panel, null>) {
    setNotice(null);
    setPanel(nextPanel);
  }

  async function createRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const displayName = formText(new FormData(event.currentTarget), 'displayName');
    if (!displayName) return;
    setSubmitting(true);
    setNotice(null);
    try {
      const room = await arenaApi.create({ displayName });
      void navigate(`/arena/lobby/${room.code}`);
    } catch (error) {
      setNotice(messageFrom(error));
    } finally {
      setSubmitting(false);
    }
  }

  async function joinRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const code = formText(values, 'roomCode').toUpperCase();
    const displayName = formText(values, 'displayName');
    if (!code || !displayName) return;
    setSubmitting(true);
    setNotice(null);
    try {
      const room = await arenaApi.join(code, { displayName });
      void navigate(`/arena/lobby/${room.code}`);
    } catch (error) {
      setNotice(messageFrom(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="arena-hub" data-screen="arena-11" aria-labelledby="arena-hub-title">
      <header className="arena-hub__masthead">
        <div>
          <p className="arena-hub__eyebrow">CAPITAL ARENA / QUYẾT ĐỊNH CÓ DẤU VẾT</p>
          <h1 id="arena-hub-title">Trung tâm Điều hành Capital Arena</h1>
          <p className="arena-hub__lead">
            Một thị trường mô phỏng chung để kiểm tra lựa chọn, nhìn rõ áp lực cạnh tranh và phát
            lại lập luận sau mỗi vòng.
          </p>
        </div>
        <aside className="arena-hub__protocol" aria-label="Giao thức Capital Arena">
          <span>PHÒNG ĐIỀU HÀNH / 03</span>
          <strong>Quyết định theo vòng, không theo trực giác.</strong>
          <p>Mọi quyết định đều lưu lại giả định, thời điểm và tác động lên c / v / m.</p>
        </aside>
      </header>

      <section className="arena-hub__actions" aria-label="Điều khiển Capital Arena">
        <div>
          <p className="arena-hub__index">01 / PHIÊN CỦA BẠN</p>
          <h2>Bắt đầu từ một phòng có quy tắc rõ ràng.</h2>
        </div>
        <div className="arena-hub__action-buttons">
          <button type="button" onClick={() => openPanel('create')}>
            Tạo phòng mới
          </button>
          <button
            className="arena-hub__secondary-button"
            type="button"
            onClick={() => openPanel('join')}
          >
            Tham gia bằng mã
          </button>
        </div>
      </section>

      {panel === 'create' && (
        <section className="arena-hub__panel" aria-labelledby="create-room-title">
          <div className="arena-hub__panel-heading">
            <p className="arena-hub__index">THIẾT LẬP / 01</p>
            <h2 id="create-room-title">Thiết lập phiên mô phỏng</h2>
            <p>
              Phiên mới được tạo trên máy chủ, rồi bạn sẽ được đưa đến lobby để mời người học khác.
            </p>
          </div>
          <form onSubmit={(event) => void createRoom(event)}>
            <label>
              Tên hiển thị
              <input name="displayName" autoComplete="name" required maxLength={100} />
            </label>
            <div className="arena-hub__panel-actions">
              <button type="submit" disabled={submitting}>
                {submitting ? 'Đang tạo…' : 'Tạo phòng riêng'}
              </button>
              <button
                className="arena-hub__text-button"
                type="button"
                onClick={() => setPanel(null)}
              >
                Hủy
              </button>
            </div>
          </form>
        </section>
      )}

      {panel === 'join' && (
        <section className="arena-hub__panel" aria-labelledby="join-room-title">
          <div className="arena-hub__panel-heading">
            <p className="arena-hub__index">KẾT NỐI / 02</p>
            <h2 id="join-room-title">Tham gia phòng</h2>
            <p>
              Nhập mã phòng và tên hiển thị. Quyền tham gia được máy chủ xác nhận trước khi mở
              lobby.
            </p>
          </div>
          <form onSubmit={(event) => void joinRoom(event)}>
            <label>
              Mã phòng
              <input
                name="roomCode"
                placeholder="Ví dụ: ABC123"
                autoCapitalize="characters"
                required
              />
            </label>
            <label>
              Tên hiển thị
              <input name="displayName" autoComplete="name" required maxLength={100} />
            </label>
            <div className="arena-hub__panel-actions">
              <button type="submit" disabled={submitting}>
                {submitting ? 'Đang vào…' : 'Vào phòng'}
              </button>
              <button
                className="arena-hub__text-button"
                type="button"
                onClick={() => setPanel(null)}
              >
                Hủy
              </button>
            </div>
          </form>
        </section>
      )}

      {notice && (
        <p className="arena-hub__notice" role="alert">
          {notice}
        </p>
      )}

      <section className="arena-hub__empty" aria-labelledby="arena-empty-title">
        <p className="arena-hub__index">02 / PHIÊN ĐÃ LƯU</p>
        <h2 id="arena-empty-title">Chưa có phiên Arena nào để hiển thị.</h2>
        <p>
          Tạo phòng mới hoặc tham gia bằng mã. Các phiên và phát lại chỉ xuất hiện khi dữ liệu đã
          được tạo trên máy chủ.
        </p>
      </section>
    </section>
  );
}
