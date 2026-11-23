import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { config } from '../config';
import { liveScorers } from '../evals/scorers';
import { embedder, storage, vectorStore } from '../rag/store';
import { currentTime } from '../tools/current-time';
import { searchKnowledge } from '../tools/search-knowledge';
import { openTicket } from '../tools/open-ticket';

export const assistant = new Agent({
  id: 'assistant',
  name: 'Assistente',
  instructions: `Você é o assistente do produto. Responda em português do Brasil, de forma direta.
- Para perguntas sobre o produto, use a ferramenta search-knowledge antes de responder e cite a fonte.
- Se a base não tiver a resposta, diga que não sabe. Não invente.
- Se o cliente pedir atendimento humano, ou a base não resolver, ofereça abrir um chamado e, com o OK dele, use a ferramenta open-ticket.
- A prioridade é decidida pela triagem do chamado, não por você nem pelo cliente: não ofereça escolher.
- Depois de abrir: se o status for "aberto", informe o número do chamado; se for "aguardando_aprovacao", diga que o chamado foi registrado e aguarda a aprovação do time, sem prometer prazo.
- Não prometa anexar informação ao chamado depois: ele é aberto com o que o cliente já disse. Junte os detalhes ANTES de abrir.`,
  model: config.model,
  // open-ticket inicia o workflow de mesmo nome (apps/agent/src/mastra/workflows).
  tools: { searchKnowledge, currentTime, openTicket },
  // Memória no PostgreSQL: as últimas mensagens da conversa e, por busca semântica,
  // trechos de conversas antigas do mesmo usuário.
  // Avaliação automática de uma amostra das respostas (EVAL_SAMPLE_RATE).
  scorers: liveScorers,
  memory: new Memory({
    storage,
    vector: vectorStore,
    embedder,
    options: {
      lastMessages: 20,
      semanticRecall: { topK: 3, messageRange: 2, scope: 'resource' },
    },
  }),
});
