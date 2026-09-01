export function parseExpiresIn(value: string): number {
  const match = value.match(/^(\d+)([smhd])$/);
  if (!match) return 7 * 86400000;
  const num = parseInt(match[1], 10);
  switch (match[2]) {
    case 's':
      return num * 1000;
    case 'm':
      return num * 60000;
    case 'h':
      return num * 3600000;
    case 'd':
      return num * 86400000;
    default:
      return 7 * 86400000;
  }
}

export function accessTokenLifetimeMs(): number {
  return parseExpiresIn(process.env.JWT_ACCESS_EXPIRES_IN || '1h');
}

export function sessionLifetimeMs(): number {
  return parseExpiresIn(process.env.JWT_REFRESH_EXPIRES_IN || '7d');
}