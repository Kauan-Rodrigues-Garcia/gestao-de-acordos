/**
 * A troca de fonte do setor, conferida no SQL das migrations.
 *
 * ## O que se trava aqui
 *
 * **A ordem do desfazer.** `fn_mestre_devolver_ao_58` tem de APAGAR as linhas
 * do 59 antes de repor as do 58. Ao contrário, a reposição esbarraria em
 * `idx_analitico_unicidade` justamente nas linhas em que as duas fontes
 * concordam da chave — que são a maioria — e voltaria quase nada, em silêncio.
 * Um desfazer que não desfaz e não reclama é pior que não ter desfazer.
 *
 * **A linha `manual` nunca é tocada.** Nem ao aplicar, nem ao devolver. Ela é
 * correção humana; apagá-la para pôr um retrato de arquivo no lugar é descartar
 * decisão de gente em favor de um CSV.
 *
 * **`do update`, e não `do nothing`, ao aplicar.** A chave de unicidade não
 * inclui o setor. Se o 58 tinha um recebimento num setor e o 59 diz que ele é
 * de outro, `do nothing` deixaria a linha errada de pé e o dinheiro no lugar
 * errado.
 *
 * **A guarda de projeção vazia.** Aplicar com projeção vazia apagaria o 58 e
 * não poria nada no lugar — o setor zeraria em todas as telas do sistema.
 *
 * Quem garante o comportamento é o Postgres. O que dá para provar aqui é que as
 * regras ESTÃO ESCRITAS.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const MIGRATIONS = path.resolve(__dirname, '../../../../supabase/migrations');

function migration(sufixo: string): string {
  const arquivo = fs.readdirSync(MIGRATIONS).find(f => f.endsWith(sufixo));
  expect(arquivo, `migration *${sufixo} não encontrada`).toBeTruthy();
  return fs.readFileSync(path.join(MIGRATIONS, arquivo as string), 'utf8');
}

function semComentarios(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
}

const APLICAR  = semComentarios(migration('_fase7_o_59_escreve_no_analitico_e_o_58_vira_previa.sql'));
const DEVOLVER = semComentarios(migration('_fase7_devolver_o_setor_ao_58.sql'));

describe('fn_analitico_fonte_do_setor — derivada, sem flag', () => {
  /*
   * Uma tabela de marcação precisaria de alguém para mantê-la, e o dia em que
   * essa pessoa esquecesse, o 58 voltaria a gravar por cima do 59 e o dinheiro
   * seria contado duas vezes. A resposta vem do próprio dado: o 59 possui o que
   * o 59 escreveu.
   */
  it('responde pela existência de linha do 59, não por uma marca guardada', () => {
    expect(APLICAR).toContain('function public.fn_analitico_fonte_do_setor(');
    const corpo = APLICAR.slice(APLICAR.indexOf('function public.fn_analitico_fonte_do_setor('),
                                APLICAR.indexOf('fn_mestre_aplicar_no_analitico'));
    expect(corpo).toContain("a.procedencia = 'relatorio_59'");
    expect(corpo).toContain('exists (');
  });

  it('não lê sem trava de acesso', () => {
    const corpo = APLICAR.slice(APLICAR.indexOf('function public.fn_analitico_fonte_do_setor('),
                                APLICAR.indexOf('fn_mestre_aplicar_no_analitico'));
    expect(corpo).toContain('fn_can_access_empresa');
  });
});

describe('fn_mestre_aplicar_no_analitico', () => {
  it('é só de super_admin', () => {
    expect(APLICAR).toContain('not fn_user_is_super_admin()');
  });

  /*
   * Sem lote vigente do 59 não há o que aplicar; seguir apagaria o 58 e não
   * poria nada no lugar.
   */
  it('recusa quando não há lote vigente do 59', () => {
    expect(APLICAR).toContain('SEM_LOTE_59');
  });

  /*
   * Projeção vazia com 59 cheio significa que algo barrou a leitura — vínculo
   * de carteira, acesso. Apagar nesse estado zeraria o setor em todo o sistema.
   */
  it('recusa quando a projeção não traz nada', () => {
    expect(APLICAR).toContain('PROJECAO_VAZIA');
  });

  it('guarda o que remove antes de remover', () => {
    const insereSnapshot = APLICAR.indexOf('insert into analitico_removidos');
    const apaga = APLICAR.indexOf('delete from analitico_recebimentos');
    expect(insereSnapshot).toBeGreaterThan(-1);
    expect(apaga).toBeGreaterThan(insereSnapshot);
  });

  /*
   * O `in ('relatorio_58','relatorio_59')` é o que deixa a operação repetível
   * (uma segunda aplicação substitui a primeira) SEM tocar em `manual`.
   */
  it('mexe nas duas fontes e poupa a correção manual', () => {
    expect(APLICAR).toContain("in ('relatorio_58', 'relatorio_59')");
    expect(APLICAR).not.toContain("'manual'");
  });

  it('corrige a linha que está no setor errado, em vez de ignorá-la', () => {
    expect(APLICAR).toContain('on conflict (empresa_id, codigo, data_pagamento, forma_pagamento, operador_usuario)');
    expect(APLICAR).toContain('do update set');
    expect(APLICAR).toContain('setor_id       = excluded.setor_id');
  });

  it('grava com procedência do 59, que é o que faz o 58 virar prévia', () => {
    expect(APLICAR).toContain("'relatorio_59'");
  });
});

describe('fn_mestre_devolver_ao_58', () => {
  it('é só de super_admin', () => {
    expect(DEVOLVER).toContain('not fn_user_is_super_admin()');
  });

  /*
   * A ordem é a regra inteira desta função. Repor antes de apagar bateria no
   * índice de unicidade e voltaria quase nada — sem erro, sem aviso.
   */
  it('apaga o 59 ANTES de repor o 58', () => {
    const apaga = DEVOLVER.indexOf('delete from analitico_recebimentos');
    const repoe = DEVOLVER.indexOf('insert into analitico_recebimentos');
    expect(apaga).toBeGreaterThan(-1);
    expect(repoe).toBeGreaterThan(apaga);
  });

  it('recusa quando não há retrato guardado, em vez de apagar e não repor', () => {
    expect(DEVOLVER).toContain('NADA_GUARDADO');
    const recusa = DEVOLVER.indexOf('NADA_GUARDADO');
    const apaga = DEVOLVER.indexOf('delete from analitico_recebimentos');
    expect(apaga).toBeGreaterThan(recusa);
  });

  /* Correção manual lançada entre a troca e o arrependimento fica de pé. */
  it('não sobrescreve o que existe ao repor', () => {
    expect(DEVOLVER).toContain('on conflict do nothing');
  });

  it('só apaga linha do 59 — nunca a manual', () => {
    expect(DEVOLVER).toContain("procedencia = 'relatorio_59'");
    expect(DEVOLVER).not.toContain("'manual'");
  });
});
