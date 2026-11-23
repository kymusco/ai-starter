import { chatRoute } from '@mastra/ai-sdk';
import { Mastra } from '@mastra/core/mastra';
import { assistant } from './agents/assistant';
import { rateLimit } from './middleware/rate-limit';
import { observability, startRetention } from './observability';
import { syncKnowledge } from './rag/ingest';
import { storage } from './rag/store';
import { adminRoutes } from './routes/admin';
import { openTicket } from './workflows/open-ticket';

// A cada subida: se os documentos de public/docs mudaram, a base é recarregada.
void syncKnowledge();
startRetention();

export const mastra = new Mastra({
  agents: { assistant },
  // Registrado aqui, o workflow aparece no Studio (diagrama, execuções, retomar).
  workflows: { openTicket },
  // Sem isto o Mastra guarda workflows e rastros em memória e perde tudo a cada reinício.
  storage,
  // Traces e métricas de cada conversa e workflow, visíveis no Studio.
  observability,
  server: {
    // 0.0.0.0: o web chega pela rede privada do projeto. O agente não é publicado
    // na internet (exposed: false no kymus.yaml).
    host: '0.0.0.0',
    // O navegador não abre 0.0.0.0: sem isto, o Studio local pede a URL à mão.
    studioHost: 'localhost',
    port: Number(process.env.PORT) || 4111,
    // Conversa no formato do AI SDK: é o que o useChat do web fala. A verificação
    // de saúde (/health) já vem do próprio servidor do Mastra.
    apiRoutes: [chatRoute({ path: '/chat', agent: 'assistant' }), ...adminRoutes],
    // Limite de uso antes do chat: cada mensagem custa dinheiro de modelo.
    middleware: [{ path: '/chat', handler: rateLimit }],
  },
});
