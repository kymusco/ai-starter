import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

// Ferramenta mínima, para copiar: troque por uma chamada à sua API, ao seu banco, a um CRM.
export const currentTime = createTool({
  id: 'current-time',
  description: 'Diz a data e a hora atuais num fuso horário.',
  inputSchema: z.object({
    timeZone: z.string().default('America/Sao_Paulo').describe('Fuso IANA, ex.: America/Sao_Paulo'),
  }),
  outputSchema: z.object({ now: z.string(), timeZone: z.string() }),
  execute: async ({ timeZone }) => ({
    now: new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full', timeStyle: 'long', timeZone }).format(new Date()),
    timeZone,
  }),
});
