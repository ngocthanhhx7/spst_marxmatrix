import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { PageState } from '../../shared/ui/PageState.js';
import { arenaApi } from './arena.api.js';
import { eventTypeLabel, orderedArenaEvents } from './arena-game-state.js';
import './ArenaGame.css';

export function ArenaReplayPage() {
  const { id = '' } = useParams();
  const replay = useQuery({
    queryKey: ['arena-replay', id],
    queryFn: () => arenaApi.replay(id),
    enabled: Boolean(id),
    retry: false
  });
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const events = useMemo(
    () => orderedArenaEvents(replay.data?.events ?? []),
    [replay.data?.events]
  );
  useEffect(() => {
    if (!playing || events.length < 2) return;
    const timer = globalThis.setInterval(
      () => setStep((current) => (current >= events.length - 1 ? 0 : current + 1)),
      1500
    );
    return () => globalThis.clearInterval(timer);
  }, [events.length, playing]);
  if (replay.isLoading)
    return (
      <PageState>
        <p>Đang dựng replay từ event log…</p>
      </PageState>
    );
  if (replay.isError)
    return (
      <PageState>
        <p>Không thể tải replay.</p>
        <button onClick={() => void replay.refetch()}>Thử lại</button>
      </PageState>
    );
  if (!replay.data) return null;
  const current = events[step];
  return (
    <section className="arena-replay" data-screen="arena-15" aria-labelledby="arena-replay-title">
      <header>
        <p>CAPITAL ARENA / DETERMINISTIC EVENT LOG</p>
        <h1 id="arena-replay-title">Replay phiên</h1>
        <span>
          {events.length} sự kiện · snapshot v{replay.data.game.stateVersion}
        </span>
      </header>
      {current ? (
        <>
          <div className="arena-replay__timeline">
            <label htmlFor="arena-replay-timeline">
              Replay timeline{' '}
              <span>
                {step + 1}/{events.length}
              </span>
            </label>
            <input
              id="arena-replay-timeline"
              type="range"
              min="0"
              max={events.length - 1}
              value={step}
              onChange={(event) => {
                setStep(Number(event.currentTarget.value));
                setPlaying(false);
              }}
            />
          </div>
          <div className="arena-replay__layout">
            <aside>
              <ol>
                {events.map((event, index) => (
                  <li
                    key={`${event.gameId}-${event.sequence}`}
                    className={index === step ? 'is-current' : undefined}
                  >
                    <button
                      onClick={() => {
                        setStep(index);
                        setPlaying(false);
                      }}
                    >
                      <strong>{String(event.sequence).padStart(2, '0')}</strong> ·{' '}
                      {eventTypeLabel(event.type)}
                    </button>
                  </li>
                ))}
              </ol>
            </aside>
            <main aria-live="polite">
              <p>SEQUENCE {String(current.sequence).padStart(2, '0')}</p>
              <h2>
                {String(current.sequence).padStart(2, '0')} · {eventTypeLabel(current.type)}
              </h2>
              <dl>
                <div>
                  <dt>Vòng</dt>
                  <dd>{current.round}</dd>
                </div>
                <div>
                  <dt>Thời điểm</dt>
                  <dd>{new Date(current.createdAt).toLocaleString('vi-VN')}</dd>
                </div>
                <div>
                  <dt>Người chơi</dt>
                  <dd>{current.playerId ?? 'Hệ thống'}</dd>
                </div>
              </dl>
              <pre>{JSON.stringify(current.payload, null, 2)}</pre>
            </main>
          </div>
        </>
      ) : (
        <PageState>
          <p>Phiên này chưa có event log để phát lại.</p>
        </PageState>
      )}
      <footer>
        <button
          onClick={() => setStep((currentStep) => Math.max(0, currentStep - 1))}
          disabled={step === 0}
        >
          Trước
        </button>
        <button onClick={() => setPlaying((value) => !value)} disabled={events.length < 2}>
          {playing ? 'Tạm dừng' : 'Phát'}
        </button>
        <button
          onClick={() => setStep((currentStep) => Math.min(events.length - 1, currentStep + 1))}
          disabled={step >= events.length - 1}
        >
          Tiếp
        </button>
        <Link to={`/arena/games/${id}/results`}>Kết quả cuối</Link>
      </footer>
    </section>
  );
}
