import { SetMetadata } from '@nestjs/common';
import type { Role } from '@marxmatrix/contracts';
export const ROLES_KEY = 'marxmatrix:roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
