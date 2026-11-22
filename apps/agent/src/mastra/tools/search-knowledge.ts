import { createTool } from '@mastra/core/tools';
import { embed } from 'ai';
import { z } from 'zod';
import { KNOWLEDGE_INDEX } from '../config';
import { embedder, vectorStore } from '../rag/store';

// RAG: o agente decide quando buscar. A pergunta vira um vetor e o PostgreSQL
// devolve os trechos mais parecidos (pgvector, distância de cosseno).
export const searchKnowledge = createTool({
  id: 'search-knowledge',
  description:
    'Busca trechos da base de conhecimento do produto. Use antes de responder perguntas sobre o produto, preços, regras ou procedimentos.',
  inputSchema: z.object({
    query: z.string().describe('O que procurar, em linguagem natural'),
  }),
  outputSchema: z.object({
    results: z.array(z.object({ text: z.string(), source: z.string(), score: z.number() })),
  }),
  execute: async ({ query }) => {
    const { embedding } = await embed({ model: embedder, value: query });
    const indexes = await vectorStore.listIndexes();
    if (!indexes.includes(KNOWLEDGE_INDEX)) return { results: [] }; // base ainda não carregada: npm run ingest
    const hits = await vectorStore.query({ indexName: KNOWLEDGE_INDEX, queryVector: embedding, topK: 4 });
    return {
      results: hits.map((h) => ({
        text: String(h.metadata?.text ?? ''),
        source: String(h.metadata?.source ?? ''),
        score: h.score,
      })),
    };
  },
});
