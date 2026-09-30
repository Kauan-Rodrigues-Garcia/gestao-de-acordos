/**
 * Migration 20260930145539: o aviso de participante do chat vai só para quem
 * precisa. Antes: todo UPDATE de chat_participantes avisava a conversa inteira
 * (N² por mensagem de grupo) e gerava as rajadas de
 * `UnableToBroadcastChanges: too_many_requests`. Medido num Postgres local com
 * grupo de 24: 1.704 → 46 mensagens por mensagem lida por todos.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const MIGRATIONS = path.resolve(__dirname, '../../../../supabase/migrations');
const arquivo = fs.readdirSync(MIGRATIONS).find(f => f.endsWith('_chat_sinal_participante_so_quem_precisa.sql'));
const LISO = fs.readFileSync(path.join(MIGRATIONS, arquivo as string), 'utf8')
  .replace(/--[^\n]*/g, ' ').replace(/\s+/g, ' ');

describe('fn_chat_sinal_participante', () => {
  it('só ultima_atividade_em mudou: não avisa ninguém', () => {
    expect(LISO).toContain('if not (v_grupo or v_proprio or v_recibo) then return null;');
  });
  it('entrega/leitura avisam só o autor da última mensagem', () => {
    expect(LISO).toContain('order by m.criado_em desc limit 1');
    expect(LISO).toContain("v_autor is distinct from v_quem then perform realtime.send(v_payload, 'participante', 'chat:' || v_autor::text, true)");
  });
  it('fixar/ocultar/apagar avisam só a própria pessoa', () => {
    expect(LISO).toContain("if v_proprio then perform realtime.send(v_payload, 'participante', 'chat:' || v_quem::text, true)");
  });
  it('entrada/saída avisam só os ativos e a própria pessoa', () => {
    expect(LISO).toContain('and cp.saiu_em is null union');
  });
  it('falha no aviso não derruba a escrita', () => {
    expect(LISO).toContain('exception when others then');
  });
});
