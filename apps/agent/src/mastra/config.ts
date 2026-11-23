// Tudo o que vem do ambiente passa por aqui: um lugar só para saber o que o agente precisa.

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Variável ${name} não definida. Veja o .env.example.`);
  return value;
}

export const config = {
  databaseUrl: required('DATABASE_URL'),
  model: process.env.MODEL || 'openai/gpt-5-mini',
  embeddingModel: process.env.EMBEDDING_MODEL || 'openai/text-embedding-3-small',
};

const int = (name: string, fallback: number) => {
  const n = Number(process.env[name]);
  return Number.isInteger(n) && n > 0 ? n : fallback;
};

// Limite de uso do chat: protege a sua chave de modelo de quem chamar em laço.
export const limits = {
  perVisitorPerHour: int('CHAT_LIMIT_VISITOR_HOUR', 30),
  perIpPerHour: int('CHAT_LIMIT_IP_HOUR', 100),
  // Teto do dia para o app inteiro: a rede de segurança do custo, mesmo se o abuso
  // vier de muitos endereços.
  totalPerDay: int('CHAT_LIMIT_TOTAL_DAY', 2000),
};

const rate = (name: string, fallback: number) => {
  const raw = process.env[name];
  const n = Number(raw);
  return raw !== undefined && raw !== '' && Number.isFinite(n) && n >= 0 && n <= 1 ? n : fallback;
};

// Traces, métricas e evals.
export const observabilityConfig = {
  // Em produção com volume, aponte para um banco separado.
  databaseUrl: process.env.OBSERVABILITY_DATABASE_URL || config.databaseUrl,
  // Traces contêm conversas de clientes: guarde só o necessário.
  retentionDays: int('OBSERVABILITY_RETENTION_DAYS', 14),
  // Fração das respostas avaliadas: cada avaliação também gasta modelo. 0 desliga.
  evalSampleRate: rate('EVAL_SAMPLE_RATE', 0.1),
  evalModel: process.env.EVAL_MODEL || config.model,
};

// Índice da base de conhecimento (os documentos de apps/agent/docs).
export const KNOWLEDGE_INDEX = 'knowledge';
