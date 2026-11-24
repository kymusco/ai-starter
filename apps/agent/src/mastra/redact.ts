import type { AnySpan, SpanOutputProcessor } from '@mastra/core/observability';

// O filtro do Mastra mascara por NOME de campo (`password: ...`). O cliente, porém,
// escreve no meio da frase: "minha senha é X, meu cartão é Y". Este mascara o texto.
// É uma rede de proteção por padrões, não uma garantia: nome e endereço, por exemplo,
// continuam no trace. Trate o banco de observabilidade como dado de cliente.

const luhn = (digits: string) => {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0;
};

function validCpf(raw: string) {
  const d = raw.replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const check = (len: number) => {
    let s = 0;
    for (let i = 0; i < len; i++) s += Number(d[i]) * (len + 1 - i);
    const r = (s * 10) % 11;
    return (r === 10 ? 0 : r) === Number(d[len]);
  };
  return check(9) && check(10);
}

function validCnpj(raw: string) {
  const d = raw.replace(/\D/g, '');
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const check = (len: number) => {
    const w = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const r = w.reduce((s, x, i) => s + x * Number(d[i]), 0) % 11;
    return (r < 2 ? 0 : 11 - r) === Number(d[len]);
  };
  return check(12) && check(13);
}

/** Mascara dados sensíveis num texto. Pura. */
export function redactText(text: string): string {
  return text
    // Segredo anunciado na frase: "senha é X", "token: X", "api_key=X".
    .replace(/\b(senha|password|passwd|token|api[ _-]?key|chave(?: de api)?|secret|segredo)(\s*(?:é|eh|=|:)\s*)(["']?)[^\s"',;]+\3/gi, '$1$2[SEGREDO]')
    // O modelo costuma repetir de outro jeito: "senha (X)", "a senha X9".
    .replace(/\b(senha|password|passwd|token|segredo|secret)\s*\(\s*[^\s)]{4,}\s*\)/gi, '$1 ([SEGREDO])')
    .replace(/\b(senha|password|passwd)(\s+(?:atual\s+|nova\s+)?)[^\s,;.]*\d[^\s,;.]*/gi, '$1$2[SEGREDO]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]{8,}=*/gi, 'Bearer [SEGREDO]')
    .replace(/\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b/g, '[SEGREDO]')
    .replace(/\b(?:sk|pk|rk)[-_][A-Za-z0-9_-]{16,}\b/g, '[SEGREDO]')
    .replace(/\b(?:kym_[A-Za-z0-9]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|AKIA[A-Z0-9]{16})\b/g, '[SEGREDO]')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[EMAIL]')
    .replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, (m) => (validCnpj(m) ? '[CNPJ]' : m))
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, (m) => (validCpf(m) ? '[CPF]' : m))
    .replace(/\b\d(?:[ -]?\d){12,18}\b/g, (m) => (luhn(m.replace(/\D/g, '')) ? '[CARTAO]' : m))
    .replace(/(?:\+?55[ -]?)?\(?\b[1-9]{2}\)?[ -]?9\d{4}[ -]?\d{4}\b/g, '[TELEFONE]');
}

/** Copia a estrutura mascarando os textos: nunca altera o objeto que o agente está usando. */
export function redactDeep<T>(value: T, seen = new WeakMap<object, unknown>()): T {
  if (typeof value === 'string') return redactText(value) as T;
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return seen.get(value) as T;
  if (Array.isArray(value)) {
    const out: unknown[] = [];
    seen.set(value, out);
    for (const item of value) out.push(redactDeep(item, seen));
    return out as T;
  }
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return value; // Date, Buffer, classes
  const out: Record<string, unknown> = {};
  seen.set(value, out);
  for (const [k, v] of Object.entries(value)) out[k] = redactDeep(v, seen);
  return out as T;
}

const FIELDS = ['input', 'output', 'attributes', 'metadata', 'errorInfo', 'requestContext'] as const;

export class TextRedactor implements SpanOutputProcessor {
  name = 'text-redactor';

  process(span?: AnySpan): AnySpan | undefined {
    if (!span) return span;
    const s = span as unknown as Record<string, unknown>;
    for (const f of FIELDS) if (s[f] !== undefined) s[f] = redactDeep(s[f]);
    return span;
  }

  async shutdown() {}
}
