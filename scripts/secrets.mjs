// Gera no .env os tokens que faltam (STUDIO_TOKEN e AGENT_API_TOKEN). Não mostra os valores.
import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

const FILE = new URL('../.env', import.meta.url);
if (!existsSync(FILE)) {
  console.error('Crie o .env antes: cp .env.example .env');
  process.exit(1);
}

let env = readFileSync(FILE, 'utf8');
const created = [];
for (const name of ['STUDIO_TOKEN', 'AGENT_API_TOKEN']) {
  const line = new RegExp(`^${name}=(.*)$`, 'm');
  if (line.exec(env)?.[1]?.trim()) continue;
  const value = randomBytes(32).toString('hex');
  env = line.test(env) ? env.replace(line, `${name}=${value}`) : `${env.replace(/\n?$/, '\n')}${name}=${value}\n`;
  created.push(name);
}

writeFileSync(FILE, env);
chmodSync(FILE, 0o600);
console.log(created.length ? `Gerados no .env: ${created.join(', ')}` : 'Os tokens já existem no .env.');
