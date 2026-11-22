import { pool } from './pool';

// Os dados do SEU app moram no mesmo PostgreSQL do Mastra, em tabelas suas.
// Aqui, os chamados abertos pelo workflow open-ticket.

let ready: Promise<unknown> | null = null;
function ensureTable() {
  // Em app de verdade, isto vira migration. Para o exemplo, cria na primeira vez.
  ready ??= pool.query(`
    CREATE TABLE IF NOT EXISTS tickets (
      id          serial PRIMARY KEY,
      category    text NOT NULL,
      priority    text NOT NULL,
      summary     text NOT NULL,
      message     text NOT NULL,
      approved_by text,
      created_at  timestamptz NOT NULL DEFAULT now()
    )`);
  return ready;
}

export type NewTicket = { category: string; priority: string; summary: string; message: string; approvedBy?: string };

export async function insertTicket(t: NewTicket): Promise<number> {
  await ensureTable();
  const { rows } = await pool.query<{ id: number }>(
    'INSERT INTO tickets (category, priority, summary, message, approved_by) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    [t.category, t.priority, t.summary, t.message, t.approvedBy ?? null],
  );
  return rows[0].id;
}
