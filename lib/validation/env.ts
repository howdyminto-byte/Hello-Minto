/** Validate required runtime configuration without logging secret values. */
export function assertCoreEnvironment(): void {
  const missing = ['DATABASE_URL', 'AUTH_SECRET'].filter((key) => !process.env[key]);
  if (missing.length) throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  if ((process.env.AUTH_SECRET ?? '').length < 32) {
    throw new Error('AUTH_SECRET must contain at least 32 characters.');
  }
}
