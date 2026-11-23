import { SpanType } from '@mastra/core/observability';
import { MastraStorageExporter, Observability, SensitiveDataFilter } from '@mastra/observability';
import { storage } from './rag/store';
import { TextRedactor } from './redact';

// Cada conversa e workflow vira um trace: modelo, ferramentas, tempo, tokens e custo.
// Os filtros mascaram segredos e dados pessoais antes de gravar, mas traces guardam
// prompts e respostas: trate esse banco como dado de cliente.
export const observability = new Observability({
  configs: {
    default: {
      serviceName: 'ai-starter',
      exporters: [new MastraStorageExporter()],
      // Pedaços de streaming e processadores internos eram a maior parte do volume
      // e não ajudam a diagnosticar.
      excludeSpanTypes: [SpanType.MODEL_CHUNK, SpanType.PROCESSOR_RUN],
      spanOutputProcessors: [new SensitiveDataFilter(), new TextRedactor()],
    },
  },
});

const PRUNE_EVERY_MS = 6 * 60 * 60 * 1000;

async function prune() {
  try {
    await storage.prune();
  } catch (e) {
    console.error('limpeza de traces antigos falhou:', e instanceof Error ? e.message : e);
  }
}

/** Apaga o que passou da retenção, na subida e a cada 6 horas. */
export function startRetention() {
  setTimeout(() => void prune(), 60_000).unref();
  setInterval(() => void prune(), PRUNE_EVERY_MS).unref();
}
