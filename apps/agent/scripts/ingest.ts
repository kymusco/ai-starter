// npm run ingest — recarrega a base de conhecimento a partir de apps/agent/src/mastra/public/docs.
import { ingestDocs } from '../src/mastra/rag/ingest';

const r = await ingestDocs();
console.log(`pronto: ${r.chunks} trechos de ${r.files} arquivo(s)`);
process.exit(0);
