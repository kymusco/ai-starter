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
    );
    ALTER TABLE tickets ADD COLUMN IF NOT EXISTS run_id text;
    CREATE UNIQUE INDEX IF NOT EXISTS tickets_run_id_key ON tickets (run_id);`);
  return ready;
}

export type NewTicket = { runId: string; category: string; priority: string; summary: string; message: string; approvedBy?: string };

/** Uma execução do workflow grava um chamado só, mesmo com dois cliques em "aprovar". */
export async function insertTicket(t: NewTicket): Promise<number> {
  await ensureTable();
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO tickets (run_id, category, priority, summary, message, approved_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (run_id) DO UPDATE SET run_id = EXCLUDED.run_id
     RETURNING id`,
    [t.runId, t.category, t.priority, t.summary, t.message, t.approvedBy ?? null],
  );
  return rows[0].id;
}

export type TicketRow = { id: number; category: string; priority: string; summary: string; approved_by: string | null; created_at: string };

export async function recentTickets(limit = 20): Promise<TicketRow[]> {
  await ensureTable();
  const { rows } = await pool.query<TicketRow>(
    'SELECT id, category, priority, summary, approved_by, created_at FROM tickets ORDER BY id DESC LIMIT $1', [limit],
  );
  return rows;
}
