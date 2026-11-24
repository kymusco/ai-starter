# AI Starter

Um app de IA completo, pronto para editar e publicar:

- **Chat** em Next.js, com a resposta chegando em tempo real.
- **Agente** com [Mastra](https://mastra.ai): ferramentas, memória por usuário e busca na
  base de conhecimento do seu produto (RAG).
- **Workflow com aprovação humana**: o agente abre chamados; os urgentes esperam um humano
  aprovar antes de gravar.
- **PostgreSQL com pgvector**: conversas, memória, vetores e os dados do seu app no mesmo banco.

```
visitante ──▶ web (Next.js) ──token──▶ agent (Mastra) ──▶ db (PostgreSQL + pgvector)
você ──login──▶ Studio (servido pelo agent)
```

O endereço público do agente existe para o Studio, e tudo nele exige login. O `web` chama o
agente pela rede privada, com um token que só vale para o chat. A chave do modelo mora só no
agente.

O chat não depende do Mastra: ele conversa com o agente por um [contrato
HTTP](docs/contrato-do-agente.md). Um agente em outro framework ou linguagem que o cumpra
funciona com o mesmo chat e o mesmo widget, como a [versão em Python, com
LangGraph](https://github.com/kymusco/ai-starter-langgraph).

## Rodar no seu computador

Precisa de Node 22.13+ e Docker (para o banco).

```bash
cp .env.example .env      # ponha a sua OPENAI_API_KEY
npm install
npm run db                # cria o PostgreSQL com pgvector no Docker (depois: npm run db:start)
npm run dev               # agente em :4111, chat em http://localhost:3000
```

O agente carrega `apps/agent/src/mastra/public/docs` como base de conhecimento na primeira
subida e de novo sempre que os documentos mudarem, inclusive num novo deploy.

Em desenvolvimento, **http://localhost:4111** abre o Mastra Studio (preencha a URL com
`http://localhost:4111`): converse direto com o agente, veja traces, métricas e
avaliações, e acompanhe os workflows.

## Agente e workflow: os dois modos

- **Agente** (`agents/assistant.ts`): o modelo decide sozinho o que fazer. Bom para conversa
  aberta.
- **Workflow** (`workflows/open-ticket.ts`): passos fixos, na ordem que você define. Bom
  para processo com regra:

  ```
  classify (o modelo classifica) ──▶ approve (pausa se a prioridade for alta) ──▶ save (grava em tickets)
  ```

  O agente usa o workflow pela ferramenta `open-ticket`. Uma execução pausada fica salva no
  PostgreSQL e sobrevive a reinício e a deploy.

**Aprovar chamados:** no Studio, abra **Workflows**, escolha `open-ticket`, entre na execução
pausada, preencha **Approved** e **Approved By** e clique em **Resume**. O chat e o chamado são
exemplos de como consumir o agente e o workflow: troque pelos seus.

## Traces, métricas e avaliações

Tudo fica no PostgreSQL, num schema próprio (`observability`), e aparece no Studio:

- **Traces:** cada conversa e workflow, com modelo, ferramentas, tempo e tokens.
- **Métricas:** duração, tokens e uso de ferramentas ao longo do tempo.
- **Avaliações** (`apps/agent/src/mastra/evals/scorers.ts`), numa amostra de 10% das respostas:
  `answer-quality` (atendeu ao pedido?) e `groundedness` (o que afirma está na base?). Cada
  avaliação também gasta modelo: ajuste com `EVAL_SAMPLE_RATE`, ou use `0` para desligar.

**Privacidade:** cartão, CPF, CNPJ, e-mail, telefone, tokens e senhas são mascarados antes de
gravar (`redact.ts`). É uma proteção por padrões, não uma garantia: nome e endereço, por
exemplo, continuam nos traces, e a memória da conversa guarda o texto original. Por isso o
histórico expira em 14 dias (`OBSERVABILITY_RETENTION_DAYS`). Trate esse banco como dado de
cliente.

Serve para baixo volume. Com tráfego alto, aponte `OBSERVABILITY_DATABASE_URL` para um banco
separado; acima de ~100 chamadas por segundo, o Mastra recomenda ClickHouse.

## Publicar na Kymus

```bash
npm run secrets              # gera no .env o login do Studio e o token do web
npx kymus login              # escolha o projeto e o alcance "também criar serviços"
npx kymus deploy --env sandbox
```

O `kymus.yaml` descreve os três serviços e como eles se ligam: o `deploy` cria o banco, o
agente e o chat, envia a pasta de cada um (`apps/agent`, `apps/web`) e implanta, nessa ordem.
O banco e a senha nascem na hora. Os segredos (chave do modelo, `STUDIO_TOKEN` e
`AGENT_API_TOKEN`) saem do `.env`: o `deploy` pergunta se pode levá-los, como segredo do
serviço, nunca no pacote. O `web` e o `agent` ganham endereço público.

**Entrar no Studio:** abra o endereço do `agent` e use o valor de `STUDIO_TOKEN` como senha (o
e-mail é ignorado). Sem os tokens, o agente não sobe. Quem entra tem acesso total, inclusive às
conversas nos traces: compartilhe só com quem cuida do app. Para SSO ou perfis de acesso, veja
os [provedores do Mastra](https://mastra.ai/docs/auth/overview); alguns exigem licença.

Produção só pelo nome: `npx kymus deploy --env production`.

## Pôr o assistente em outro site (widget)

Uma linha, em qualquer página (HTML, WordPress, outro framework):

```html
<script src="https://SEU-ENDERECO/widget.js" async></script>
```

Aparece um botão no canto; o chat abre num painel (tela cheia no celular). Opcionais:
`data-color="#2f4f3a"`, `data-position="left"`, `data-label="Fale com a gente"`.
Para testar localmente: `npx serve examples -l 5500` e abra `http://localhost:5500/widget-demo.html`.

Em produção, diga quais sites podem exibir o widget, nas variáveis do `web`:
`WIDGET_ALLOWED_ORIGINS="https://loja.com.br https://www.loja.com.br"`.

O que cada proteção faz: essa lista controla quem embute o `iframe`; a rota do chat recusa
chamadas de páginas de outra origem no navegador. Um script fora do navegador consegue
forjar a origem, e contra ele quem protege o seu custo são os **limites de uso** abaixo.

## Limite de uso

Cada mensagem custa dinheiro de modelo, e a rota do chat é pública. O agente conta no
PostgreSQL (vale com várias réplicas e sobrevive a deploy) e recusa com uma mensagem
amigável quando passa de um limite:

| variável | padrão | o quê |
|---|---|---|
| `CHAT_LIMIT_VISITOR_HOUR` | 30 | mensagens por visitante por hora |
| `CHAT_LIMIT_IP_HOUR` | 100 | mensagens por endereço IP por hora |
| `CHAT_LIMIT_TOTAL_DAY` | 2000 | teto do dia para o app inteiro (a rede de segurança do custo) |

Mensagens com mais de 4.000 caracteres são recusadas antes de chegar ao modelo.

## Onde mexer

| quero… | arquivo |
|---|---|
| mudar o comportamento do agente | `apps/agent/src/mastra/agents/assistant.ts` |
| dar uma ferramenta nova ao agente | `apps/agent/src/mastra/tools/` (copie `current-time.ts`) |
| criar um processo com passos e aprovação | `apps/agent/src/mastra/workflows/` (copie `open-ticket.ts`) |
| trocar a base de conhecimento | `apps/agent/src/mastra/public/docs/` (o próximo deploy recarrega; no local, reinicie ou rode `npm run ingest`) |
| trocar o modelo ou o provedor | `MODEL` e `EMBEDDING_MODEL` no `.env` |
| mudar a tela | `apps/web/app/chat.tsx` e `globals.css` (a página e o widget usam o mesmo componente) |
| mudar as avaliações | `apps/agent/src/mastra/evals/scorers.ts` |
| mudar quem acessa o agente | `apps/agent/src/mastra/auth.ts` |
| mudar o botão do widget | `apps/web/public/widget.js` |

### Trocar de provedor

`MODEL` aceita `provedor/modelo`: `anthropic/claude-sonnet-4-5`, `google/gemini-2.5-flash`,
`openrouter/…`. Ponha a chave do provedor (`ANTHROPIC_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`,
`OPENROUTER_API_KEY`). O `EMBEDDING_MODEL` precisa de um provedor que gere embeddings. Ao
trocá-lo, rode `npm run ingest`: vetores de modelos diferentes não se misturam.

## Licença

MIT
