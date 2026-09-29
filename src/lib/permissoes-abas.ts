/**
 * permissoes-abas.ts — a arquitetura visível do painel de permissões.
 *
 * O catálogo continua guardando as chaves estáveis que o app e o banco usam,
 * mas o administrador não precisa conhecer os grupos históricos onde elas
 * nasceram. A pergunta da tela é sempre:
 *
 *     módulo → alcance → abas internas → ações
 *
 * Esta é a única lista de módulos do painel. Acrescentar uma aba ao menu sem
 * registrá-la aqui quebra o teste de contrato, em vez de criar mais um toggle
 * perdido em “Abas e telas”.
 */
import {
  ABAS_COM_ESCOPO, chaveEscopo, type AbaEscopada,
} from './permissoes-escopo';
import type { PermissaoMeta, GrupoPermissao, TenantSlug } from './permissoes-catalogo';

export type ModuloPermissaoId =
  | 'dashboard'
  | 'dashboard_adm'
  | 'solicitacoes_whatsapp'
  | 'tickets'
  | 'rh'
  | 'acordos'
  | 'pix'
  | 'painel_lider'
  | 'painel_diretoria'
  | 'usuarios'
  | 'configuracoes'
  | 'lixeira'
  | 'analitico'
  | 'campanha_facil'
  | 'importar_excel'
  | 'chat'
  | 'modo_tv'
  | 'controle_numeros'
  | 'meus_chips'
  | 'fechamento';

interface DefinicaoModulo {
  id: ModuloPermissaoId;
  rotulo: string;
  descricao: string;
  interruptor: string;
  escopo?: AbaEscopada;
  grupos?: readonly GrupoPermissao[];
  /** Grupos técnicos que mudam de card conforme a tela real de cada empresa. */
  gruposPorTenant?: Partial<Record<TenantSlug, readonly GrupoPermissao[]>>;
  chaves?: readonly string[];
  tenants?: readonly TenantSlug[];
}

/**
 * Ordem igual à navegação. Pix e Chat não são itens comuns do menu, mas têm
 * escopo próprio e por isso permanecem como módulos independentes e claros.
 *
 * ## O Mapa de Abas (29/09/2026)
 *
 * As CHAVES não mudaram, e por isso o `id` e o `interruptor` de cada card
 * também não: `ver_painel_lider` continua sendo a porta do que era o Painel
 * Líder. O que mudou é onde essas portas levam, e o rótulo de cada card diz o
 * endereço novo — quem configura procura o interruptor pelo nome da tela que
 * vê no menu, e não pelo da tela que deixou de existir.
 */
export const MODULOS_PERMISSAO: readonly DefinicaoModulo[] = [
  {
    id: 'dashboard', rotulo: 'Início', interruptor: 'ver_dashboard', escopo: 'dashboard',
    descricao: 'Tela inicial: as leituras Mês, Hoje e Formas. Na PaguePlay, também a lista de Acordos.', grupos: ['Dashboard'],
    // Na PaguePlay, cadastrar e administrar acordos acontece dentro do próprio
    // Dashboard. As chaves continuam estáveis; só aparecem no card da tela em
    // que a pessoa realmente executa essas ações.
    gruposPorTenant: { pagueplay: ['Acordos'] },
  },
  {
    id: 'acordos', rotulo: 'Acordos', interruptor: 'ver_acordos', escopo: 'acordos',
    descricao: 'Lista, formulário e ações sobre acordos.', grupos: ['Acordos'],
    chaves: ['filtrar_por_usuario'], tenants: ['bookplay'],
  },
  {
    id: 'lixeira', rotulo: 'Acordos › Excluídos', interruptor: 'ver_lixeira', escopo: 'lixeira',
    descricao: 'A aba Excluídos de Acordos: consulta, restauração e limpeza.', grupos: ['Lixeira'],
  },
  {
    id: 'importar_excel', rotulo: 'Acordos › Importar planilha', interruptor: 'importar_excel',
    descricao: 'O botão Importar planilha de Acordos.',
  },
  {
    id: 'pix', rotulo: 'Pix Automático', interruptor: 'ver_pix_automatico', escopo: 'pix',
    descricao: 'Registros, comissão, aprovação e configuração do Pix.',
    grupos: ['Pix Automático'], chaves: ['aprovar_pix_automatico'], tenants: ['bookplay'],
  },
  {
    id: 'analitico', rotulo: 'Analítico', interruptor: 'ver_analitico', escopo: 'analitico',
    descricao: 'Recebimentos do relatório, Colchão e recorte diário; o Ranking, as Formas, os Destaques e os Desafios são desenhados em Início e Desempenho.',
    grupos: ['Analítico', 'Filtros e visão'],
    chaves: [
      'importar_analitico', 'importar_diario',
      'ajuste_recebimento_lancar', 'ajuste_recebimento_administrar',
      'desafios_configurar_setor', 'desafios_configurar',
      'desafios_excluir', 'desafios_multiempresa',
    ],
  },
  {
    id: 'painel_lider', rotulo: 'Desempenho (liderança)', interruptor: 'ver_painel_lider',
    escopo: 'painel_lider', descricao: 'Desempenho › Equipes, Pessoas (Quartis) e Plantão Elite, e o Ajuste de recebimento no Analítico. Era o Painel Líder.',
    grupos: ['Painel Líder'],
  },
  {
    id: 'painel_diretoria', rotulo: 'Início › Empresa e Desempenho (diretoria)',
    interruptor: 'ver_painel_diretoria', escopo: 'painel_diretoria',
    descricao: 'Início › Empresa, e Desempenho › Equipes e Pessoas pelo relatório 59. Era o Painel Diretoria.', grupos: ['Painel Diretoria'],
    /*
     * A chave do robô mora aqui porque o relatório 59 mora aqui — é desta aba
     * que ele é importado à mão, e é ela que mostra o histórico das
     * importações dele.
     *
     * Repare que ela NÃO segue o interruptor da aba: quem enxerga o Painel
     * Diretoria não ganha a chave junto. Ela é explícita, e é ligada
     * nominalmente para a conta do robô. Ver `scripts/robo59/README.md`.
     */
    chaves: ['mestre_importar_automatico'],
  },
  {
    id: 'usuarios', rotulo: 'Pessoas', interruptor: 'ver_usuarios', escopo: 'usuarios',
    descricao: 'Pessoas: Usuários, Estrutura (setores e equipes), Metas e comissão, Comemorações.',
    grupos: ['Gestão de pessoas', 'Metas'], chaves: ['comemoracoes_gerenciar'],
  },
  {
    /*
     * A planilha de fechamento da gerência, como aba. O que ela calcula vem do
     * Analítico e das Metas; o que ela guarda é só D.U. trabalhado e situação,
     * e quem preenche é `fechamento_editar`.
     */
    id: 'fechamento', rotulo: 'Fechamento do mês › Fechamento', interruptor: 'ver_fechamento',
    escopo: 'fechamento',
    descricao:
      'Fechamento mensal por operador: fechamento, meta, alcance, quartil, D.U. '
      + 'trabalhado e situação.',
    grupos: ['Fechamento'], tenants: ['bookplay'],
  },
  {
    id: 'rh', rotulo: 'Fechamento do mês › Premiação (RH)', interruptor: 'ver_rh_gestao', escopo: 'rh',
    descricao: 'Fechamento do mês › Premiação e comissão: conferência, envio, validação e aprovação do RH.', grupos: ['RH Gestão'],
  },
  {
    id: 'campanha_facil', rotulo: 'Campanha Fácil', interruptor: 'ver_campanha_facil',
    descricao: 'Campanhas de cobrança da BookPlay.', tenants: ['bookplay'],
  },
  {
    /*
     * A outra ponta: o setor que recebe. Tem `escopo`, e ele é o que separa
     * o operador (vê o que foi lançado para ele) da liderança (vê o setor
     * inteiro, distribuído ou não).
     */
    id: 'meus_chips', rotulo: 'Meus Chips', interruptor: 'ver_meus_chips',
    escopo: 'chips',
    descricao:
      'Os números de WhatsApp do próprio setor: consultar, lançar a um '
      + 'operador e devolver ao Núcleo.',
    chaves: [
      'chips_lancar_ao_operador',
      'chips_relancar_ao_nucleo',
      'chips_devolver_a_lideranca',
      // Chips Físicos: a separação dentro da mesma aba (21/09/2026).
      'ver_chips_fisicos',
      'chips_fisicos_gerenciar_setor',
      'chips_fisicos_todos_setores',
    ],
    tenants: ['bookplay'],
  },
  {
    id: 'solicitacoes_whatsapp', rotulo: 'Solicitar Atendimento',
    interruptor: 'ver_solicitacoes_whatsapp',
    descricao: 'Solicitações internas de atendimento por WhatsApp.',
    chaves: [
      'criar_solicitacao_whatsapp', 'solicitacoes_ver_todas',
      'solicitacoes_definir_responsavel',
    ],
  },
  {
    id: 'tickets', rotulo: 'Tickets', interruptor: 'ver_tickets',
    descricao: 'Abertura de chamados e administração da fila.', grupos: ['Tickets'],
  },
  {
    /*
     * Sem `escopo`: o alcance do Modo TV não vem de níveis por aba, vem da
     * TELA. Cada tela pertence a um setor, e a cena só vai para a tela do
     * próprio setor — a regra mora em `fn_tv_cortar`, não numa escala de
     * "equipe / setor / todos".
     */
    id: 'modo_tv', rotulo: 'Modo TV', interruptor: 'ver_modo_tv',
    descricao: 'A apresentação na TV do setor: cenas, quem monta e quem manda ao ar.',
    grupos: ['Modo TV'], tenants: ['bookplay'],
  },
  {
    /*
     * O painel do Núcleo, separado do Dashboard da cobrança (11/09/2026). Sem
     * `escopo`: o que ele mostra é recortado pela RLS do Controle de Números, e
     * não por níveis de alcance.
     */
    id: 'dashboard_adm', rotulo: 'Núcleo › Painel', interruptor: 'ver_dashboard_adm',
    descricao:
      'O painel do Núcleo de Inteligência e Gestão: indicadores, evolução e '
      + 'aparelhos do Controle de Números.',
    grupos: ['Dashboard ADM'], tenants: ['bookplay'],
  },
  {
    /*
     * O Controle de Números é UM grupo de catálogo e DOIS cards, e a divisão
     * não é cosmética: são as duas pontas do mesmo caminho, e quem configura
     * uma quase nunca configura a outra.
     *
     * Este card é o do Núcleo. Sem `escopo`: quem é do Núcleo enxerga a
     * empresa inteira por estar no setor apontado em `numeros_config`, e não
     * por um nível de alcance. A regra mora em `fn_numeros_visivel`.
     *
     * As chaves vêm nomeadas em vez de por grupo, justamente porque o grupo
     * tem as duas metades — declarar `grupos` aqui engoliria as chaves de
     * Meus Chips antes de o card seguinte existir.
     */
    id: 'controle_numeros', rotulo: 'Núcleo › Celulares e Números',
    interruptor: 'ver_controle_numeros',
    descricao:
      'A área do Núcleo de Inteligência e Gestão: celulares, números de '
      + 'WhatsApp, aquecimento e liberação aos setores.',
    chaves: [
      'numeros_administrar', 'numeros_liberar_ao_setor', 'numeros_configurar',
      'numeros_lixeira_esvaziar',
    ],
    tenants: ['bookplay'],
  },
  {
    id: 'chat', rotulo: 'Chat', interruptor: 'ver_chat', escopo: 'chat',
    descricao: 'Conversas internas, alcance e cargos disponíveis.', grupos: ['Chat'],
  },
  {
    id: 'configuracoes', rotulo: 'Configurações, Dados e Auditoria', interruptor: 'ver_configuracoes',
    descricao: 'Configurações da empresa e permissões, Administração › Dados e importações e › Auditoria.',
    chaves: [
      'config_sub_geral', 'config_sub_permissoes', 'config_sub_direto_extra',
      'config_sub_tags', 'ver_logs', 'config_sub_documentacoes',
      'config_sub_multiempresa', 'ver_monitoramento_uso', 'ver_banco_dados',
      'administrar_sistema', 'ignorar_fechamento_mes',
    ],
  },
] as const;

export const ROTULO_NIVEL: Record<string, string> = {
  individual: 'Só os próprios', equipe: 'Da equipe', setor: 'Do setor',
  todos_setores: 'De todos os setores',
};

export interface SecaoDePermissoes { rotulo: string; permissoes: PermissaoMeta[] }

export interface BlocoDeAba {
  aba: ModuloPermissaoId;
  rotulo: string;
  descricao: string;
  interruptor: PermissaoMeta;
  niveis: PermissaoMeta[];
  acoes: PermissaoMeta[];
  secoes: SecaoDePermissoes[];
}

export interface LeituraPorAba {
  blocos: BlocoDeAba[];
  /** Deve ficar vazio; existe para o teste apontar qualquer chave esquecida. */
  avulsos: { grupo: GrupoPermissao; permissoes: PermissaoMeta[] }[];
}

const SECOES_USUARIOS: Record<string, string> = {
  usuarios_sub_usuarios: 'Aba interna Usuários',
  usuarios_administrar: 'Aba interna Usuários',
  usuarios_editar_do_setor: 'Aba interna Usuários',
  usuarios_ver_administradores: 'Aba interna Usuários',
  acesso_multiempresa_permitido: 'Aba interna Usuários',
  // O que se pode mexer na janela de edição, campo a campo. Ficam ao lado das
  // duas chaves de alcance porque a pergunta é a mesma — «editar quem, e o quê».
  usuarios_editar_nome: 'Aba interna Usuários',
  usuarios_editar_login: 'Aba interna Usuários',
  usuarios_editar_foto: 'Aba interna Usuários',
  usuarios_editar_cargo: 'Aba interna Usuários',
  usuarios_redefinir_senha: 'Aba interna Usuários',
  usuarios_excluir: 'Aba interna Usuários',
  // Transferir e desfazer saíram da aba Setores em 06/09/2026, junto com a
  // lista de pessoas que ela duplicava. Estão listadas onde agora agem — e o
  // lugar em que a permissão aparece no painel precisa ser o lugar em que ela
  // faz efeito, ou quem configura procura o interruptor na tela errada.
  usuarios_transferir: 'Aba interna Usuários',
  usuarios_desfazer_transferencia: 'Aba interna Usuários',
  // Setores e Equipes viraram a aba Estrutura, e Metas a aba Metas e comissão
  // (Mapa de Abas, 29/09/2026). Cada chave continua abrindo a sua parte.
  ver_setores: 'Aba interna Estrutura › Setores',
  setores_criar_editar: 'Aba interna Estrutura › Setores',
  setores_ativar_desativar: 'Aba interna Estrutura › Setores',
  setores_reordenar: 'Aba interna Estrutura › Setores',
  ver_equipes: 'Aba interna Estrutura › Equipes',
  equipes_criar_editar: 'Aba interna Estrutura › Equipes',
  equipes_excluir: 'Aba interna Estrutura › Equipes',
  equipes_gerenciar_composicao: 'Aba interna Estrutura › Equipes',
  ver_metas: 'Aba interna Metas e comissão',
  metas_editar: 'Aba interna Metas e comissão',
  metas_excluir: 'Aba interna Metas e comissão',
  metas_editar_dias_uteis: 'Aba interna Metas e comissão',
  metas_excluir_dias_uteis: 'Aba interna Metas e comissão',
  ver_comemoracoes: 'Aba interna Comemorações',
  comemoracoes_gerenciar: 'Aba interna Comemorações',
};

const SECOES_CONFIG: Record<string, string> = {
  // Geral, Tags e Multiempresa são seções da aba Empresa desde o Mapa de Abas.
  config_sub_geral: 'Configurações › Empresa',
  config_sub_tags: 'Configurações › Empresa',
  config_sub_multiempresa: 'Configurações › Empresa',
  config_sub_permissoes: 'Configurações › outras abas',
  config_sub_direto_extra: 'Configurações › outras abas',
  config_sub_documentacoes: 'Configurações › outras abas',
  // Logs virou o item Auditoria; o banco e a restauração, Dados e importações.
  ver_logs: 'Administração › Auditoria',
  ver_monitoramento_uso: 'Administração › Auditoria',
  ver_banco_dados: 'Administração › Dados e importações',
  administrar_sistema: 'Administração',
  ignorar_fechamento_mes: 'Administração',
};

/** Onde cada aba do antigo Painel Líder mora agora. */
const SECOES_PAINEL_LIDER: Record<string, string> = {
  painel_lider_sub_desempenho_equipes: 'Desempenho › Equipes',
  painel_lider_sub_quartis: 'Desempenho › Pessoas (Quartis)',
  painel_lider_sub_elite: 'Desempenho › Plantão Elite',
  painel_lider_sub_ajuste_recebimento: 'Analítico › Ajustes',
  // A aba saiu: repetia a evolução diária que o Início mostra. A chave fica
  // até o catálogo do banco perdê-la — tirá-la é migration, e migration em
  // produção é decisão de gente (CLAUDE.md).
  painel_lider_sub_grafico_recebimento: 'Saiu do menu (a evolução diária está no Início)',
};

const SECOES_ANALITICO: Record<string, string> = {
  analitico_sub_analitico: 'Abas principais',
  analitico_sub_recebimento_diario: 'Abas principais',
  analitico_sub_colchao: 'Abas principais',
  // Os números de desempenho saíram do Analítico no Mapa de Abas; a chave é a
  // mesma, e a seção diz onde ela abre agora.
  analitico_sub_desafios: 'Desempenho › Desafios',
  analitico_sub_por_operador: 'Dentro de Recebimentos',
  analitico_sub_formas_pagamento: 'Início › Formas',
  analitico_sub_ranking: 'Desempenho › Pessoas (Ranking)',
  analitico_sub_destaques_dia: 'Início › Hoje (Destaques)',
  analitico_sub_sem_operador: 'Dentro de Recebimentos',
  analitico_validar_relatorio: 'Ações e importações',
  importar_analitico: 'Ações e importações',
  importar_diario: 'Ações e importações',
  ajuste_recebimento_lancar: 'Ações e importações',
  ajuste_recebimento_administrar: 'Ações e importações',
  desafios_configurar_setor: 'Desafios',
  desafios_configurar: 'Desafios',
  desafios_excluir: 'Desafios',
  desafios_multiempresa: 'Desafios',
  // O ALCANCE dentro da aba — quantas campanhas aparecem para o cargo. Fica
  // numa seção própria, e não junto de «Desafios», porque configurar e
  // enxergar são decisões diferentes: quem só acompanha o placar recebe as
  // quatro de baixo e nenhuma das de cima.
  desafios_escopo_individual: 'Desafios: quem enxerga',
  desafios_escopo_equipe: 'Desafios: quem enxerga',
  desafios_escopo_setor: 'Desafios: quem enxerga',
  desafios_escopo_todos_setores: 'Desafios: quem enxerga',
};

const SECOES_DASHBOARD: Record<string, string> = {
  criar_acordos: 'Acordos',
  editar_acordos: 'Acordos',
  excluir_acordos: 'Acordos',
  excluir_em_lote: 'Acordos',
  acordos_autorizar_tabulacao: 'Acordos',
  acordos_capturar_erp: 'Acordos',
};

function secaoDaPermissao(modulo: ModuloPermissaoId, chave: string): string {
  if (modulo === 'dashboard') return SECOES_DASHBOARD[chave] ?? 'Dashboard';
  if (modulo === 'usuarios') return SECOES_USUARIOS[chave] ?? 'Usuários';
  if (modulo === 'configuracoes') return SECOES_CONFIG[chave] ?? 'Configurações';
  if (modulo === 'analitico') return SECOES_ANALITICO[chave] ?? 'Relatório';
  if (modulo === 'painel_lider') return SECOES_PAINEL_LIDER[chave] ?? 'O que pode fazer';
  if (modulo === 'chat' && chave.startsWith('chat_cargo_')) return 'Cargos disponíveis';
  return 'O que pode fazer';
}

export function montarPorAba(
  catalogo: PermissaoMeta[],
  gruposNaOrdem: readonly GrupoPermissao[],
  tenantSlug?: string | null,
): LeituraPorAba {
  const porChave = new Map(catalogo.map(p => [p.key, p]));
  const consumidas = new Set<string>();
  const blocos: BlocoDeAba[] = [];

  for (const modulo of MODULOS_PERMISSAO) {
    const interruptor = porChave.get(modulo.interruptor);
    if (!interruptor) continue;
    consumidas.add(interruptor.key);

    const metaEscopo = modulo.escopo ? ABAS_COM_ESCOPO[modulo.escopo] : null;
    const niveis = metaEscopo
      ? metaEscopo.niveis
          .map(n => porChave.get(chaveEscopo(metaEscopo.prefixo, n)))
          .filter((p): p is PermissaoMeta => !!p)
      : [];
    niveis.forEach(p => consumidas.add(p.key));

    const chavesNominais = new Set(modulo.chaves ?? []);
    const gruposDoModulo = new Set<GrupoPermissao>(modulo.grupos ?? []);
    if (tenantSlug === 'bookplay' || tenantSlug === 'pagueplay') {
      for (const grupo of modulo.gruposPorTenant?.[tenantSlug] ?? []) {
        gruposDoModulo.add(grupo);
      }
    }
    const acoes = catalogo.filter(p =>
      p.key !== interruptor.key
      && !niveis.some(n => n.key === p.key)
      && (gruposDoModulo.has(p.grupo) || chavesNominais.has(p.key))
      && !consumidas.has(p.key));
    acoes.forEach(p => consumidas.add(p.key));

    const porSecao = new Map<string, PermissaoMeta[]>();
    for (const p of acoes) {
      const secao = secaoDaPermissao(modulo.id, p.key);
      porSecao.set(secao, [...(porSecao.get(secao) ?? []), p]);
    }

    blocos.push({
      aba: modulo.id, rotulo: modulo.rotulo, descricao: modulo.descricao,
      interruptor, niveis, acoes,
      secoes: [...porSecao].map(([rotulo, permissoes]) => ({ rotulo, permissoes })),
    });
  }

  const avulsos = gruposNaOrdem
    .map(grupo => ({
      grupo,
      permissoes: catalogo.filter(p => p.grupo === grupo && !consumidas.has(p.key)),
    }))
    .filter(x => x.permissoes.length > 0);

  return { blocos, avulsos };
}
