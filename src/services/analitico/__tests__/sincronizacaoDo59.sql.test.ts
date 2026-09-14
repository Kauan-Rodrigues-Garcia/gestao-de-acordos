/**
 * A sincronização automática do 59, conferida no SQL da migration.
 *
 * ## O desenho que estes testes guardam
 *
 * O 58 continua alimentando durante o dia; o 59 corrige tudo quando entra. Isso
 * abre uma janela de contagem dupla nos NRs em que as duas fontes discordam da
 * data — 50 grupos, R$ 40.903,78, 0,6% dos grupos em setembro/2026.
 *
 * A janela é aceitável **porque a sincronização é automática**. Se ela virar um
 * botão que alguém precisa lembrar de clicar, aqueles R$ 40 mil deixam de ser
 * transitórios e viram permanentes. Por isso o gatilho é o coração disto.
 *
 * ## Três defeitos que já aconteceram aqui
 *
 * 1. **O tratador de erro derrubava a promoção.** Ele gravava uma severidade
 *    que o check de `logs_sistema` recusa, levantava, ninguém capturava, e o
 *    lote inteiro caía — o oposto do que ele existia para fazer.
 * 2. **O laço por setor estourava o tempo**, porque recalculava a projeção a
 *    cada volta.
 * 3. **Função SECURITY DEFINER não é embutida pelo Postgres**: como função, a
 *    projeção levava 19s para um setor e não terminava para o mês; como view,
 *    17ms.
 *
 * Os três só apareceram porque foram testados contra produção antes de ficarem
 * no ar.
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

const SQL = semComentarios(migration('_fase7_o_59_sincroniza_tudo_ao_entrar.sql'));

describe('a projeção é VIEW, e isso não é detalhe', () => {
  /*
   * Como função SECURITY DEFINER o Postgres não a embute na consulta de quem
   * chama, os filtros de empresa e mês não descem, e o plano degenera: 19s para
   * um setor, sem fim para o mês. Como view, 17ms.
   *
   * Importa além da velocidade — a sincronização roda DENTRO da promoção do
   * lote, que tem teto de 120s. Voltar a ser função faria a promoção cair por
   * timeout e o mês ficar sem lote vigente.
   */
  it('existe como view, não como função', () => {
    expect(SQL).toContain('create or replace view public.vw_mestre_projecao_analitico');
  });

  it('a view não é exposta a authenticated — quem entra é a função com trava', () => {
    expect(SQL).toContain('revoke all on public.vw_mestre_projecao_analitico from authenticated');
    expect(SQL).toContain('fn_user_is_super_admin() or fn_can_access_empresa(p_empresa_id)');
  });

  /* Os dois DISTINCT ordenavam cada um dos 9.639 grupos. `min is not distinct
     from max` responde a mesma pergunta sem ordenar. */
  it('não usa agregados DISTINCT', () => {
    const view = SQL.slice(SQL.indexOf('create or replace view'), SQL.indexOf('comment on view'));
    expect(view).not.toContain('array_agg(distinct');
    expect(view).not.toContain('count(distinct');
    expect(view).toContain('min(b.tipo_comissao) is not distinct from max(b.tipo_comissao)');
  });
});

describe('o gatilho de sincronização', () => {
  it('dispara quando o lote passa a vigente, e só então', () => {
    expect(SQL).toContain('create trigger trg_mestre_aplicar_no_analitico');
    expect(SQL).toContain("new.estado is distinct from 'vigente'");
    expect(SQL).toContain("coalesce(old.estado, '') = 'vigente'");
  });

  /*
   * O nome começa com 'a' de propósito: gatilhos disparam em ordem alfabética,
   * e a notificação (`trg_mestre_notificar...`) diz «os números do dashboard já
   * refletem a mudança». Ela só pode dizer isso depois de eles terem sido
   * escritos.
   */
  it('ordena antes do gatilho de notificação', () => {
    expect('trg_mestre_aplicar_no_analitico' < 'trg_mestre_notificar_atualizacao').toBe(true);
  });

  /*
   * Adotar setor novo no gatilho seria trocar a fonte de quem não pediu. A
   * adoção é decisão humana na aba «Fonte dos dados»; só a manutenção é
   * automática.
   */
  it('só re-sincroniza setor que JÁ é do 59', () => {
    const gatilho = SQL.slice(SQL.indexOf('fn_mestre_sincronizar_analitico()'));
    expect(gatilho).toContain("a.procedencia = 'relatorio_59'");
  });

  /*
   * O alvo é a interseção entre «é do 59» e «a projeção tem». Setor que o lote
   * não trouxe fica de fora e conserva o dado anterior — apagar e não pôr nada
   * no lugar zeraria o setor em ~30 telas.
   */
  it('não toca em setor que este lote não trouxe', () => {
    const gatilho = SQL.slice(SQL.indexOf('fn_mestre_sincronizar_analitico()'));
    expect(gatilho).toContain('exists (select 1 from vw_mestre_projecao_analitico v');
    expect(gatilho).toContain('setores_pulados');
  });

  it('guarda antes de apagar', () => {
    const gatilho = SQL.slice(SQL.indexOf('fn_mestre_sincronizar_analitico()'));
    const guarda = gatilho.indexOf('insert into analitico_removidos');
    const apaga = gatilho.indexOf('delete from analitico_recebimentos');
    expect(guarda).toBeGreaterThan(-1);
    expect(apaga).toBeGreaterThan(guarda);
  });

  it('não apaga correção manual', () => {
    const gatilho = SQL.slice(SQL.indexOf('fn_mestre_sincronizar_analitico()'));
    expect(gatilho).toContain("in ('relatorio_58', 'relatorio_59')");
    expect(gatilho).not.toContain("'manual'");
  });

  /*
   * O defeito que já derrubou a promoção: o tratador de erro gravava
   * `severidade = 'erro'`, valor que o check recusa, e levantava. Agora a
   * gravação da trilha está dentro de um bloco que engole qualquer falha.
   */
  it('a gravação da trilha não pode derrubar a promoção', () => {
    const gatilho = SQL.slice(SQL.indexOf('fn_mestre_sincronizar_analitico()'));
    const log = gatilho.indexOf('insert into logs_sistema');
    const trecho = gatilho.slice(log);
    expect(trecho).toContain('exception when others then');
    expect(trecho).toContain('null;');
  });

  it('não usa severidade que o check da tabela recusa', () => {
    const gatilho = SQL.slice(SQL.indexOf('fn_mestre_sincronizar_analitico()'));
    expect(gatilho).not.toContain("'erro'");
  });

  /* Uma projeção para todos os setores, não uma por volta de laço. */
  it('sincroniza em bloco, sem laço por setor', () => {
    const gatilho = SQL.slice(SQL.indexOf('fn_mestre_sincronizar_analitico()'));
    expect(gatilho).not.toContain('for v_setor in');
    expect(gatilho).toContain('setor_id in (select setor_id from _sync_alvo)');
  });
});
