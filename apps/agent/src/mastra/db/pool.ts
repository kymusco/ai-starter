import pg from 'pg';
import { config } from '../config';

// Conexão com o PostgreSQL para as tabelas do SEU app (chamados, contador de uso...).
// O Mastra tem as conexões dele (rag/store.ts); esta é a sua.
export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 5 });
