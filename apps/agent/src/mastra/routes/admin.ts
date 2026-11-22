import { registerApiRoute } from '@mastra/core/server';
import { z } from 'zod';
import { recentTickets } from '../db/tickets';
import { hit } from '../db/usage';

// Rotas da tela de aprovação (/admin do web). Só a rede privada chega aqui: quem
// confere a senha da pessoa é o web, antes de chamar.

const LOGIN_ATTEMPTS_PER_HOUR = 10;
const decision = z.object({ approved: z.boolean(), approvedBy: z.string().trim().min(1).max(80) });
type Snapshot = { status?: string; context?: Record<string, { status?: string; output?: Record<string, unknown> }> };
const snapshotOf = (s: unknown): Snapshot => (typeof s === 'string' ? JSON.parse(s) : (s ?? {})) as Snapshot;

export const adminRoutes = [
  // O contador fica no banco: vale com várias réplicas do web e sobrevive a deploy.
  registerApiRoute('/admin/login-attempt', {
    method: 'POST',
    handler: async (c) => {
      const { ip } = await c.req.json<{ ip?: string }>();
      const count = await hit(`login:${String(ip || 'desconhecido').slice(0, 64)}`, 'hour');
      return c.json({ allowed: count <= LOGIN_ATTEMPTS_PER_HOUR });
    },
  }),

  registerApiRoute('/admin/tickets', {
    method: 'GET',
    handler: async (c) => {
      const workflow = c.get('mastra').getWorkflow('openTicket');
      const { runs } = await workflow.listWorkflowRuns({ status: 'suspended', perPage: 50, page: 0 });
      const pending = runs.map((r) => {
        const out = snapshotOf(r.snapshot).context?.classify?.output ?? {};
        return { runId: r.runId, createdAt: r.createdAt, category: out.category, priority: out.priority, summary: out.summary, message: out.message };
      });
      return c.json({ pending, recent: await recentTickets() });
    },
  }),

  registerApiRoute('/admin/tickets/:runId/decision', {
    method: 'POST',
    handler: async (c) => {
      const parsed = decision.safeParse(await c.req.json().catch(() => null));
      if (!parsed.success) return c.json({ error: 'Decisão inválida.' }, 400);
      const runId = c.req.param('runId');
      const workflow = c.get('mastra').getWorkflow('openTicket');
      const stored = await workflow.getWorkflowRunById(runId);
      if (!stored) return c.json({ error: 'Chamado não encontrado.' }, 404);
      if (stored.status !== 'suspended') return c.json({ error: 'Este chamado já foi decidido.' }, 409);

      const run = await workflow.createRun({ runId });
      const result = await run.resume({ step: 'approve', resumeData: parsed.data });
      if (result.status !== 'success') return c.json({ error: 'Não consegui concluir a decisão.' }, 502);
      return c.json({ ok: true, approved: parsed.data.approved });
    },
  }),
];
