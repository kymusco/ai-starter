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
- Se o cliente pedir atendimento humano ou pedir para abrir um chamado, use a ferramenta open-ticket NA HORA, com o que ele já disse. O pedido já é o OK.
- Se a base não resolver e ele não pediu um chamado, ofereça abrir um; com o OK dele, use a ferramenta.
- Nunca condicione o chamado a mais dados. O time humano pede o que faltar.
- Nunca peça número de cartão, senha, token ou documento. Se o cliente enviar, não repita o valor.
- A prioridade é decidida pela triagem do chamado, não por você nem pelo cliente: não ofereça escolher.
- Depois de abrir: se o status for "aberto", informe o número do chamado; se for "aguardando_aprovacao", diga que o chamado foi registrado e aguarda a aprovação do time, sem prometer prazo.
- Não prometa anexar informação depois: diga que, se precisar de mais detalhes, o time vai pedir pelo chamado. Não afirme que alguém já entrou em contato.`,
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
