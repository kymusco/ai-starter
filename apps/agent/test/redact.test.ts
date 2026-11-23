import assert from 'node:assert/strict';
import { test } from 'node:test';
import { redactDeep, redactText, TextRedactor } from '../src/mastra/redact';

const frase = 'Meu cartão é 4111 1111 1111 1111, minha senha é SenhaSecreta987, meu token é sk-testeabcdefghijklmnop123456, CPF 123.456.789-09 e e-mail maria.prova@exemplo.com.';

test('mascara o que o cliente escreve no meio da frase', () => {
  const r = redactText(frase);
  for (const s of ['4111', 'SenhaSecreta987', 'sk-testeabcdefghijklmnop', '123.456.789', 'maria.prova']) assert.ok(!r.includes(s), s);
  for (const m of ['[CARTAO]', '[SEGREDO]', '[CPF]', '[EMAIL]']) assert.ok(r.includes(m), m);
});

test('CNPJ, telefone, Bearer, JWT e chaves conhecidas', () => {
  const r = redactText('CNPJ 11.222.333/0001-81, cel (11) 91234-5678, Bearer abcdefgh12345678, eyJhbGciOi.eyJzdWIiOi.c2lnbmF0dXJl, kym_ABCDEFGHIJKLMNOPQRSTUVWXYZ');
  for (const s of ['11.222.333', '91234', 'abcdefgh1234', 'eyJhbGci', 'kym_ABC']) assert.ok(!r.includes(s), s);
});

test('pega a senha repetida pelo modelo em outro formato', () => {
  assert.equal(redactText('Troque a senha (SenhaSecreta987) e revogue'), 'Troque a senha ([SEGREDO]) e revogue');
  assert.equal(redactText('a senha Abc12345 vazou'), 'a senha [SEGREDO] vazou');
  assert.equal(redactText('Troque a senha agora (é urgente)'), 'Troque a senha agora (é urgente)');
});

test('não estraga número comum', () => {
  for (const t of ['Pedido 1234567890123 de R$ 89,90 em 03/11/2026', 'Plano de 100 GB, 10 usuários, 7 dias', 'CPF inválido 111.111.111-11', 'A chave do sucesso']) {
    assert.equal(redactText(t), t);
  }
});

test('copia em vez de alterar o objeto do agente, e aguenta referência circular', () => {
  const original: Record<string, unknown> = { messages: [{ text: 'senha: abc123456' }], when: new Date(0) };
  original.self = original;
  const r = redactDeep(original);
  assert.equal((original.messages as { text: string }[])[0].text, 'senha: abc123456');
  assert.equal((r.messages as { text: string }[])[0].text, 'senha: [SEGREDO]');
  assert.equal(r.self, r);
  assert.ok(r.when instanceof Date);
});

test('processador mascara os campos do span e devolve a mesma instância', () => {
  const span = { input: frase, output: { text: 'e-mail a@b.co' }, metadata: { nota: 'token=segredo123' } };
  const out = new TextRedactor().process(span as never) as unknown as typeof span;
  assert.equal(out, span);
  assert.ok(!out.input.includes('SenhaSecreta987'));
  assert.equal(out.output.text, 'e-mail [EMAIL]');
  assert.equal(out.metadata.nota, 'token=[SEGREDO]');
});
