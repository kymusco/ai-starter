import type { Context, Next } from 'hono';
import { isWebCaller } from '../auth';
import { limits } from '../config';
import { hit } from '../db/usage';

// Quem é o visitante e de onde vem: o web manda nestes cabeçalhos, junto com o token
// dele. Sem o token, o pedido é recusado pela auth e os cabeçalhos não valem nada.
export const VISITOR_HEADER = 'x-visitor-id';
export const CLIENT_IP_HEADER = 'x-client-ip';

function tooMany(c: Context, message: string) {
  return c.json({ error: message, code: 'rate_limited' }, 429);
}

/** Middleware do /chat: conta a mensagem e recusa quando passa de um dos limites. */
export async function rateLimit(c: Context, next: Next) {
  if (c.req.method !== 'POST' || !isWebCaller(c.req.header('authorization'))) return next();
  const visitor = c.req.header(VISITOR_HEADER) || 'anonimo';
  const ip = c.req.header(CLIENT_IP_HEADER) || 'desconhecido';

  try {
    // Ordem importa: o teto do dia vem por ÚLTIMO, para contar só mensagens que vão
    // de fato ao modelo. Se viesse antes, quem já está bloqueado seguiria gastando a
    // cota do dia e poderia esgotá-la para os outros visitantes.
    if ((await hit(`visitor:${visitor}`, 'hour')) > limits.perVisitorPerHour) {
      return tooMany(c, 'Você enviou muitas mensagens em pouco tempo. Tente de novo daqui a pouco.');
    }
    if ((await hit(`ip:${ip}`, 'hour')) > limits.perIpPerHour) {
      return tooMany(c, 'Muitas mensagens saindo da sua rede. Tente de novo daqui a pouco.');
    }
    if ((await hit('total', 'day')) > limits.totalPerDay) {
      return tooMany(c, 'O assistente atingiu o limite de atendimentos de hoje. Tente amanhã.');
    }
  } catch (e) {
    // Sem conseguir contar, não deixa passar: o limite existe para proteger o custo.
    console.error('limite de uso: não consegui contar', e instanceof Error ? e.message : e);
    return c.json({ error: 'O assistente está indisponível agora. Tente de novo em instantes.' }, 503);
  }
  return next();
}
