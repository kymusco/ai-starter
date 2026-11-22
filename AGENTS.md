# Instruções para agentes de IA

Monorepo com npm workspaces. Leia o `README.md` para a visão geral.

## Estrutura

- `apps/agent`: servidor Mastra (porta 4111). `src/mastra/index.ts` registra agentes e rotas.
  - `agents/`: um arquivo por agente. Registre o novo em `index.ts`.
  - `tools/`: ferramentas com `createTool` e esquemas zod de entrada e saída.
  - `workflows/`: processos com passos fixos (`createStep`/`createWorkflow`). Registre em
    `index.ts`. Para o agente usar, crie uma ferramenta que inicia o workflow e devolve o
    status (veja `tools/open-ticket.ts`): ligar o workflow direto ao agente faz a conversa
    terminar muda quando ele pausa.
  - `db/`: as tabelas do app (ex.: `tickets`), no mesmo PostgreSQL.
  - `rag/`: conexão com o PostgreSQL (`store.ts`) e a carga da base (`ingest.ts`).
  - `public/docs/`: a base de conhecimento (Markdown).
- `apps/web`: Next.js (App Router). `app/api/chat/route.ts` repassa a conversa ao agente.
  `app/chat.tsx` é o chat, usado pela página (`/`) e pelo widget (`/embed`, aberto por
  `public/widget.js` num iframe em outros sites).
  Antes de mexer nele, leia `apps/web/AGENTS.md` (escrito pelo próprio Next.js: a versão
  tem mudanças que o seu treino pode não conhecer).
- `kymus.yaml`: a arquitetura de produção (serviços, portas, variáveis, ligações).

## Comandos

```bash
npm run dev          # os dois apps
npm run typecheck    # tem de sair sem erro
npm run build        # o mesmo build da produção
npm run ingest       # força a recarga da base (a subida já recarrega se os documentos mudaram)
```

## Regras

- **O agente é privado.** Não exponha `apps/agent` na internet nem chame o agente direto do
  navegador: o navegador fala com `apps/web`, que repassa pela rede privada.
- **Segredo só no agente.** Chaves de modelo e de APIs ficam nas variáveis do `agent`. Nada
  com `NEXT_PUBLIC_` carrega segredo.
- **Variável nova:** documente em `.env.example` e declare no serviço certo do `kymus.yaml`
  (`secret: true` quando for segredo). Referência a outro serviço: `${{ servico.VARIAVEL }}`.
- **Limite de uso:** toda rota nova que chame o modelo passa pelo middleware de
  `apps/agent/src/mastra/middleware/rate-limit.ts` (registre em `index.ts`).
- **Visitante** é o UUID que o navegador guarda (`app/chat.tsx`), mandado em `x-visitor-id`.
  Não use cookie para isso: dentro do widget ele vira cookie de terceiro e não chega.
- **Aprovação de chamados:** a tela é `apps/web/app/admin`, protegida por `ADMIN_PASSWORD`
  (sem ela, fica fechada). Quem aprovou vem da sessão, nunca do corpo da requisição.
- **Rota do web que muda estado** confere `isSameOrigin` (`apps/web/lib/security.ts`). Isso não
  barra script fora do navegador: custo se protege com o limite de uso.
- **Base de conhecimento:** o agente recarrega na subida quando `public/docs` muda (hash em
  `knowledge_state`). Não precisa de passo manual no deploy.
- **Conexão com o banco** é sempre a `DATABASE_URL`, montada no `kymus.yaml` com as
  referências do `db`. Não escreva host, usuário ou senha no código.
- **Trocou o modelo de embedding?** Rode `npm run ingest`: a dimensão do índice muda.
- Texto que o usuário lê: português do Brasil, com acentos.
