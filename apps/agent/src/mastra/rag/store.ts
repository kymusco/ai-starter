import { ModelRouterEmbeddingModel } from '@mastra/core/llm';
import { PgVector, PostgresStore } from '@mastra/pg';
import { config } from '../config';

// Um PostgreSQL só para tudo, com uma conexão de cada tipo para o processo inteiro:
// - storage: conversas, memória, execuções de workflow e rastros do Mastra;
// - vectorStore: a busca semântica da memória e a base de conhecimento (pgvector).
export const storage = new PostgresStore({ id: 'storage', connectionString: config.databaseUrl });
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
