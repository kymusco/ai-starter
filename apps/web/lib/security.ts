export const AGENT_URL = process.env.AGENT_URL || 'http://localhost:4111';

/**
 * A chamada veio de uma página deste mesmo endereço? O widget passa: ele roda em
 * /embed, servido por este app. Isto barra OUTRO SITE no navegador. Um script fora
 * do navegador forja o cabeçalho: contra ele, quem protege o custo é o limite de uso.
 */
export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return false;
  const host = (req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? '').split(',')[0].trim().toLowerCase();
  try {
    return !!host && new URL(origin).host.toLowerCase() === host;
  } catch {
    return false;
  }
}

/** O IP de quem chamou, como o proxy da frente repassa. */
export function clientIp(req: Request): string {
  const h = req.headers;
  return h.get('cf-connecting-ip') ?? h.get('x-real-ip') ?? h.get('x-forwarded-for')?.split(',')[0].trim() ?? 'desconhecido';
}
