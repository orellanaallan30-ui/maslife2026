import { createHmac, timingSafeEqual } from 'crypto';

// Token del panel admin (HMAC-SHA256, 8 h). Se firma con la SERVICE_ROLE_KEY
// (siempre configurada) o ADMIN_JWT_SECRET. Compartido entre admin-auth y la
// tienda (modo prueba del checkout).

export const adminTokenSecret = (): string => process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.ADMIN_JWT_SECRET || '';

export function createAdminToken(secret: string): string {
  const exp = Date.now() + 8 * 60 * 60 * 1000;
  const payload = Buffer.from(JSON.stringify({ role: 'admin', exp })).toString('base64url');
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyAdminToken(token: string, secret: string): boolean {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return false;
    const [payload, sig] = parts;
    const expectedSig = createHmac('sha256', secret).update(payload).digest('base64url');
    const sigBuf = Buffer.from(sig, 'base64url');
    const expectedBuf = Buffer.from(expectedSig, 'base64url');
    if (sigBuf.length !== expectedBuf.length) return false;
    if (!timingSafeEqual(sigBuf, expectedBuf)) return false;
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'));
    if (parsed.role !== 'admin') return false;
    if (parsed.exp < Date.now()) return false;
    return true;
  } catch {
    return false;
  }
}

/** ¿La cabecera Authorization trae un token admin válido? */
export function esAdminAutorizado(authorization: unknown): boolean {
  const secret = adminTokenSecret();
  if (!secret || typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) return false;
  return verifyAdminToken(authorization.slice(7), secret);
}
