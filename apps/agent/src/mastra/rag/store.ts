import { ModelRouterEmbeddingModel } from '@mastra/core/llm';
import { PgVector, PostgresStoreVNext } from '@mastra/pg';
import pg from 'pg';
import { config, observabilityConfig } from '../config';

// Um PostgreSQL só para tudo, com uma conexão de cada tipo para o processo inteiro:
// - storage: conversas, memória, execuções de workflow, rastros, métricas e avaliações;
// - vectorStore: a busca semântica da memória e a base de conhecimento (pgvector).
// Traces e métricas ficam num schema próprio, com partição por dia e conexão separada.
export const storage = new PostgresStoreVNext({
  id: 'storage',
  connectionString: config.databaseUrl,
  observability: {
    pool: new pg.Pool({ connectionString: observabilityConfig.databaseUrl, max: 3 }),
    schemaName: 'observability',
  },
  retention: {
    observability: {
      spans: { maxAge: `${observabilityConfig.retentionDays}d` },
      logs: { maxAge: `${observabilityConfig.retentionDays}d` },
      metrics: { maxAge: `${observabilityConfig.retentionDays}d` },
      scores: { maxAge: `${observabilityConfig.retentionDays}d` },
      feedback: { maxAge: `${observabilityConfig.retentionDays}d` },
    },
  },
});
export const vectorStore = new PgVector({ id: 'vectors', connectionString: config.databaseUrl });

// Sem a chave do provedor, o modelo de embedding nem chega a ser criado. Diga o que
// fazer, em vez do erro interno da biblioteca.
function createEmbedder(): ModelRouterEmbeddingModel {
  // Divide na PRIMEIRA barra: `openai/text-embedding-3-small` e também
  // `openrouter/openai/text-embedding-3-small` (o texto só aceitaria uma barra).
  const slash = config.embeddingModel.indexOf('/');
  const providerId = config.embeddingModel.slice(0, slash);
  const modelId = config.embeddingModel.slice(slash + 1);
  try {
    return new ModelRouterEmbeddingModel({ providerId, modelId });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    throw new Error(
      `Não consegui preparar o modelo de embedding ${config.embeddingModel}: ${detail}\n` +
        'Ponha a chave do provedor no .env da raiz (veja o .env.example) e suba de novo.',
    );
  }
}

export const embedder = createEmbedder();
