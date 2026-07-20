import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { PageState } from '../../shared/ui/PageState.js';
import { arenaApi } from './arena.api.js';
import './ArenaGame.css';

export function ArenaResultsPage() {
  const { id = '' } = useParams();
  const game = useQuery({
    queryKey: ['arena-game', id],
    queryFn: () => arenaApi.getGame(id),
    enabled: Boolean(id),
    retry: false
  });
  if (game.isLoading)
    return (
      <PageState>
        <p>Đang tải kết quả xác thực…</p>
      </PageState>
    );
  if (game.isError)
    return (
      <PageState>
        <p>Không thể tải kết quả phiên.</p>
        <button onClick={() => void game.refetch()}>Thử lại</button>
      </PageState>
    );
  if (!game.data) return null;
  if (game.data.phase !== 'game_over')
    return (
      <PageState>
        <h1>Phiên chưa kết thúc</h1>
        <p>Chỉ snapshot game_over mới có thể tạo bảng xếp hạng cuối.</p>
        <Link to={`/arena/games/${id}`}>Trở lại phiên trực tiếp</Link>
      </PageState>
    );

  const ranking = [...game.data.companies].sort(
    (left, right) =>
      Number(left.bankrupt) - Number(right.bankrupt) ||
      right.cash + right.surplusValue - (left.cash + left.surplusValue)
  );
  return (
    <section className="arena-results" data-screen="arena-14" aria-labelledby="arena-results-title">
      <header>
        <p>CAPITAL ARENA / FINAL SNAPSHOT</p>
        <h1 id="arena-results-title">Kết quả phiên</h1>
        <span>
          Vòng {game.data.round} · phiên bản {game.data.stateVersion}
        </span>
      </header>
      <section className="arena-results__podium" aria-labelledby="arena-podium-title">
        <div className="arena-results__section-kicker">FINAL ORDER</div>
        <h2 id="arena-podium-title">Podium</h2>
        <div className="arena-results__podium-grid">
          {ranking.slice(0, 3).map((company, index) => (
            <article
              key={company.playerId}
              className={`arena-results__podium-card arena-results__podium-card--${index + 1}`}
            >
              <span>0{index + 1}</span>
              <h3>{company.name}</h3>
              <p>{(company.cash + company.surplusValue).toLocaleString('vi-VN')}</p>
            </article>
          ))}
        </div>
      </section>
      <ol>
        {ranking.map((company, index) => (
          <li key={company.playerId}>
            <strong>{String(index + 1).padStart(2, '0')}</strong>
            <div>
              <h2>{company.name}</h2>
              <p>{company.bankrupt ? 'Đã phá sản' : 'Hoàn tất phiên'}</p>
            </div>
            <dl>
              <div>
                <dt>Tiền mặt</dt>
                <dd>{company.cash.toLocaleString('vi-VN')}</dd>
              </div>
              <div>
                <dt>Giá trị thặng dư</dt>
                <dd>{company.surplusValue.toLocaleString('vi-VN')}</dd>
              </div>
              <div>
                <dt>Thị phần</dt>
                <dd>{Math.round(company.marketShare * 100)}%</dd>
              </div>
              <div>
                <dt>Lao động</dt>
                <dd>{company.workers}</dd>
              </div>
            </dl>
          </li>
        ))}
      </ol>
      <section className="arena-results__debrief" aria-labelledby="arena-debrief-title">
        <div>
          <p className="arena-results__section-kicker">EVIDENCE / LEARNING</p>
          <h2 id="arena-debrief-title">Learning debrief</h2>
        </div>
        <p>
          Đối chiếu tiền mặt, thị phần và giá trị thặng dư để truy nguyên hệ quả của từng quyết
          định. Replay giữ lại chuỗi bằng chứng theo thứ tự sự kiện.
        </p>
      </section>
      <nav>
        <Link to={`/arena/games/${id}/replay`}>Xem replay kiểm chứng</Link>
        <Link to="/arena">Trở lại Capital Arena</Link>
      </nav>
    </section>
  );
}
