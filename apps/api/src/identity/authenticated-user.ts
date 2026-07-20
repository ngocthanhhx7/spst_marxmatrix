import type { Role } from '@marxmatrix/contracts';
export interface AuthenticatedUser {
  id: string;
  email: string;
  role: Role;
}
