const fallbackPath = '/dashboard';
const applicationOrigin = 'https://marxmatrix.invalid';

export function getSafeReturnPath(state: unknown): string {
  if (typeof state !== 'object' || state === null || !('from' in state)) return fallbackPath;
  const from = state.from;
  if (
    typeof from !== 'string' ||
    !from.startsWith('/') ||
    from.startsWith('//') ||
    from.trim() !== from ||
    Array.from(from).some((character) => character.charCodeAt(0) < 32)
  ) {
    return fallbackPath;
  }
  try {
    return new URL(from, applicationOrigin).origin === applicationOrigin ? from : fallbackPath;
  } catch {
    return fallbackPath;
  }
}
