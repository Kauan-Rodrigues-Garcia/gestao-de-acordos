/**
 * A trava do mês fechado sobre a composição, conferida no SQL da migration.
 *
 * ## A armadilha que estes testes guardam
 *
 * `fn_composicao_mes_completar_clones` é **SECURITY DEFINER**: ela passa por
 * cima do RLS das tabelas `composicao_mes*`, que é super_admin-only. Até a Fase
 * 6 ela não tinha trava de mês nenhuma e aceitava `gerencia`, `diretoria` e
 * `administrador` — então qualquer um desses podia acrescentar ao retrato de um
 * mês já fechado os clones de HOJE, reescrevendo em silêncio a atribuição
 * histórica do dinheiro.
 *
 * Ela é cuidadosa: só cresce, nunca apaga. Mas crescer um retrato fechado
 * também é alterá-lo, e a regra 9 diz «alteração feita depois vale só para o
 * mês corrente; só super admin pode editar um mês fechado».
 *
 * ## Dois cadeados, e eles não são o mesmo
 *
 * `lib/fechamentoMes.ts` trava **acordo** em mês fechado e admite exceção pela
 * permissão `ignorar_fechamento_mes`. Este aqui trava **configuração** e exige
 * `super_admin`, sem exceção por permissão — reescrever quem estava em qual
 * equipe em agosto é mais grave que editar um acordo. Se alguém «uniformizar»
 * os dois um dia, este teste cai.
 *
 * Quem garante o comportamento é o Postgres. O que dá para provar aqui é que a
 * regra ESTÁ ESCRITA — mesmo recurso de `setorResolvido.sql.test.ts`.
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

const SQL = semComentarios(
  migration('_fase6_mes_fechado_um_lugar_so_e_a_porta_que_faltava.sql'),
);

describe('fn_mes_fechado — o lugar único', () => {
  /*
   * «À meia-noite do dia 1º» é conta de calendário, não estado. Um flag
   * precisaria de alguém para ligá-lo, e o dia em que esse alguém falhasse o
   * mês ficaria aberto sem ninguém notar.
   */
  it('é derivado da data, estritamente anterior ao mês corrente', () => {
    expect(SQL).toContain('function public.fn_mes_fechado(');
    expect(SQL).toMatch(/p_mes\s*<\s*to_char/);
  });

  /*
   * São Paulo, e não o fuso do servidor. Com `now()` cru, das 21h à meia-noite
   * do dia 31 o mês viraria antes da empresa e o banco recusaria escrita num
   * mês que ainda estava aberto para quem estava trabalhando.
   */
  it('mede o mês corrente em America/Sao_Paulo', () => {
    expect(SQL).toContain("at time zone 'America/Sao_Paulo'");
  });

  /* Entrada inválida não pode virar «fechado» por acidente: um mês malformado
     travaria a operação em vez de reclamar do formato. */
  it('exige o formato yyyy-MM antes de decidir', () => {
    expect(SQL).toMatch(/p_mes\s*~\s*'\^\\d\{4\}-\\d\{2\}\$'/);
  });

  it('é STABLE, porque depende de now()', () => {
    const corpo = SQL.slice(SQL.indexOf('function public.fn_mes_fechado('));
    expect(corpo.slice(0, 400)).toContain('stable');
  });
});

describe('a porta que faltava', () => {
  const GUARDA = SQL.slice(SQL.indexOf('MES_FECHADO') - 400, SQL.indexOf('MES_FECHADO') + 300);

  it('completar_clones passa a consultar o lugar único', () => {
    expect(SQL).toContain('function public.fn_composicao_mes_completar_clones(');
    expect(GUARDA).toContain('fn_mes_fechado(p_mes)');
  });

  /*
   * O ponto inteiro da Fase 6. `gerencia`, `diretoria` e `administrador`
   * continuam podendo completar o mês CORRENTE — a função existe para isso.
   * O que eles não podem mais é fazê-lo para trás.
   */
  it('mês fechado exige super_admin, e não um cargo qualquer', () => {
    expect(GUARDA).toContain('not fn_user_is_super_admin()');
  });

  /*
   * Não pode honrar `ignorar_fechamento_mes`: aquela permissão é do cadeado de
   * ACORDO. Configuração é mais grave e a regra 9 diz «só super admin».
   */
  it('não abre exceção por permissão, só por super_admin', () => {
    expect(SQL).not.toContain('ignorar_fechamento_mes');
  });

  /*
   * A guarda tem de vir ANTES de qualquer escrita, senão ela avisa depois do
   * fato — que é exatamente o defeito que a remoção silenciosa do 58 tinha.
   */
  it('a guarda vem antes do primeiro insert', () => {
    const guarda = SQL.indexOf('MES_FECHADO');
    const primeiroInsert = SQL.indexOf('insert into composicao_mes_setor');
    expect(guarda).toBeGreaterThan(-1);
    expect(primeiroInsert).toBeGreaterThan(guarda);
  });

  /*
   * A função nunca apagou nada, e a Fase 6 não mudou isso — ela só restringiu
   * quem pode chamá-la para trás. Se um `delete` aparecer aqui, o «só cresce»
   * deixou de valer e o mês fechado passa a poder encolher.
   */
  it('continua sem apagar nada', () => {
    const corpo = SQL.slice(SQL.indexOf('function public.fn_composicao_mes_completar_clones('));
    expect(corpo).not.toMatch(/\bdelete\s+from\b/i);
  });
});
