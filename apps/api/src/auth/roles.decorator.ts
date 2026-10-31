import { SetMetadata } from '@nestjs/common';

export const ROLES = 'roles';

/** Restricts a controller or handler to users with the given role (only `admin` exists). */
export const Roles = (...roles: 'admin'[]) => SetMetadata(ROLES, roles);
