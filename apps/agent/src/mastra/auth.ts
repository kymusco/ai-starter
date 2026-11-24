import { SimpleAuth, getWebRequest } from '@mastra/core/server';

/**
 * Quem pode falar com o agente em produção:
 *
 * - STUDIO_TOKEN: você, no Studio. Acesso total (conversas, traces, workflows).
 * - AGENT_API_TOKEN: o app web, no servidor. Só pode chamar o chat.
 *
 * Sem os dois, o agente não sobe: o padrão do Mastra sem auth é deixar tudo aberto.
 * No `npm run dev` não há login. Para SSO, troque por outro provedor do Mastra.
 */
type Caller = { id: string; name: string; role: 'studio' | 'web' };

const MIN_TOKEN_CHARS = 32;
const isDev = () => process.env.MASTRA_DEV === 'true';

function requiredToken(name: string): string {
  const value = process.env[name]?.trim() ?? '';
  if (value.length < MIN_TOKEN_CHARS) {
    throw new Error(`${name} precisa ter ${MIN_TOKEN_CHARS} caracteres ou mais. Gere com: npm run secrets`);
  }
  return value;
}

class StudioAuth extends SimpleAuth<Caller> {
  // O login é só para o Studio. O cookie não viaja em http nem sai de outro app do mesmo domínio.
  override async signIn(email: string, password: string, request: Request) {
    const result = await super.signIn(email, password, request);
    if ((result.user as Caller).role !== 'studio') throw new Error('Token sem acesso ao Studio.');
    return { ...result, cookies: result.cookies?.map((c) => c.replace('SameSite=Lax', 'SameSite=Strict; Secure')) };
  }
}

export function createAuth() {
  if (isDev()) return undefined;

  const studio = requiredToken('STUDIO_TOKEN');
  const web = requiredToken('AGENT_API_TOKEN');
  if (studio === web) throw new Error('STUDIO_TOKEN e AGENT_API_TOKEN precisam ser diferentes.');

  // Sem protótipo: num objeto comum, um token chamado "constructor" encontraria algo.
  const tokens: Record<string, Caller> = Object.create(null);
  tokens[studio] = { id: 'studio', name: 'Studio', role: 'studio' };
  tokens[web] = { id: 'web', name: 'App web', role: 'web' };

  return new StudioAuth({
    tokens,
    authorizeUser: (user, request) => {
      if (user?.role === 'studio') return true;
      if (user?.role !== 'web') return false;
      const req = getWebRequest(request as Parameters<typeof getWebRequest>[0]);
      return req?.method === 'POST' && new URL(req.url).pathname === '/chat';
    },
  });
}

/** O limite de uso roda antes da auth: só conta quem é o web, para anônimo não gastar a cota. */
export function isWebCaller(authorization: string | undefined): boolean {
  if (isDev()) return true;
  return authorization === `Bearer ${process.env.AGENT_API_TOKEN?.trim()}`;
}
