# Contrato do agente

O `web` (chat e widget) não sabe qual framework roda no `agent`. Ele só conhece esta
conversa por HTTP. Qualquer agente que a cumpra, em qualquer linguagem, funciona com o
mesmo chat: troque a pasta `apps/agent` e mantenha o resto.

```text
navegador ──▶ web: POST /api/chat ──▶ agent: POST /chat ──▶ resposta em streaming
```

## A requisição

`POST /chat`, pela rede privada (o `web` usa `AGENT_URL`).

| cabeçalho | valor |
|---|---|
| `authorization` | `Bearer <AGENT_API_TOKEN>` |
| `content-type` | `application/json` |
| `x-visitor-id` | UUID do visitante, gerado e guardado pelo navegador |
| `x-client-ip` | IP de quem está no navegador, como o `web` recebeu |

```json
{
  "messages": [
    { "id": "m1", "role": "user", "parts": [{ "type": "text", "text": "Qual é a política de reembolso?" }] }
  ],
  "memory": { "thread": "<id da conversa>", "resource": "<x-visitor-id>" }
}
```

O `web` manda **só a mensagem nova**. O histórico é responsabilidade do agente, guardado por
`thread` (a conversa) e `resource` (o dono). O `web` só aceita mensagem de texto de até 4.000
caracteres e recusa as vazias antes de chamar o agente.

## O que o agente precisa fazer

1. **Conferir o token.** Sem ele, ou com outro, responda `401`. Com o token do `web`, só
   `POST /chat` é permitido.
2. **Isolar as conversas.** Uma `thread` pertence a um `resource`. Pedido de outro dono é recusado.
3. **Aplicar o limite de uso** antes de chamar o modelo, contando por `x-visitor-id`, por
   `x-client-ip` e um teto diário. Só conte depois de conferir o token: assim, quem não tem
   token não gasta a cota de ninguém.
4. **Responder `GET /health` com `200`**, sem login. É o que a plataforma usa para saber se
   ele subiu.

## A resposta

Status `200` com estes cabeçalhos:

```text
content-type: text/event-stream
x-vercel-ai-ui-message-stream: v1
```

O corpo é o *UI message stream* do [AI SDK](https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol):
um evento JSON por linha `data:`, separados por linha em branco, terminando em `data: [DONE]`.

**O mínimo que o chat precisa:**

```text
data: {"type":"start","messageId":"<uuid>"}

data: {"type":"text-start","id":"t"}

data: {"type":"text-delta","id":"t","delta":"Você pode pedir reembolso "}

data: {"type":"text-delta","id":"t","delta":"em até 7 dias."}

data: {"type":"text-end","id":"t"}

data: {"type":"finish"}

data: [DONE]
```

O texto é Markdown: o chat desenha negrito, listas e código e não executa HTML vindo do modelo.

**Ferramentas** (opcional): para o chat mostrar "consultando…" e "✓ consultou…", envie a
chamada e o resultado antes do texto:

```text
data: {"type":"tool-input-available","toolCallId":"c1","toolName":"searchKnowledge","input":{"query":"reembolso"}}

data: {"type":"tool-output-available","toolCallId":"c1","output":{"results":[]}}
```

O rótulo vem de `TOOL_NAMES` em `apps/web/app/chat.tsx`. Ferramenta sem rótulo aparece pelo nome.

O agente Mastra deste starter manda também `start-step`, `finish-step`, `tool-input-start` e
`tool-input-delta`, com o argumento da ferramenta chegando aos poucos. O chat aceita esses
eventos, mas não depende deles.

## Erros

O corpo é JSON com `error`, uma frase para o cliente final.

| status | quando | o que o visitante vê |
|---|---|---|
| `401` | token ausente ou errado | mensagem genérica (o `web` não repassa) |
| `429` | passou de um limite: `{"error": "...", "code": "rate_limited"}` | a frase do `error` |
| `503` | o agente não consegue atender agora | a frase do `error` |
| outro | falha inesperada | "O agente não respondeu. Tente de novo em instantes." |

## Como conferir uma implementação nova

1. Suba o seu agente e aponte o `web` para ele: `AGENT_URL=http://localhost:<porta>` e o mesmo
   `AGENT_API_TOKEN` nos dois.
2. Mande uma pergunta pelo chat: o texto deve aparecer aos poucos, não de uma vez.
3. Peça algo que use uma ferramenta: o rótulo "consultando…" deve aparecer antes da resposta.
4. Chame `POST /chat` sem token: tem de voltar `401`.
