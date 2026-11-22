import { pool } from './pool';

// Contador de mensagens por janela de tempo, no PostgreSQL: vale com várias réplicas
// e sobrevive a deploy (um contador em memória zeraria nos dois casos).

let ready: Promise<unknown> | null = null;
function ensureTable() {
  ready ??= pool.query(`
    CREATE TABLE IF NOT EXISTS chat_usage (
      key          text        NOT NULL,
      window_start timestamptz NOT NULL,
      count        integer     NOT NULL DEFAULT 0,
      PRIMARY KEY (key, window_start)
    )`);
  return ready;
}

/**
 * Soma 1 ao contador da chave na janela atual e devolve o total. Atômico: duas
 * mensagens ao mesmo tempo (até em réplicas diferentes) nunca leem o mesmo número.
 */
export async function hit(key: string, window: 'hour' | 'day'): Promise<number> {
  await ensureTable();
  const { rows } = await pool.query<{ count: number }>(
    `INSERT INTO chat_usage (key, window_start, count) VALUES ($1, date_trunc($2, now()), 1)
     ON CONFLICT (key, window_start) DO UPDATE SET count = chat_usage.count + 1
     RETURNING count`,
    [key, window],
  );
  // Faxina de vez em quando: janelas de mais de 2 dias não servem para nada.
  if (Math.random() < 0.01) void pool.query(`DELETE FROM chat_usage WHERE window_start < now() - interval '2 days'`);
  return rows[0].count;
}
