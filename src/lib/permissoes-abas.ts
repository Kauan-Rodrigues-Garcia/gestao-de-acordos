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
  | 'ouvidoria'
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
  | 'chat';

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
 */
export const MODULOS_PERMISSAO: readonly DefinicaoModulo[] = [
  {
    id: 'dashboard', rotulo: 'Dashboard', interruptor: 'ver_dashboard', escopo: 'dashboard',
    descricao: 'Tela inicial e os dados exibidos nela.', grupos: ['Dashboard'],
    // Na PaguePlay, cadastrar e administrar acordos acontece dentro do próprio
    // Dashboard. As chaves continuam estáveis; só aparecem no card da tela em
    // que a pessoa realmente executa essas ações.
    gruposPorTenant: { pagueplay: ['Acordos'] },
  },
  {
    id: 'ouvidoria', rotulo: 'Ouvidoria', interruptor: 'ver_ouvidoria', tenants: ['pagueplay'],
    descricao: 'Atendimentos, responsáveis e concessões da Ouvidoria.',
    chaves: ['editar_ouvidoria', 'gerenciar_acessos_ouvidoria', 'ouvidoria_responsavel'],
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
    id: 'rh', rotulo: 'RH Gestão', interruptor: 'ver_rh_gestao', escopo: 'rh',
    descricao: 'Premiação, comissão, validação e fechamento do RH.', grupos: ['RH Gestão'],
  },
  {
    id: 'acordos', rotulo: 'Acordos', interruptor: 'ver_acordos', escopo: 'acordos',
    descricao: 'Lista, formulário e ações sobre acordos.', grupos: ['Acordos'],
    chaves: ['filtrar_por_usuario'], tenants: ['bookplay'],
  },
  {
    id: 'pix', rotulo: 'Pix Automático', interruptor: 'ver_pix_automatico', escopo: 'pix',
    descricao: 'Registros, comissão, aprovação e configuração do Pix.',
    grupos: ['Pix Automático'], chaves: ['aprovar_pix_automatico'], tenants: ['bookplay'],
  },
  {
    id: 'painel_lider', rotulo: 'Painel Líder', interruptor: 'ver_painel_lider',
    escopo: 'painel_lider', descricao: 'Acompanhamento operacional da liderança.',
    grupos: ['Painel Líder'],
  },
  {
    id: 'painel_diretoria', rotulo: 'Painel Diretoria',
    interruptor: 'ver_painel_diretoria', escopo: 'painel_diretoria',
    descricao: 'Indicadores estratégicos e alcance da diretoria.', grupos: ['Painel Diretoria'],
  },
  {
    id: 'usuarios', rotulo: 'Usuários', interruptor: 'ver_usuarios', escopo: 'usuarios',
    descricao: 'Usuários e as abas internas Setores, Equipes, Metas e Comemorações.',
    grupos: ['Gestão de pessoas', 'Metas'], chaves: ['comemoracoes_gerenciar'],
  },
  {
    id: 'configuracoes', rotulo: 'Configurações', interruptor: 'ver_configuracoes',
    descricao: 'Configuração da empresa, permissões, logs e recursos administrativos.',
    chaves: [
      'config_sub_geral', 'config_sub_permissoes', 'config_sub_direto_extra',
      'config_sub_tags', 'ver_logs', 'config_sub_documentacoes',
      'config_sub_multiempresa', 'ver_monitoramento_uso', 'ver_banco_dados',
      'administrar_sistema', 'ignorar_fechamento_mes',
    ],
  },
  {
    id: 'lixeira', rotulo: 'Lixeira', interruptor: 'ver_lixeira', escopo: 'lixeira',
    descricao: 'Consulta, restauração e limpeza de acordos excluídos.', grupos: ['Lixeira'],
  },
  {
    id: 'analitico', rotulo: 'Analítico', interruptor: 'ver_analitico', escopo: 'analitico',
    descricao: 'Relatórios, ranking, recebimento diário e conferências.',
    grupos: ['Analítico', 'Filtros e visão'],
    chaves: [
      'importar_analitico', 'importar_diario',
      'ajuste_recebimento_lancar', 'ajuste_recebimento_administrar',
      'desafios_configurar_setor', 'desafios_configurar',
    ],
  },
  {
    id: 'campanha_facil', rotulo: 'Campanha Fácil', interruptor: 'ver_campanha_facil',
    descricao: 'Campanhas de cobrança da BookPlay.', tenants: ['bookplay'],
  },
  {
    id: 'importar_excel', rotulo: 'Importar Excel', interruptor: 'importar_excel',
    descricao: 'Importação de acordos pela planilha do menu.',
  },
  {
    id: 'chat', rotulo: 'Chat', interruptor: 'ver_chat', escopo: 'chat',
    descricao: 'Conversas internas, alcance e cargos disponíveis.', grupos: ['Chat'],
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
  ver_setores: 'Aba interna Setores',
  setores_criar_editar: 'Aba interna Setores',
  setores_ativar_desativar: 'Aba interna Setores',
  setores_reordenar: 'Aba interna Setores',
  usuarios_transferir: 'Aba interna Setores',
  usuarios_desfazer_transferencia: 'Aba interna Setores',
  ver_equipes: 'Aba interna Equipes',
  equipes_criar_editar: 'Aba interna Equipes',
  equipes_excluir: 'Aba interna Equipes',
  equipes_gerenciar_composicao: 'Aba interna Equipes',
  ver_metas: 'Aba interna Metas',
  metas_editar: 'Aba interna Metas',
  metas_excluir: 'Aba interna Metas',
  metas_editar_dias_uteis: 'Aba interna Metas',
  metas_excluir_dias_uteis: 'Aba interna Metas',
  ver_comemoracoes: 'Aba interna Comemorações',
  comemoracoes_gerenciar: 'Aba interna Comemorações',
};

const SECOES_CONFIG: Record<string, string> = {
  config_sub_geral: 'Abas internas',
  config_sub_permissoes: 'Abas internas',
  config_sub_direto_extra: 'Abas internas',
  config_sub_tags: 'Abas internas',
  ver_logs: 'Abas internas',
  config_sub_documentacoes: 'Abas internas',
  config_sub_multiempresa: 'Abas internas',
  ver_monitoramento_uso: 'Logs',
  ver_banco_dados: 'Geral',
  administrar_sistema: 'Administração',
  ignorar_fechamento_mes: 'Administração',
};

const SECOES_ANALITICO: Record<string, string> = {
  analitico_sub_analitico: 'Abas principais',
  analitico_sub_recebimento_diario: 'Abas principais',
  analitico_sub_colchao: 'Abas principais',
  analitico_sub_desafios: 'Abas principais',
  analitico_sub_por_operador: 'Dentro do relatório Analítico',
  analitico_sub_formas_pagamento: 'Dentro do relatório Analítico',
  analitico_sub_ranking: 'Dentro do relatório Analítico',
  analitico_sub_destaques_dia: 'Dentro do relatório Analítico',
  analitico_sub_sem_operador: 'Dentro do relatório Analítico',
  analitico_validar_relatorio: 'Ações e importações',
  importar_analitico: 'Ações e importações',
  importar_diario: 'Ações e importações',
  ajuste_recebimento_lancar: 'Ações e importações',
  ajuste_recebimento_administrar: 'Ações e importações',
  desafios_configurar_setor: 'Desafios',
  desafios_configurar: 'Desafios',
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
