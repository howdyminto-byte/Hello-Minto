export const ROLE = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  MODERATOR: 'MODERATOR',
  BLOG_EDITOR: 'BLOG_EDITOR',
  BUSINESS_OWNER: 'BUSINESS_OWNER',
} as const;

export type RoleKey = (typeof ROLE)[keyof typeof ROLE];
export type Permission =
  | 'admin:access'
  | 'users:manage'
  | 'listings:read:any'
  | 'listings:moderate'
  | 'listings:write:own'
  | 'billing:manage:own'
  | 'posts:read'
  | 'posts:write'
  | 'posts:publish'
  | 'seo:manage'
  | 'migration:run'
  | 'audit:read';

const grants: Record<RoleKey, readonly Permission[]> = {
  SUPER_ADMIN: [
    'admin:access', 'users:manage', 'listings:read:any', 'listings:moderate',
    'listings:write:own', 'billing:manage:own', 'posts:read', 'posts:write',
    'posts:publish', 'seo:manage', 'migration:run', 'audit:read',
  ],
  MODERATOR: ['admin:access', 'listings:read:any', 'listings:moderate', 'posts:read'],
  BLOG_EDITOR: ['admin:access', 'posts:read', 'posts:write', 'seo:manage'],
  BUSINESS_OWNER: ['listings:write:own', 'billing:manage:own'],
};

export function hasPermission(roles: readonly string[], permission: Permission): boolean {
  return roles.some((role) => role in grants && grants[role as RoleKey].includes(permission));
}

/** Call after authentication and before every protected server-side operation. */
export function assertPermission(roles: readonly string[], permission: Permission): void {
  if (!hasPermission(roles, permission)) {
    const error = new Error('Forbidden');
    error.name = 'ForbiddenError';
    throw error;
  }
}

/** Organization/resource ownership must be checked separately from role permission. */
export function canAccessOrganization(
  roles: readonly string[],
  memberships: readonly { organizationId: string }[],
  organizationId: string,
): boolean {
  if (roles.includes(ROLE.SUPER_ADMIN)) return true;
  return memberships.some((membership) => membership.organizationId === organizationId);
}
