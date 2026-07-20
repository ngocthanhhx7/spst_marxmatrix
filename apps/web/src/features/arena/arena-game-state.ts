import type { GameEvent } from '@marxmatrix/contracts';

export function orderedArenaEvents(events: readonly GameEvent[]): GameEvent[] {
  return [...events].sort((left, right) => left.sequence - right.sequence);
}

export function appendArenaEvent(events: readonly GameEvent[], next: GameEvent): GameEvent[] {
  if (events.some((event) => event.sequence === next.sequence)) return [...events];
  return orderedArenaEvents([...events, next]);
}

export function remainingDecisionSeconds(
  deadlineAt: string | null,
  now = new Date()
): number | null {
  if (deadlineAt === null) return null;
  return Math.max(0, Math.ceil((new Date(deadlineAt).getTime() - now.getTime()) / 1000));
}

export function arenaPhaseLabel(phase: string): string {
  const labels: Record<string, string> = {
    lobby: 'Phòng chờ',
    countdown: 'Chuẩn bị',
    decision_open: 'Đang nhận quyết định',
    decision_locked: 'Đã khóa quyết định',
    round_resolution: 'Đang xử lý vòng',
    crisis_event: 'Biến cố thị trường',
    round_result: 'Kết quả vòng',
    game_over: 'Phiên đã kết thúc'
  };
  return labels[phase] ?? phase.replaceAll('_', ' ');
}

export function eventTypeLabel(type: string): string {
  return type.replaceAll('_', ' ');
}
