import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { openTicket as openTicketWorkflow } from '../workflows/open-ticket';

// A ponte entre o agente e o workflow. O agente decide QUANDO abrir o chamado; o
// workflow decide COMO (classificar, aprovar, gravar).
//
// Por que uma ferramenta e não `workflows: { openTicket }` direto no agente: quando
// o workflow pausa para aprovação, o agente pausaria junto e a conversa terminaria
// sem resposta ao cliente. Aqui o agente recebe o resultado e sempre responde.
export const openTicket = createTool({
  id: 'open-ticket',
  description:
    'Abre um chamado para o time de suporte humano. Use quando o cliente pedir atendimento humano ' +
    'ou quando a base de conhecimento não resolver, sempre com o OK do cliente.',
  inputSchema: z.object({
    message: z.string().describe('O pedido do cliente, com os detalhes que ele deu'),
  }),
  outputSchema: z.object({
    status: z.enum(['aberto', 'aguardando_aprovacao', 'falhou']),
    ticketId: z.number().optional(),
    priority: z.string().optional(),
    summary: z.string().optional(),
  }),
  execute: async ({ message }, context) => {
    // A instância registrada no Mastra guarda o estado da execução no PostgreSQL.
    const workflow = context?.mastra?.getWorkflow('openTicket') ?? openTicketWorkflow;
    const run = await workflow.createRun();
    const result = await run.start({ inputData: { message } });

    if (result.status === 'success') {
      return { status: 'aberto' as const, ...result.result };
    }
    if (result.status === 'suspended') {
      const classified = result.steps.classify;
      const out = classified?.status === 'success' ? classified.output : undefined;
      return { status: 'aguardando_aprovacao' as const, priority: out?.priority, summary: out?.summary };
    }
    return { status: 'falhou' as const };
  },
});
