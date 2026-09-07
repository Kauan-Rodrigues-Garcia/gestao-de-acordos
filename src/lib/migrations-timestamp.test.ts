/**
 * migrations-timestamp.test.ts — o timestamp da migration tem que ser uma data.
 *
 * ## Por que existe
 *
 * A CI valida o nome com `^[0-9]{14}_[a-z0-9_]+\.sql$`: ela conta 14 dígitos e
 * NÃO confere se eles formam uma data. Foi assim que entraram no repositório
 * arquivos com hora que não existe — `20260904700000` é "hora 70",
 * `20260818240000` é "hora 24".
 *
 * Isso não é preciosismo de nome. O timestamp é a IDENTIDADE da migration no
 * `supabase_migrations.schema_migrations`. Quando o arquivo tem um número
 * inventado à mão e a aplicação pela CLI gera outro, a mesma mudança passa a
 * ter duas identidades — e `supabase db push` vê o arquivo como pendente e
 * tenta reaplicar. Em 07/09/2026 eram 82 arquivos nessa situação, todos já
 * aplicados; a reconciliação está descrita em `supabase/MIGRATIONS.md`.
 *
 * ## O que este teste faz
 *
 * Reprova QUALQUER arquivo novo cujo timestamp não seja uma data válida. Os 36
 * que já estavam commitados quando isto foi escrito ficam listados abaixo, um a
 * um: são dívida registrada, não exceção genérica. A lista é fechada — nenhum
 * nome novo entra nela sem alguém decidir que entra.
 *
 * Renomeá-los NÃO é o conserto óbvio: vários desses números inválidos são
 * exatamente os que estão gravados no banco (`20260818240000`,
 * `20260903500000`, `20260903600000`). Renomear quebraria a correspondência
 * que hoje funciona. Ver a seção «Por que os arquivos NÃO foram renomeados».
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const PASTA = path.resolve(__dirname, '../../supabase/migrations');

/**
 * Os 36 que já estavam no repositório em 07/09/2026, com hora inexistente.
 *
 * Não acrescente nada aqui para "fazer o teste passar": se um arquivo novo cai
 * nesta lista, o certo é gerar o nome com `supabase migration new`, que produz
 * o timestamp a partir do relógio.
 */
const DIVIDA_ANTERIOR = new Set([
  '20260818240000_revogar_anon_nas_rpcs.sql',
  '20260818260000_autorizacao_edicao.sql',
  '20260818280000_ho_calculado_2496.sql',
  '20260818300000_acesso_multiempresa.sql',
  '20260818320000_multiempresa_gate_restante.sql',
  '20260818340000_lider_conta_na_equipe.sql',
  '20260818360000_acordos_regra_pela_linha.sql',
  '20260818380000_diretoria_ve_acordos_nas_duas.sql',
  '20260825240000_chat_boas_vindas.sql',
  '20260825250000_chat_lista_em_uma_consulta.sql',
  '20260903240000_tv_palco_desafio_coluna_certa.sql',
  '20260903250000_tv_metricas_do_setor.sql',
  '20260903260000_tv_palco_metricas_e_equipe.sql',
  '20260903270000_tv_palco_jogo_por_tipo.sql',
  '20260903280000_tv_jogos_fase_3.sql',
  '20260903290000_lider_clonado_aparece_no_setor.sql',
  '20260903300000_excluir_usuario_solta_as_referencias_novas.sql',
  '20260903310000_perfis_le_o_maior_escopo_entre_as_abas.sql',
  '20260903320000_chat_sair_admin_curtida_e_monitor.sql',
  '20260903330000_retrato_do_mes_fechado_nao_se_reescreve.sql',
  '20260903340000_o_retrato_do_mes_congela_a_lideranca.sql',
  '20260903350000_o_retrato_do_mes_congela_o_nome_do_setor.sql',
  '20260903360000_monitor_nao_alcanca_admin_nem_super_admin.sql',
  '20260903370000_chat_historico_fixar_e_apagar_grupo.sql',
  '20260903380000_pix_premiacao_paga_pergunta_ao_painel.sql',
  '20260903390000_excluir_usuario_nao_notifica_quem_saiu.sql',
  '20260903400000_clone_de_equipe_enxerga_alem_do_setor.sql',
  '20260903410000_o_retrato_do_mes_guarda_a_identidade.sql',
  '20260903420000_subgrupos_de_equipe_e_ranking_do_analitico.sql',
  '20260903500000_desafios_2.sql',
  '20260903600000_desafios_arte_e_convidados.sql',
  '20260904300000_mestre_59_receptivo_integral_e_extra.sql',
  '20260904400000_mestre_59_operadores_e_acordos.sql',
  '20260904500000_mestre_59_destino_da_equipe.sql',
  '20260904600000_composicao_mes_completar_clones.sql',
  '20260904700000_desafio_lider_multi_equipe.sql',
]);

const arquivos = fs.readdirSync(PASTA).filter(f => f.endsWith('.sql')).sort();

/** `true` quando os 14 dígitos formam um instante que existe no calendário. */
function dataValida(versao: string): boolean {
  const [ano, mes, dia, hora, min, seg] = [
    versao.slice(0, 4), versao.slice(4, 6), versao.slice(6, 8),
    versao.slice(8, 10), versao.slice(10, 12), versao.slice(12, 14),
  ].map(Number);

  if (mes < 1 || mes > 12) return false;
  if (hora > 23 || min > 59 || seg > 59) return false;
  // Dia dentro do mês, com ano bissexto — `new Date` normaliza 31/02 para
  // 03/03 em vez de recusar, então a comparação de volta é o que reprova.
  const d = new Date(Date.UTC(ano, mes - 1, dia, hora, min, seg));
  return d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

describe('timestamp das migrations', () => {
  it('a pasta tem migrations (o teste não passa por estar vazio)', () => {
    expect(arquivos.length).toBeGreaterThan(100);
  });

  it('todo arquivo tem 14 dígitos e snake_case — o mesmo que a CI checa', () => {
    const fora = arquivos.filter(f => !/^[0-9]{14}_[a-z0-9_]+\.sql$/.test(f));
    expect(fora).toEqual([]);
  });

  it('nenhum arquivo NOVO tem timestamp que não é data', () => {
    const invalidos = arquivos
      .filter(f => !dataValida(f.slice(0, 14)))
      .filter(f => !DIVIDA_ANTERIOR.has(f));

    // Mensagem no lugar do `toEqual([])` seco: quem quebrar isto precisa saber
    // o que fazer, e o que NÃO fazer (acrescentar na lista de dívida).
    expect(
      invalidos,
      `Timestamp inventado à mão em: ${invalidos.join(', ')}.\n` +
      'Gere o nome com `supabase migration new <nome>` — ele monta o timestamp ' +
      'do relógio. NÃO acrescente o arquivo em DIVIDA_ANTERIOR.',
    ).toEqual([]);
  });

  it('a dívida anterior não cresceu nem encolheu sem alguém notar', () => {
    // Se um dos 36 for renomeado ou removido, este teste avisa — a lista tem
    // que acompanhar, senão vira lixo que esconde arquivo que não existe mais.
    const presentes = [...DIVIDA_ANTERIOR].filter(f => arquivos.includes(f));
    expect(presentes).toHaveLength(DIVIDA_ANTERIOR.size);
    expect(DIVIDA_ANTERIOR.size).toBe(36);
  });
});
