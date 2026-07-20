import { create } from 'zustand';
import type { PublicUser } from '@marxmatrix/contracts';
export interface SessionState {
  status: 'unknown' | 'authenticated' | 'unauthenticated';
  accessToken: string | undefined;
  user: PublicUser | undefined;
  setSession: (session: { accessToken: string; user: PublicUser }) => void;
  clearSession: () => void;
}
export const useSessionStore = create<SessionState>((set) => ({
  status: 'unknown',
  accessToken: undefined,
  user: undefined,
  setSession: (session) => set({ ...session, status: 'authenticated' }),
  clearSession: () => set({ accessToken: undefined, user: undefined, status: 'unauthenticated' })
}));
