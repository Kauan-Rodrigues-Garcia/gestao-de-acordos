/**
 * mapaAbas.ts — quem enxerga cada aba das telas que o Mapa de Abas juntou.
 *
 * ## De onde veio
 *
 * O Mapa de Abas (29/09/2026) reorganizou o menu por trabalho, não por fonte:
 * Painel Líder e Painel Diretoria deixaram de ser itens e viraram Desempenho e
 * Início › Empresa; Dashboard – ADM e Controle de Números viraram o Núcleo;
 * Fechamento e RH Gestão, o Fechamento do mês; as abas técnicas do Painel
 * Diretoria foram para Administração › Dados.
 *
 * Nenhuma chave nova nasceu. Cada aba nova é aberta pela chave que abria a
 * tela de onde ela veio — `painel_lider_sub_quartis` continua abrindo os
 * quartis, agora em Desempenho › Pessoas —, e nenhum cargo precisou ser
 * reconfigurado. O catálogo do banco (`fn_permissoes_catalogo()`) não mudou.
 *
 * ## Por que num arquivo só
 *
 * O item de menu aparece quando ALGUMA aba da tela aparece, e a tela desenha
 * exatamente essas abas. Com a regra escrita duas vezes, a primeira chave
 * mexida faria o menu oferecer uma tela vazia (ou esconder uma cheia). Menu,
 * rota e tela perguntam aqui.
 *
 * Como o resto do menu, isto é conforto e não segurança: quem manda no dado é
 * a RLS de cada consulta, que não mudou.
 */

export type TemPermissao = (chave: string) => boolean;

export interface ContextoAbas {
  isPaguePlay: boolean;
  isBookplay: boolean;
  /**
   * As abas do relatório 59 são de super_admin por CARGO, e não por chave —
   * ver o cabeçalho de `Mestre59`. A regra veio do Painel Diretoria junto.
   */
  superAdmin: boolean;
}

/**
 * Início — a porta de entrada, com quatro leituras.
 *
 *   mes ...... o antigo Dashboard: recebido, meta, projeção, evolução, formas;
 *   hoje ..... a gaveta Desempenho do Dia e os Destaques do dia do Analítico;
 *   formas ... o detalhamento das formas de pagamento, que era do Analítico;
 *   empresa .. a Visão geral do Painel Diretoria (na PaguePlay, o painel).
 */
export function abasDoInicio(temPermissao: TemPermissao) {
  const analitico = temPermissao('ver_analitico');
  return {
    mes:     temPermissao('ver_dashboard'),
    // Mesmo gate da gaveta Desempenho do Dia, que ela substitui.
    hoje:    analitico,
    destaques: analitico && temPermissao('analitico_sub_destaques_dia'),
    formas:  analitico && temPermissao('analitico_sub_formas_pagamento'),
    empresa: temPermissao('ver_painel_diretoria'),
  };
}

/**
 * Desempenho — a quebra por equipe e por pessoa, mais Desafios e Plantão Elite.
 *
 * Os lados de liderança e de diretoria são somados, e não escolhidos: quem tem
 * as duas chaves (administrador) vê a versão da liderança, que agrupa pela
 * equipe da PESSOA — a regra que ficou valendo. A diretoria sem o Painel Líder
 * continua vendo a leitura do 59, que é o que ela via.
 */
export function abasDoDesempenho(temPermissao: TemPermissao, emp: ContextoAbas) {
  const lider = temPermissao('ver_painel_lider');
  // A leitura do 59 existe só na BookPlay; na PaguePlay o painel da diretoria
  // foi inteiro para Início › Empresa.
  const diretoria = temPermissao('ver_painel_diretoria') && emp.isBookplay;
  const analitico = temPermissao('ver_analitico');

  const equipesLider     = lider && temPermissao('painel_lider_sub_desempenho_equipes');
  const equipesDiretoria = diretoria && !equipesLider;
  const quartis          = lider && temPermissao('painel_lider_sub_quartis');
  const ranking          = analitico && temPermissao('analitico_sub_ranking');
  const pessoasDiretoria = diretoria;
  const desafios         = analitico && temPermissao('analitico_sub_desafios');
  const elite            = emp.isBookplay && lider && temPermissao('painel_lider_sub_elite');

  return {
    equipesLider, equipesDiretoria, quartis, ranking, pessoasDiretoria,
    equipes: equipesLider || equipesDiretoria,
    pessoas: quartis || ranking || pessoasDiretoria,
    desafios,
    elite,
  };
}

/** Analítico — só o que vem do relatório, mais os Ajustes do Painel Líder. */
export function ajustesNoAnalitico(temPermissao: TemPermissao): boolean {
  return temPermissao('ver_painel_lider') && temPermissao('painel_lider_sub_ajuste_recebimento');
}

/**
 * Fechamento do mês — a planilha da gerência e a premiação/comissão do RH.
 *
 * O Fechamento é só da BookPlay (como era o item antigo); o fluxo do RH vale
 * nas duas.
 */
export function abasDoFechamentoDoMes(temPermissao: TemPermissao, emp: ContextoAbas) {
  const fechamento = !emp.isPaguePlay && temPermissao('ver_fechamento');
  const rh = temPermissao('ver_rh_gestao');
  return {
    fechamento,
    rh,
    // A aba de premiação existe para quem calcula (Fechamento) ou paga (RH).
    premiacao: fechamento || rh,
  };
}

/** Núcleo — o painel do Núcleo e o Controle de Números, só na BookPlay. */
export function abasDoNucleo(temPermissao: TemPermissao, emp: ContextoAbas) {
  if (emp.isPaguePlay) return { painel: false, numeros: false };
  return {
    painel:  temPermissao('ver_dashboard_adm'),
    numeros: temPermissao('ver_controle_numeros'),
  };
}

/**
 * Administração › Dados e importações — as ferramentas que saíram do caminho
 * de quem opera.
 */
export function abasDosDados(temPermissao: TemPermissao, emp: ContextoAbas) {
  const mestre59 = emp.superAdmin && emp.isBookplay;
  return {
    relatorio59:  mestre59,
    conferencia:  mestre59,
    equipes:      mestre59,
    fontes:       mestre59,
    historico:    mestre59,
    // O card «Importar acordos» e o do banco moravam em Configurações › Geral,
    // atrás de `ver_banco_dados`. A chave vem junto.
    restaurar:    temPermissao('ver_banco_dados'),
    banco:        temPermissao('ver_banco_dados'),
    relatoriosPP: emp.isPaguePlay && temPermissao('ver_painel_diretoria')
      && temPermissao('painel_diretoria_escopo_todos_setores'),
  };
}

/** Há ao menos uma aba verdadeira? */
export function algumaAba(abas: Record<string, boolean>): boolean {
  return Object.values(abas).some(Boolean);
}
