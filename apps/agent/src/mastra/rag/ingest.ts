import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MDocument } from '@mastra/rag';
import { embedMany } from 'ai';
import { KNOWLEDGE_INDEX } from '../config';
import { embedder, vectorStore } from './store';

// Os documentos moram em src/mastra/public/docs: o Mastra copia `public` para a
// saída do build. O servidor (dev e produção) roda de dentro dela, e acha `docs`;
// o `npm run ingest` roda da pasta do app, e acha o caminho completo.
const DOCS_DIR = [join(process.cwd(), 'docs'), join(process.cwd(), 'src/mastra/public/docs')].find((d) => existsSync(d))
  ?? join(process.cwd(), 'docs');

/** Lê docs/*.md, divide em trechos, gera os vetores e grava. Recria o índice inteiro. */
export async function ingestDocs(): Promise<{ files: number; chunks: number }> {
  const files = (await readdir(DOCS_DIR)).filter((f) => /\.(md|txt)$/i.test(f)).sort();
  const pieces: { text: string; source: string }[] = [];
  for (const file of files) {
    const doc = MDocument.fromMarkdown(await readFile(join(DOCS_DIR, file), 'utf8'));
    const chunks = await doc.chunk({ strategy: 'markdown', maxSize: 400, overlap: 40 });
    for (const c of chunks) if (c.text.trim()) pieces.push({ text: c.text, source: file });
  }
  if (pieces.length === 0) return { files: files.length, chunks: 0 };

  const { embeddings } = await embedMany({ model: embedder, values: pieces.map((p) => p.text) });

  if ((await vectorStore.listIndexes()).includes(KNOWLEDGE_INDEX)) {
    await vectorStore.deleteIndex({ indexName: KNOWLEDGE_INDEX });
  }
  await vectorStore.createIndex({ indexName: KNOWLEDGE_INDEX, dimension: embeddings[0].length, metric: 'cosine' });
  await vectorStore.upsert({ indexName: KNOWLEDGE_INDEX, vectors: embeddings, metadata: pieces });
  return { files: files.length, chunks: pieces.length };
}

/** Na subida: carrega a base só se ela ainda não existe. Recarregar é com `npm run ingest`. */
export async function ingestIfEmpty(): Promise<void> {
  try {
    if ((await vectorStore.listIndexes()).includes(KNOWLEDGE_INDEX)) return;
    const r = await ingestDocs();
    console.log(`base de conhecimento carregada: ${r.chunks} trechos de ${r.files} arquivo(s)`);
  } catch (e) {
    // O chat segue no ar sem a base; a ferramenta de busca devolve vazio.
    console.error('não consegui carregar a base de conhecimento:', e instanceof Error ? e.message : e);
  }
}
