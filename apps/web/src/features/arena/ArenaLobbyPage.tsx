import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ApiError } from '../../shared/api/api-error.js';
import { PageState } from '../../shared/ui/PageState.js';
import { useSessionStore } from '../auth/session.js';
import { arenaApi, type ArenaPlayer, type ArenaRoom } from './arena.api.js';
import { arenaRealtime } from './arena-realtime.js';
import './ArenaLobbyPage.css';

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Không thể cập nhật lobby. Vui lòng thử lại.';
}

function players(room: ArenaRoom): ArenaPlayer[] {
  if (room.players?.length) return room.players;
  return room.playerIds.map((id) => ({
    id,
    displayName: `ID ${id}`,
    isBot: false,
    ready: room.readyPlayerIds.includes(id)
  }));
}

export function ArenaLobbyPage() {
  const { code = '' } = useParams();
  const normalizedCode = code.toUpperCase();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const userId = useSessionStore((state) => state.user?.id);
  const accessToken = useSessionStore((state) => state.accessToken);
  const [notice, setNotice] = useState<string | null>(null);
  const room = useQuery({
    queryKey: ['arena-room', normalizedCode],
    queryFn: () => arenaApi.get(normalizedCode),
    enabled: Boolean(normalizedCode),
    retry: false
  });

  function applyRoom(nextRoom: ArenaRoom) {
    queryClient.setQueryData(['arena-room', normalizedCode], nextRoom);
  }
  useEffect(() => {
    if (!room.data || !accessToken) return;
    return arenaRealtime.connectRoom({
      code: normalizedCode,
      accessToken,
      expectedStateVersion: 0,
      onRoom: applyRoom,
      onError: (error) => setNotice(error.message)
    });
  }, [accessToken, normalizedCode, queryClient, room.data?.id]);
  function handleError(error: unknown) {
    if (error instanceof ApiError && error.code === 'STALE_STATE_VERSION') {
      setNotice(
        'Lobby vừa thay đổi. Dữ liệu mới đã được tải lại; hãy kiểm tra trước khi tiếp tục.'
      );
      void room.refetch();
      return;
    }
    setNotice(errorMessage(error));
  }

  const ready = useMutation({
    mutationFn: (current: ArenaRoom) => arenaApi.ready(normalizedCode, current.stateVersion),
    onSuccess: (next) => {
      applyRoom(next);
      setNotice('Bạn đã sẵn sàng.');
    },
    onError: handleError
  });
  const demoBot = useMutation({
    mutationFn: () => arenaApi.addDemoBot(normalizedCode),
    onSuccess: (next) => {
      applyRoom(next);
      setNotice('Đã thêm người chơi mẫu.');
    },
    onError: handleError
  });
  const leave = useMutation({
    mutationFn: () => arenaApi.leave(normalizedCode),
    onSuccess: () => navigate('/arena'),
    onError: handleError
  });
  const start = useMutation({
    mutationFn: (current: ArenaRoom) => arenaApi.start(normalizedCode, current.stateVersion),
    onSuccess: (game) => navigate(`/arena/games/${game.id}`),
    onError: handleError
  });

  if (room.isLoading)
    return (
      <PageState>
        <p>Đang tải lobby…</p>
      </PageState>
    );
  if (room.isError)
    return (
      <PageState>
        <p>Không thể tải lobby này.</p>
        <button onClick={() => void room.refetch()}>Thử lại</button>
      </PageState>
    );
  if (!room.data) return null;

  const current = room.data;
  const roomPlayers = players(current);
  const isHost = current.hostId === userId;
  const currentPlayer = roomPlayers.find((player) => player.id === userId);
  const allReady =
    roomPlayers.length >= (current.config.minPlayers ?? 1) &&
    roomPlayers.every((player) => player.ready);
  const isBusy = ready.isPending || demoBot.isPending || leave.isPending || start.isPending;

  async function copyCode() {
    try {
      await navigator.clipboard?.writeText(current.code);
      setNotice('Đã sao chép mã phòng.');
    } catch {
      setNotice('Không thể sao chép tự động; hãy sao chép mã phòng thủ công.');
    }
  }

  return (
    <section className="arena-lobby" data-screen="arena-12" aria-labelledby="arena-lobby-title">
      <header className="arena-lobby__header">
        <p className="arena-lobby__eyebrow">CAPITAL ARENA / LOBBY</p>
        <h1 id="arena-lobby-title">PHÒNG #{current.code}</h1>
        <p>
          Chờ đủ người chơi sẵn sàng trước khi bắt đầu. Mọi thay đổi được kiểm tra theo phiên bản
          lobby hiện tại.
        </p>
        <div className="arena-lobby__code">
          <span>MÃ PHÒNG</span>
          <strong>{current.code}</strong>
          <button type="button" onClick={() => void copyCode()}>
            Sao chép mã
          </button>
        </div>
      </header>

      {notice && (
        <p className="arena-lobby__notice" role="status">
          {notice}
        </p>
      )}

      <div className="arena-lobby__grid">
        <section aria-labelledby="arena-players-title">
          <p className="arena-lobby__index">01 / NGƯỜI CHƠI</p>
          <h2 id="arena-players-title">
            {roomPlayers.length} / {current.config.maxPlayers ?? '—'} vị trí
          </h2>
          <ol className="arena-lobby__players">
            {roomPlayers.map((player) => (
              <li key={player.id}>
                <span>{player.displayName}</span>
                <small>
                  {player.isBot ? 'MẪU' : player.id === current.hostId ? 'HOST' : 'NGƯỜI CHƠI'}
                </small>
                <strong>{player.ready ? 'Sẵn sàng' : 'Chưa sẵn sàng'}</strong>
              </li>
            ))}
          </ol>
        </section>

        <aside className="arena-lobby__controls" aria-label="Điều khiển lobby">
          <p className="arena-lobby__index">02 / THIẾT LẬP</p>
          <dl>
            <div>
              <dt>VÒNG TỐI ĐA</dt>
              <dd>{current.config.maxRounds ?? '—'}</dd>
            </div>
            <div>
              <dt>THỜI HẠN QUYẾT ĐỊNH</dt>
              <dd>
                {current.config.decisionDeadlineMs
                  ? `${Math.round(current.config.decisionDeadlineMs / 1000)} giây`
                  : '—'}
              </dd>
            </div>
            <div>
              <dt>PHIÊN BẢN</dt>
              <dd>{current.stateVersion}</dd>
            </div>
          </dl>
          {current.phase === 'started' ? (
            <Link to="/arena">Phiên đã bắt đầu — trở về Arena</Link>
          ) : (
            <>
              {currentPlayer && !currentPlayer.ready && (
                <button type="button" disabled={isBusy} onClick={() => ready.mutate(current)}>
                  Sẵn sàng
                </button>
              )}
              <button
                className="arena-lobby__secondary"
                type="button"
                disabled={isBusy}
                onClick={() => leave.mutate()}
              >
                Rời phòng
              </button>
              {isHost && (
                <>
                  <button
                    type="button"
                    disabled={
                      isBusy || roomPlayers.length >= (current.config.maxPlayers ?? Infinity)
                    }
                    onClick={() => demoBot.mutate()}
                  >
                    Thêm người chơi mẫu
                  </button>
                  <button
                    type="button"
                    disabled={isBusy || !allReady}
                    onClick={() => start.mutate(current)}
                  >
                    Bắt đầu phiên
                  </button>
                  {!allReady && (
                    <p className="arena-lobby__hint">
                      Cần đủ số người chơi tối thiểu và tất cả đều sẵn sàng.
                    </p>
                  )}
                </>
              )}
            </>
          )}
        </aside>
      </div>
    </section>
  );
}
