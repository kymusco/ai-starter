import { Agent } from '@mastra/core/agent';
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { config } from '../config';
import { insertTicket } from '../db/tickets';

// Workflow: passos que VOCÊ define, na ordem que você define. O contrário do agente,
// que decide sozinho o que fazer. Use workflow quando o processo tem regra (aprovação,
// ordem obrigatória, auditoria) e agente quando a conversa é aberta.
//
//   classify ──▶ approve (pausa se a prioridade for alta) ──▶ save
//
// O estado de cada execução fica no PostgreSQL: uma execução pausada sobrevive a
// reinício e a deploy, e retoma de onde parou.

const ticketSchema = z.object({
  message: z.string(),
  category: z.enum(['cobranca', 'tecnico', 'comercial', 'outro']),
  priority: z.enum(['baixa', 'media', 'alta']),
  summary: z.string(),
});

// Um modelo só para classificar: instrução curta e saída estruturada (validada pelo zod).
const classifier = new Agent({
  id: 'ticket-classifier',
  name: 'Classificador de chamados',
  instructions:
    'Classifique o pedido de suporte. Prioridade alta: cliente parado, cobrança errada ou risco de cancelamento. ' +
    'Resumo: uma frase, em português.',
  model: config.model,
});

const classify = createStep({
  id: 'classify',
  description: 'O modelo lê o pedido e devolve categoria, prioridade e resumo',
  inputSchema: z.object({ message: z.string() }),
  outputSchema: ticketSchema,
  execute: async ({ inputData }) => {
    const result = await classifier.generate(inputData.message, {
      structuredOutput: { schema: ticketSchema.omit({ message: true }) },
    });
    return { message: inputData.message, ...result.object };
  },
});

const approve = createStep({
  id: 'approve',
  description: 'Chamado de prioridade alta espera um humano aprovar',
  inputSchema: ticketSchema,
  outputSchema: ticketSchema.extend({ approvedBy: z.string().optional() }),
  // O que a pausa mostra a quem vai aprovar, e o que a retomada precisa receber.
  suspendSchema: z.object({ reason: z.string(), summary: z.string() }),
  resumeSchema: z.object({ approved: z.boolean(), approvedBy: z.string() }),
  execute: async ({ inputData, resumeData, suspend, bail }) => {
    if (inputData.priority !== 'alta') return inputData; // baixa e média seguem direto

    if (!resumeData) {
      return await suspend({ reason: 'Chamado de prioridade alta: precisa de aprovação.', summary: inputData.summary });
    }
    // Recusado: encerra o workflow aqui, sem gravar nada.
    if (!resumeData.approved) return bail({ ...inputData, approvedBy: resumeData.approvedBy });
    return { ...inputData, approvedBy: resumeData.approvedBy };
  },
});

const save = createStep({
  id: 'save',
  description: 'Grava o chamado na tabela tickets',
  inputSchema: ticketSchema.extend({ approvedBy: z.string().optional() }),
  outputSchema: z.object({ ticketId: z.number(), priority: z.string(), summary: z.string() }),
  execute: async ({ inputData, runId }) => {
    const ticketId = await insertTicket({ ...inputData, runId });
    return { ticketId, priority: inputData.priority, summary: inputData.summary };
  },
});

export const openTicket = createWorkflow({
  id: 'open-ticket',
  description:
    'Abre um chamado para o time de suporte humano a partir do pedido do cliente. ' +
    'Use quando o cliente pedir atendimento humano ou quando a base de conhecimento não resolver.',
  inputSchema: z.object({ message: z.string().describe('O pedido do cliente, com os detalhes que ele deu') }),
  outputSchema: z.object({ ticketId: z.number(), priority: z.string(), summary: z.string() }),
})
  .then(classify)
  .then(approve)
  .then(save)
  .commit();
