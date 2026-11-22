import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MDocument } from '@mastra/rag';
import { embedMany } from 'ai';
import { config, KNOWLEDGE_INDEX } from '../config';
import { pool } from '../db/pool';
import { embedder, vectorStore } from './store';

// Os documentos moram em src/mastra/public/docs: o Mastra copia `public` para a
// saída do build. O servidor (dev e produção) roda de dentro dela, e acha `docs`;
// o `npm run ingest` roda da pasta do app, e acha o caminho completo.
const DOCS_DIR = [join(process.cwd(), 'docs'), join(process.cwd(), 'src/mastra/public/docs')].find((d) => existsSync(d))
  ?? join(process.cwd(), 'docs');

const CHUNK = { strategy: 'markdown', maxSize: 400, overlap: 40 } as const;

type Doc = { file: string; content: string };

async function readDocs(): Promise<Doc[]> {
  const files = (await readdir(DOCS_DIR)).filter((f) => /\.(md|txt)$/i.test(f)).sort();
  return Promise.all(files.map(async (file) => ({ file, content: await readFile(join(DOCS_DIR, file), 'utf8') })));
}

/** Muda quando um documento, o modelo de embedding ou o corte em trechos muda. */
function fingerprint(docs: Doc[]): string {
  const h = createHash('sha256').update(JSON.stringify({ model: config.embeddingModel, chunk: CHUNK }));
  for (const d of docs) h.update(`\0${d.file}\0${d.content}`);
  return h.digest('hex');
}

async function ensureStateTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS knowledge_state (
      index_name   text PRIMARY KEY,
      content_hash text NOT NULL,
      updated_at   timestamptz NOT NULL DEFAULT now()
    )`);
}

async function ingest(docs: Doc[]): Promise<{ files: number; chunks: number }> {
  const pieces: { text: string; source: string }[] = [];
  for (const { file, content } of docs) {
    const chunks = await MDocument.fromMarkdown(content).chunk(CHUNK);
    for (const c of chunks) if (c.text.trim()) pieces.push({ text: c.text, source: file });
  }

  // Os vetores saem ANTES de mexer no índice: se o provedor falhar, a base antiga fica.
  const embeddings = pieces.length
    ? (await embedMany({ model: embedder, values: pieces.map((p) => p.text) })).embeddings
    : [];

  if ((await vectorStore.listIndexes()).includes(KNOWLEDGE_INDEX)) {
    await vectorStore.deleteIndex({ indexName: KNOWLEDGE_INDEX });
  }
  if (pieces.length) {
    await vectorStore.createIndex({ indexName: KNOWLEDGE_INDEX, dimension: embeddings[0].length, metric: 'cosine' });
    await vectorStore.upsert({ indexName: KNOWLEDGE_INDEX, vectors: embeddings, metadata: pieces });
  }

  await ensureStateTable();
  await pool.query(
    `INSERT INTO knowledge_state (index_name, content_hash) VALUES ($1, $2)
     ON CONFLICT (index_name) DO UPDATE SET content_hash = EXCLUDED.content_hash, updated_at = now()`,
    [KNOWLEDGE_INDEX, fingerprint(docs)],
  );
  return { files: docs.length, chunks: pieces.length };
}

/** Recarrega a base agora, mudando ou não (`npm run ingest`). */
export async function ingestDocs(): Promise<{ files: number; chunks: number }> {
  return ingest(await readDocs());
}

/**
 * Na subida: recarrega só se os documentos mudaram desde a última carga. É o que faz
 * um `kymus deploy` com documentos novos valer, sem passo manual e sem pagar
 * embedding a cada reinício.
 */
export async function syncKnowledge(): Promise<void> {
  const client = await pool.connect().catch((e) => {
    console.error('não consegui sincronizar a base de conhecimento:', e instanceof Error ? e.message : e);
    return null;
  });
  if (!client) return;
  // Com várias réplicas subindo juntas, só uma recarrega.
  const LOCK = 'select pg_try_advisory_lock(hashtext($1)) as ok';
  let locked = false;
  try {
    locked = (await client.query<{ ok: boolean }>(LOCK, ['knowledge-sync'])).rows[0].ok;
    if (!locked) return;
    await ensureStateTable();
    const docs = await readDocs();
    const { rows } = await client.query<{ content_hash: string }>(
      'SELECT content_hash FROM knowledge_state WHERE index_name = $1', [KNOWLEDGE_INDEX],
    );
    if (rows[0]?.content_hash === fingerprint(docs)) return;
    const r = await ingest(docs);
    console.log(`base de conhecimento atualizada: ${r.chunks} trechos de ${r.files} arquivo(s)`);
  } catch (e) {
    // O chat segue no ar com a base anterior; a próxima subida tenta de novo.
    console.error('não consegui carregar a base de conhecimento:', e instanceof Error ? e.message : e);
  } finally {
    if (locked) await client.query('select pg_advisory_unlock(hashtext($1))', ['knowledge-sync']).catch(() => {});
    client.release();
  }
}
