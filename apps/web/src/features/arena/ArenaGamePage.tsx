import type { ArenaDecisionCore, GameEvent, GameSnapshot } from '@marxmatrix/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { PageState } from '../../shared/ui/PageState.js';
import { useSessionStore } from '../auth/session.js';
import { arenaApi } from './arena.api.js';
import {
  appendArenaEvent,
  arenaPhaseLabel,
  eventTypeLabel,
  remainingDecisionSeconds
} from './arena-game-state.js';
import { arenaRealtime } from './arena-realtime.js';
import './ArenaGame.css';

type DecisionDraft = Pick<
  ArenaDecisionCore,
  | 'hiringChange'
  | 'wageAdjustment'
  | 'automationInvestment'
  | 'price'
  | 'qualityMarketingInvestment'
  | 'inventoryTarget'
>;

const emptyDecision: DecisionDraft = {
  hiringChange: 0,
  wageAdjustment: 0,
  automationInvestment: 0,
  price: 20,
  qualityMarketingInvestment: 0,
  inventoryTarget: 0
};

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'Không thể cập nhật phiên Arena.';
}

export function ArenaGamePage() {
  const { id = '' } = useParams();
  const queryClient = useQueryClient();
  const accessToken = useSessionStore((state) => state.accessToken);
  const userId = useSessionStore((state) => state.user?.id);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [draft, setDraft] = useState<DecisionDraft>(emptyDecision);
  const [notice, setNotice] = useState<string | null>(null);
  const [connection, setConnection] = useState<'connecting' | 'connected' | 'disconnected'>(
    'connecting'
  );
  const [now, setNow] = useState(() => new Date());

  const game = useQuery({
    queryKey: ['arena-game', id],
    queryFn: () => arenaApi.getGame(id),
    enabled: Boolean(id),
    retry: false,
    refetchInterval: (query) => {
      const phase = query.state.data?.phase;
      return phase === 'countdown' || phase === 'decision_open' ? 1_000 : false;
    }
  });
  const history = useQuery({
    queryKey: ['arena-game-events', id],
    queryFn: () => arenaApi.events(id, 0),
    enabled: Boolean(game.data),
    retry: false
  });

  useEffect(() => {
    if (history.data) setEvents(history.data);
  }, [history.data]);

  useEffect(() => {
    const snapshot = game.data;
    if (!snapshot || !accessToken) return;
    return arenaRealtime.connect({
      gameId: snapshot.id,
      accessToken,
      lastSequence: snapshot.eventSequence,
      expectedStateVersion: snapshot.stateVersion,
      onStatus: setConnection,
      onSnapshot: (next) => queryClient.setQueryData(['arena-game', id], next),
      onEvent: (event) => setEvents((current) => appendArenaEvent(current, event)),
      onError: (error) => setNotice(error.message)
    });
  }, [accessToken, game.data, id, queryClient]);

  useEffect(() => {
    if (!game.data?.deadlineAt) return;
    const interval = globalThis.setInterval(() => setNow(new Date()), 1000);
    return () => globalThis.clearInterval(interval);
  }, [game.data?.deadlineAt]);

  useEffect(() => {
    const company = game.data?.companies.find((candidate) => candidate.playerId === userId);
    if (!company) return;
    setDraft({
      hiringChange: 0,
      wageAdjustment: 0,
      automationInvestment: 0,
      price: company.price,
      qualityMarketingInvestment: 0,
      inventoryTarget: company.inventory
    });
  }, [game.data?.round, game.data?.companies, userId]);

  const decision = useMutation({
    mutationFn: (snapshot: GameSnapshot) =>
      arenaApi.decision(snapshot.id, {
        round: snapshot.round,
        expectedStateVersion: snapshot.stateVersion,
        ...draft
      }),
    onSuccess: (next) => {
      queryClient.setQueryData(['arena-game', id], next);
      setNotice('Đã ghi nhận quyết định cho vòng hiện tại.');
    },
    onError: (error) => setNotice(message(error))
  });

  const countdown = useMemo(
    () => remainingDecisionSeconds(game.data?.deadlineAt ?? null, now),
    [game.data?.deadlineAt, now]
  );

  if (game.isLoading)
    return (
      <PageState>
        <p>Đang đồng bộ phiên Arena…</p>
      </PageState>
    );
  if (game.isError)
    return (
      <PageState>
        <p>{message(game.error)}</p>
        <button onClick={() => void game.refetch()}>Thử lại</button>
      </PageState>
    );
  if (!game.data) return null;

  const snapshot = game.data;
  const company =
    snapshot.companies.find((candidate) => candidate.playerId === userId) ?? snapshot.companies[0];
  const canDecide = snapshot.phase === 'decision_open' && company && !company.bankrupt;

  return (
    <section className="arena-game" data-screen="arena-13" aria-labelledby="arena-game-title">
      <header className="arena-game__header">
        <div>
          <p className="arena-game__eyebrow">CAPITAL ARENA / LIVE SESSION</p>
          <h1 id="arena-game-title">Vòng {snapshot.round}</h1>
          <p>
            {arenaPhaseLabel(snapshot.phase)} · phiên bản {snapshot.stateVersion}
          </p>
        </div>
        <div
          className={`arena-game__connection arena-game__connection--${connection}`}
          role="status"
        >
          {connection === 'connected'
            ? 'Realtime đã kết nối'
            : connection === 'connecting'
              ? 'Đang kết nối realtime…'
              : 'Mất kết nối thời gian thực — REST vẫn là đường phục hồi'}
        </div>
        {countdown !== null && <strong className="arena-game__timer">{countdown}s</strong>}
      </header>

      {notice && (
        <p className="arena-game__notice" role="status">
          {notice}
        </p>
      )}

      <div className="arena-game__layout">
        <main>
          {company && (
            <section className="arena-game__market" aria-labelledby="market-pulse-title">
              <div className="arena-game__section-heading">
                <span>01</span>
                <h2 id="market-pulse-title">Market pulse</h2>
              </div>
              <div className="arena-game__metric-grid">
                <Metric label="Tiền mặt" value={company.cash.toLocaleString('vi-VN')} />
                <Metric label="Thị phần" value={`${Math.round(company.marketShare * 100)}%`} />
                <Metric
                  label="Giá trị thặng dư"
                  value={company.surplusValue.toLocaleString('vi-VN')}
                />
                <Metric label="Tồn kho" value={company.inventory.toLocaleString('vi-VN')} />
              </div>
            </section>
          )}
          <section className="arena-game__companies" aria-labelledby="companies-title">
            <div className="arena-game__section-heading">
              <span>01</span>
              <h2 id="companies-title">Doanh nghiệp trong phiên</h2>
            </div>
            <div className="arena-game__table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Doanh nghiệp</th>
                    <th>Tiền mặt</th>
                    <th>Lao động</th>
                    <th>Giá</th>
                    <th>Thị phần</th>
                    <th>m</th>
                    <th>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.companies.map((item) => (
                    <tr key={item.playerId}>
                      <th>{item.name}</th>
                      <td>{item.cash.toLocaleString('vi-VN')}</td>
                      <td>{item.workers}</td>
                      <td>{item.price.toLocaleString('vi-VN')}</td>
                      <td>{Math.round(item.marketShare * 100)}%</td>
                      <td>{item.surplusValue.toLocaleString('vi-VN')}</td>
                      <td>{item.bankrupt ? 'Phá sản' : 'Đang hoạt động'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {snapshot.phase === 'game_over' ? (
            <section className="arena-game__finished">
              <h2>Phiên đã kết thúc</h2>
              <p>Kết quả cuối chỉ được hiển thị từ snapshot game_over.</p>
              <Link to={`/arena/games/${snapshot.id}/results`}>Xem kết quả phiên</Link>
            </section>
          ) : (
            <form
              className="arena-game__decision"
              aria-label="Decision console"
              onSubmit={(event) => {
                event.preventDefault();
                if (canDecide) decision.mutate(snapshot);
              }}
            >
              <div className="arena-game__section-heading">
                <span>02</span>
                <h2>Quyết định vòng {snapshot.round}</h2>
              </div>
              <div className="arena-game__fields">
                <NumberField
                  label="Thay đổi tuyển dụng"
                  value={draft.hiringChange}
                  min={snapshot.config.minimumHiringChange}
                  max={snapshot.config.maximumHiringChange}
                  onChange={(value) => setDraft((current) => ({ ...current, hiringChange: value }))}
                />
                <NumberField
                  label="Điều chỉnh lương"
                  value={draft.wageAdjustment}
                  step={0.01}
                  min={-1}
                  max={1}
                  onChange={(value) =>
                    setDraft((current) => ({ ...current, wageAdjustment: value }))
                  }
                />
                <NumberField
                  label="Đầu tư tự động hóa"
                  value={draft.automationInvestment}
                  min={0}
                  max={snapshot.config.maximumAutomationInvestment}
                  onChange={(value) =>
                    setDraft((current) => ({ ...current, automationInvestment: value }))
                  }
                />
                <NumberField
                  label="Giá bán"
                  value={draft.price}
                  min={snapshot.config.minimumPrice}
                  max={snapshot.config.maximumPrice}
                  onChange={(value) => setDraft((current) => ({ ...current, price: value }))}
                />
                <NumberField
                  label="Đầu tư chất lượng/marketing"
                  value={draft.qualityMarketingInvestment}
                  min={0}
                  max={snapshot.config.maximumQualityMarketingInvestment}
                  onChange={(value) =>
                    setDraft((current) => ({ ...current, qualityMarketingInvestment: value }))
                  }
                />
                <NumberField
                  label="Mục tiêu tồn kho"
                  value={draft.inventoryTarget}
                  min={0}
                  max={snapshot.config.maximumInventoryTarget}
                  onChange={(value) =>
                    setDraft((current) => ({ ...current, inventoryTarget: value }))
                  }
                />
              </div>
              <button type="submit" disabled={!canDecide || decision.isPending}>
                {decision.isPending ? 'Đang gửi…' : 'Gửi quyết định'}
              </button>
              {!canDecide && (
                <p>
                  Quyết định chỉ mở trong pha nhận quyết định và với doanh nghiệp còn hoạt động.
                </p>
              )}
            </form>
          )}
        </main>

        <aside className="arena-game__events" aria-labelledby="events-title">
          <div className="arena-game__section-heading">
            <span>03</span>
            <h2 id="events-title">Nhật ký sự kiện</h2>
          </div>
          {history.isLoading && <p>Đang tải lịch sử…</p>}
          {events.length === 0 ? (
            <p>Chưa có sự kiện được ghi nhận.</p>
          ) : (
            <ol>
              {events.map((event) => (
                <li key={`${event.gameId}-${event.sequence}`}>
                  <strong>{String(event.sequence).padStart(2, '0')}</strong>
                  <span>{eventTypeLabel(event.type)}</span>
                  <small>Vòng {event.round}</small>
                </li>
              ))}
            </ol>
          )}
          <Link to={`/arena/games/${snapshot.id}/replay`}>Mở replay có thứ tự</Link>
        </aside>
      </div>
    </section>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
}) {
  return (
    <label>
      <span>{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(event.currentTarget.valueAsNumber)}
      />
    </label>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <dl className="arena-game__metric">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </dl>
  );
}
