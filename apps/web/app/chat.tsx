'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useMemo, useState, type FormEvent } from 'react';

// O que o agente está fazendo com cada ferramenta, em linguagem de gente.
const TOOL_NAMES: Record<string, string> = {
  searchKnowledge: 'a base de conhecimento',
  currentTime: 'o relógio',
  openTicket: 'o time de suporte (abrindo chamado)',
};
function toolLabel(tool: string, state: string | undefined): string {
  const name = TOOL_NAMES[tool] ?? tool;
  if (state === 'output-available') return `✓ consultou ${name}`;
  if (state === 'output-error') return `⚠ não conseguiu consultar ${name}`;
  return `🔎 consultando ${name}…`;
}

// O servidor manda o motivo ({"error": "..."}), como no limite de uso. Sem motivo, o genérico.
function errorText(error: Error): string {
  try {
    const parsed = JSON.parse(error.message) as { error?: string };
    if (parsed.error) return parsed.error;
  } catch {}
  return 'Não foi possível responder agora. Tente de novo.';
}

/**
 * Quem é o visitante: um id aleatório guardado neste navegador. A memória do agente
 * separa as conversas por ele, e o limite de uso conta por ele.
 *
 * Por que localStorage e não cookie: dentro do widget (um iframe em OUTRO site), o
 * cookie vira de terceiro e o navegador não o manda. Troque pelo id do usuário
 * logado quando o app tiver login.
 */
const VISITOR_KEY = 'ai-starter:visitor';
function visitorId(): string {
  let id = localStorage.getItem(VISITOR_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(VISITOR_KEY, id);
  }
  return id;
}

export function Chat({ variant = 'page' }: { variant?: 'page' | 'embed' }) {
  const [input, setInput] = useState('');
  const transport = useMemo(
    () => new DefaultChatTransport({ api: '/api/chat', headers: () => ({ 'x-visitor-id': visitorId() }) }),
    [],
  );
  const { messages, sendMessage, status, error, stop } = useChat({ transport });
  const busy = status === 'submitted' || status === 'streaming';

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    sendMessage({ text });
    setInput('');
  }

  return (
    <main className={`chat ${variant}`}>
      <header>
        <h1>Assistente</h1>
        <p>Pergunte sobre o produto. As respostas vêm da base de conhecimento.</p>
      </header>

      <ol className="messages" aria-live="polite">
        {messages.length === 0 && (
          <li className="empty">Experimente: “Qual é a política de reembolso?”</li>
        )}
        {messages.map((m) => (
          <li key={m.id} className={m.role}>
            {m.parts.map((part, i) => {
              if (part.type === 'text') return <p key={i}>{part.text}</p>;
              if (part.type.startsWith('tool-') && 'state' in part) {
                return <p key={i} className="tool">{toolLabel(part.type.slice(5), part.state)}</p>;
              }
              return null;
            })}
          </li>
        ))}
      </ol>

      {error && <p className="error">{errorText(error)}</p>}

      <form onSubmit={onSubmit}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Escreva sua pergunta"
          aria-label="Mensagem"
          autoFocus={variant === 'page'}
        />
        {busy ? (
          <button type="button" onClick={stop}>Parar</button>
        ) : (
          <button type="submit" disabled={!input.trim()}>Enviar</button>
        )}
      </form>
    </main>
  );
}
