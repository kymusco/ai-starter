import { chatRoute } from '@mastra/ai-sdk';
import { Mastra } from '@mastra/core/mastra';
import { assistant } from './agents/assistant';
import { rateLimit } from './middleware/rate-limit';
import { ingestIfEmpty } from './rag/ingest';
import { storage } from './rag/store';
import { openTicket } from './workflows/open-ticket';

// Primeira subida: a base de conhecimento nasce de apps/agent/src/mastra/public/docs, sem passo manual.
void ingestIfEmpty();

export const mastra = new Mastra({
  agents: { assistant },
  // Registrado aqui, o workflow aparece no Studio (diagrama, execuções, retomar).
  workflows: { openTicket },
  // Sem isto o Mastra guarda workflows e rastros em memória e perde tudo a cada reinício.
  storage,
  server: {
    // 0.0.0.0: o web chega pela rede privada do projeto. O agente não é publicado
    // na internet (exposed: false no kymus.yaml).
    host: '0.0.0.0',
    port: Number(process.env.PORT) || 4111,
    // Conversa no formato do AI SDK: é o que o useChat do web fala. A verificação
    // de saúde (/health) já vem do próprio servidor do Mastra.
    apiRoutes: [chatRoute({ path: '/chat', agent: 'assistant' })],
    // Limite de uso antes do chat: cada mensagem custa dinheiro de modelo.
    middleware: [{ path: '/chat', handler: rateLimit }],
  },
});
