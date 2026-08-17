/**
 * src/lib/logs-catalogo.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * O vocabulário da trilha de auditoria: categorias, severidades, ações e
 * rótulos de campo. Um só lugar, consumido pela tela, pelo serviço e pela
 * exportação.
 *
 * ## Por que catálogo e não `switch` na tela
 * A tela de Logs mostra a mesma ação em quatro lugares (tabela, linha do tempo,
 * filtro, gráfico). Com a tradução espalhada, "acordo_status_alterado" aparecia
 * bonito num lugar e cru no outro — foi o que acontecia na versão 1.0, que
 * mostrava `acao` cru em maiúsculas.
 *
 * ## Ações desconhecidas
 * `descreverAcao()` nunca devolve vazio. Ação que não está no catálogo (código
 * novo, migration futura, linha antiga de um dialeto esquecido) é humanizada
 * pela convenção `<alvo>_<verbo>`: "pix_registro_criado" → "Registro de Pix
 * criado". Log ilegível é log que ninguém lê.
 */

// ═══════════════════════════════════════════════════════════════════════════
// Categorias
// ═══════════════════════════════════════════════════════════════════════════
export const CATEGORIAS = [
  'acordo',
  'financeiro',
  'usuario',
  'autenticacao',
  'seguranca',
  'configuracao',
  'importacao',
  'whatsapp',
  'ouvidoria',
  'meta',
  'lixeira',
  'comunicacao',
  'sistema',
] as const;

export type CategoriaLog = (typeof CATEGORIAS)[number];

export interface CategoriaMeta {
  label: string;
  /** Nome do ícone lucide-react, resolvido pela tela. */
  icone: string;
  /** Classes de cor do badge (fundo/texto/borda), em tokens do tema. */
  cor: string;
  /** Cor sólida para o gráfico — precisa existir em light e dark. */
  hex: string;
  descricao: string;
}

export const CATEGORIA_META: Record<CategoriaLog, CategoriaMeta> = {
  acordo: {
    label: 'Acordos',
    icone: 'FileText',
    cor: 'bg-primary/10 text-primary border-primary/25',
    hex: '#3b82f6',
    descricao: 'Criação, edição, status, exclusão e titularidade de NR',
  },
  financeiro: {
    label: 'Financeiro',
    icone: 'DollarSign',
    cor: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25',
    hex: '#10b981',
    descricao: 'Pix automático, comissões, aprovações e pagamentos',
  },
  usuario: {
    label: 'Usuários',
    icone: 'Users',
    cor: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/25',
    hex: '#8b5cf6',
    descricao: 'Cadastro, cargo, situação e desligamento',
  },
  autenticacao: {
    label: 'Acesso',
    icone: 'LogIn',
    cor: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/25',
    hex: '#0ea5e9',
    descricao: 'Entradas, saídas e tentativas recusadas',
  },
  seguranca: {
    label: 'Segurança',
    icone: 'ShieldAlert',
    cor: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/25',
    hex: '#ef4444',
    descricao: 'Permissões, impersonação, senhas e concessão de acesso',
  },
  configuracao: {
    label: 'Configuração',
    icone: 'Settings',
    cor: 'bg-slate-500/10 text-slate-600 dark:text-slate-300 border-slate-500/25',
    hex: '#64748b',
    descricao: 'Setores, equipes, tags, regras e documentos',
  },
  importacao: {
    label: 'Importação',
    icone: 'Upload',
    cor: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25',
    hex: '#f59e0b',
    descricao: 'Planilhas, analítico, recebimento diário e validações',
  },
  whatsapp: {
    label: 'WhatsApp',
    icone: 'MessageSquare',
    cor: 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/25',
    hex: '#22c55e',
    descricao: 'Solicitações, lembretes e atendimento',
  },
  ouvidoria: {
    label: 'Ouvidoria',
    icone: 'Headphones',
    cor: 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/25',
    hex: '#14b8a6',
    descricao: 'Atendimentos e acessos à ouvidoria',
  },
  meta: {
    label: 'Metas',
    icone: 'Target',
    cor: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/25',
    hex: '#6366f1',
    descricao: 'Metas, quartis, feriados e validação do mês',
  },
  lixeira: {
    label: 'Lixeira',
    icone: 'Trash2',
    cor: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/25',
    hex: '#f97316',
    descricao: 'Envio para a lixeira, restauração e expurgo',
  },
  comunicacao: {
    label: 'Comunicação',
    icone: 'Megaphone',
    cor: 'bg-pink-500/10 text-pink-600 dark:text-pink-400 border-pink-500/25',
    hex: '#ec4899',
    descricao: 'Modelos de mensagem e comemorações',
  },
  sistema: {
    label: 'Sistema',
    icone: 'Server',
    cor: 'bg-muted text-muted-foreground border-border',
    hex: '#94a3b8',
    descricao: 'Rotinas automáticas e eventos sem dono',
  },
};

export function categoriaMeta(categoria: string | null | undefined): CategoriaMeta {
  return CATEGORIA_META[(categoria ?? 'sistema') as CategoriaLog] ?? CATEGORIA_META.sistema;
}

// ═══════════════════════════════════════════════════════════════════════════
// Severidade
// ═══════════════════════════════════════════════════════════════════════════
export const SEVERIDADES = ['critico', 'aviso', 'info'] as const;
export type SeveridadeLog = (typeof SEVERIDADES)[number];

export const SEVERIDADE_META: Record<SeveridadeLog, {
  label: string;
  cor: string;
  ponto: string;
  hex: string;
  /** Ordem de urgência — usada para ordenar por gravidade. */
  peso: number;
}> = {
  critico: {
    label: 'Crítico',
    cor: 'bg-destructive/10 text-destructive border-destructive/30',
    ponto: 'bg-destructive',
    hex: '#ef4444',
    peso: 3,
  },
  aviso: {
    label: 'Aviso',
    cor: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30',
    ponto: 'bg-amber-500',
    hex: '#f59e0b',
    peso: 2,
  },
  info: {
    label: 'Informação',
    cor: 'bg-muted text-muted-foreground border-border',
    ponto: 'bg-muted-foreground/50',
    hex: '#94a3b8',
    peso: 1,
  },
};

export function severidadeMeta(severidade: string | null | undefined) {
  return SEVERIDADE_META[(severidade ?? 'info') as SeveridadeLog] ?? SEVERIDADE_META.info;
}

// ═══════════════════════════════════════════════════════════════════════════
// Origem
// ═══════════════════════════════════════════════════════════════════════════
export const ORIGENS = ['ui', 'trigger', 'api', 'importacao', 'automatico', 'anon'] as const;
export type OrigemLog = (typeof ORIGENS)[number];

export const ORIGEM_LABEL: Record<OrigemLog, string> = {
  ui:          'Tela',
  trigger:     'Banco de dados',
  api:         'Servidor',
  importacao:  'Importação',
  automatico:  'Rotina automática',
  anon:        'Sem sessão',
};

export function origemLabel(origem: string | null | undefined): string {
  return ORIGEM_LABEL[(origem ?? 'ui') as OrigemLog] ?? origem ?? 'Tela';
}

// ═══════════════════════════════════════════════════════════════════════════
// Ações
// ═══════════════════════════════════════════════════════════════════════════
/**
 * Ações com nome próprio. As demais seguem a convenção `<alvo>_<verbo>` e são
 * resolvidas por `descreverAcao()` sem precisar de entrada aqui — o catálogo
 * existe para dar nome melhor, não para autorizar.
 */
export const ACAO_LABEL: Record<string, string> = {
  // ── Acesso ────────────────────────────────────────────────────────────────
  login:                       'Entrou no sistema',
  login_recusado:              'Login recusado',
  logout:                      'Saiu do sistema',
  sessao_expirada:             'Sessão expirada',
  acesso_negado:               'Acesso negado a uma área',

  // ── Segurança ─────────────────────────────────────────────────────────────
  senha_redefinida:            'Senha redefinida',
  senha_alterada:              'Senha alterada pelo próprio usuário',
  permissoes_alteradas:        'Permissões de cargo alteradas',
  impersonar_inicio:           'Entrou como outro usuário',
  impersonar_fim:              'Saiu do modo "entrar como"',
  logs_expurgados:             'Logs expurgados',
  logs_exportados:             'Logs exportados',
  dados_exportados:            'Dados exportados',

  // ── Acordos ───────────────────────────────────────────────────────────────
  acordo_criado:               'Acordo criado',
  acordo_alterado:             'Acordo alterado',
  acordo_excluido:             'Acordo excluído',
  acordo_status_alterado:      'Status do acordo alterado',
  acordo_excluido_em_lote:     'Acordos excluídos em lote',
  acordo_extra_trocado:        'Extra trocado',
  acordo_transferido:          'Acordo transferido',
  acordo_restaurado:           'Acordo restaurado da lixeira',
  acordo_lido_por_imagem:      'Acordo lido por imagem',
  nr_titularidade_criado:      'Titularidade de NR registrada',
  nr_titularidade_alterado:    'Titularidade de NR alterada',
  nr_titularidade_excluido:    'Titularidade de NR liberada',
  autorizacao_lider_concedida: 'Autorização de líder concedida',
  autorizacao_lider_recusada:  'Autorização de líder recusada',

  // ── Usuários ──────────────────────────────────────────────────────────────
  usuario_criado:              'Usuário criado',
  usuario_alterado:            'Usuário alterado',
  usuario_excluido:            'Usuário excluído',
  usuario_cargo_alterado:      'Cargo alterado',
  usuario_situacao_alterada:   'Situação do usuário alterada',
  termo_aceito:                'Termo de uso aceito',

  // ── Financeiro ────────────────────────────────────────────────────────────
  pix_registro_criado:         'Pix automático registrado',
  pix_registro_alterado:       'Pix automático alterado',
  pix_registro_excluido:       'Pix automático excluído',
  pix_config_alterado:         'Configuração do Pix alterada',
  pix_meta_alterado:           'Meta de Pix alterada',
  // O arquivo sai do sistema com nome, valor e meta de cada operador — quem
  // baixou e quando precisa ficar registrado.
  fechamento_mes_baixado:      'Relatório de fechamento do mês baixado',

  // ── Importação ────────────────────────────────────────────────────────────
  importacao_iniciada:         'Importação iniciada',
  importacao_concluida:        'Importação concluída',
  importacao_falhou:           'Importação falhou',
  composicao_mes_regerado:     'Composição do mês regerada',
  /*
   * Legado, e já expurgado.
   *
   * Até 15/08/2026 a composição era auditada linha a linha: uma execução
   * gravava ~240 destas, e em quatro dias elas somaram 11.309 linhas — 64% da
   * trilha inteira. A fonte foi estancada na migration 20260815122118 e as
   * linhas antigas saíram na 20260817120000, que registrou o expurgo.
   *
   * Os rótulos ficam porque a trilha não deve mostrar código cru para uma linha
   * que volte de backup, e porque `composicao_mes` é tabela DERIVADA: se
   * alguém reauditá-la linha a linha, é aqui que o nome vai aparecer de novo — e
   * é o sinal de que a regressão voltou.
   */
  composicao_mes_criado:       'Composição do mês (linha criada)',
  composicao_mes_excluido:     'Composição do mês (linha excluída)',

  // ── WhatsApp ──────────────────────────────────────────────────────────────
  whatsapp_lembrete_enviado:   'Lembrete de WhatsApp enviado',
  whatsapp_fila_enviada:       'Fila de WhatsApp enviada',
  solicitacao_wpp_criado:      'Solicitação de WhatsApp aberta',
  solicitacao_wpp_alterado:    'Solicitação de WhatsApp atualizada',
  solicitacao_wpp_excluido:    'Solicitação de WhatsApp excluída',

  // ── Legado normalizado pela migration 20260812a ───────────────────────────
  registro_criado:             'Registro criado',
  registro_alterado:           'Registro alterado',
  registro_excluido:           'Registro excluído',
};

/** Verbos da convenção `<alvo>_<verbo>`, para humanizar o que não tem entrada. */
const VERBOS: Record<string, string> = {
  criado:     'criado',
  criada:     'criada',
  alterado:   'alterado',
  alterada:   'alterada',
  excluido:   'excluído',
  excluida:   'excluída',
  restaurado: 'restaurado',
  enviado:    'enviado',
  aprovado:   'aprovado',
  pago:       'pago',
};

/** Alvos conhecidos, para a humanização de fallback. */
const ALVO_LABEL: Record<string, string> = {
  acordo:            'Acordo',
  lixeira_item:      'Item da lixeira',
  nr_titularidade:   'Titularidade de NR',
  usuario:           'Usuário',
  cargo_permissoes:  'Permissões do cargo',
  empresa:           'Empresa',
  setor:             'Setor',
  equipe:            'Equipe',
  equipe_lideranca:  'Liderança de equipe',
  equipe_clone:      'Clone de operador',
  meta:              'Meta',
  meta_config:       'Configuração de metas',
  meta_validacao:    'Validação de meta',
  direto_extra:      'Regra Direto/Extra',
  modelo_mensagem:   'Modelo de mensagem',
  tag:               'Tag',
  documento_lgpd:    'Documento LGPD',
  termo_uso:         'Termo de uso',
  pix_registro:      'Registro de Pix',
  pix_config:        'Configuração do Pix',
  pix_meta:          'Meta de Pix',
  pix_lixeira:       'Pix na lixeira',
  // Auditadas a partir da migration 20260817120000.
  pix_nr_registro:        'Registro de NR do Pix',
  ai_config:              'Configuração de IA',
  contribuicao_receptivo: 'Contribuição do receptivo',
  atendimento_responsavel: 'Responsável pelo atendimento',
  solicitacao_wpp:   'Solicitação de WhatsApp',
  ouvidoria_acesso:  'Acesso à ouvidoria',
  ouvidoria_atend:   'Atendimento de ouvidoria',
  relatorio_dia:     'Validação do dia',
  composicao_mes:    'Composição do mês',
  campanha_desconto: 'Desconto de campanha',
  comemoracao:       'Comemoração',
  relatorio_fechamento: 'Relatório de fechamento',
  registro:          'Registro',
};

export function alvoLabel(alvo: string | null | undefined): string {
  if (!alvo) return '—';
  return ALVO_LABEL[alvo] ?? alvo.replace(/_/g, ' ');
}

/**
 * Nome legível de uma ação. Nunca vazio.
 *
 * 1. Catálogo, quando existe.
 * 2. Convenção `<alvo>_<verbo>` — cobre toda tabela auditada por trigger, mesmo
 *    as que forem adicionadas depois desta versão.
 * 3. Último recurso: a própria ação com underscores virando espaço.
 */
export function descreverAcao(acao: string | null | undefined): string {
  if (!acao) return 'Evento sem nome';

  const doCatalogo = ACAO_LABEL[acao];
  if (doCatalogo) return doCatalogo;

  const partes = acao.split('_');
  const verbo = partes[partes.length - 1];
  if (VERBOS[verbo] && partes.length > 1) {
    const alvo = partes.slice(0, -1).join('_');
    return `${alvoLabel(alvo)} ${VERBOS[verbo]}`;
  }

  const texto = acao.replace(/_/g, ' ');
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/**
 * Categoria provável de uma ação, para linhas que ainda não têm a coluna
 * preenchida (histórico gravado por caminhos que não passaram pelo serviço).
 */
export function inferirCategoria(acao: string | null | undefined): CategoriaLog {
  const a = acao ?? '';
  if (/^login|^logout|^sessao/.test(a))                        return 'autenticacao';
  if (/^senha|^permissoes|^impersonar|^logs_|^acesso_negado/.test(a)) return 'seguranca';
  if (/^acordo|^nr_titularidade|^autorizacao_lider/.test(a))   return 'acordo';
  if (/^pix_/.test(a))                                         return 'financeiro';
  if (/^usuario|^termo_/.test(a))                              return 'usuario';
  if (/^importacao/.test(a))                                   return 'importacao';
  if (/^whatsapp|^solicitacao_wpp/.test(a))                    return 'whatsapp';
  if (/^meta/.test(a))                                         return 'meta';
  if (/^lixeira/.test(a))                                      return 'lixeira';
  if (/^ouvidoria/.test(a))                                    return 'ouvidoria';
  return 'sistema';
}

// ═══════════════════════════════════════════════════════════════════════════
// Campos
// ═══════════════════════════════════════════════════════════════════════════
/**
 * Rótulo de coluna em português. Espelha `fn_log_rotulo_campo` da migration
 * 20260812a (a frase pronta vem do banco; isto serve à tabela de diferenças,
 * que é montada aqui) e vai além dela, porque a tela mostra campo a campo.
 */
export const CAMPO_LABEL: Record<string, string> = {
  nome_cliente:        'Cliente',
  nr_cliente:          'NR',
  codigo_cliente:      'Código do cliente',
  valor:               'Valor',
  valor_total:         'Valor total',
  vencimento:          'Vencimento',
  status:              'Status',
  tipo:                'Tipo',
  tipo_vinculo:        'Direto/Extra',
  parcelas:            'Parcelas',
  numero_parcela:      'Número da parcela',
  observacoes:         'Observações',
  operador_id:         'Operador',
  operador_nome:       'Operador',
  setor_id:            'Setor',
  equipe_id:           'Equipe',
  lider_id:            'Líder',
  instituicao:         'Instituição',
  estado_uf:           'Estado',
  data_cadastro:       'Data de cadastro',
  data_pagamento:      'Data de pagamento',
  pago_em:             'Pago em',
  pago:                'Pagamento',
  pago_por_nome:       'Pago por',
  avaliado_por_nome:   'Avaliado por',
  avaliado_em:         'Avaliado em',
  usou_quarenta_pct:   'Usou 40%',
  tag_ids:             'Tags',
  whatsapp:            'WhatsApp',
  vinculo_operador_id: 'Operador do vínculo',
  vinculo_operador_nome: 'Operador do vínculo',
  perfil:              'Cargo',
  ativo:               'Ativo',
  situacao:            'Situação',
  arquivado:           'Arquivado',
  desligado_em:        'Desligamento',
  email:               'E-mail',
  usuario:             'Usuário',
  nome:                'Nome',
  permissoes:          'Permissões',
  cargo:               'Cargo',
  meta_valor:          'Meta de valor',
  meta_acordos:        'Meta de acordos',
  meta_proporcional:   'Meta proporcional',
  referencia_id:       'Referência',
  quartis:             'Quartis',
  feriados:            'Feriados',
  contar_dia_atual:    'Conta o dia atual',
  pct:                 'Percentual',
  pct_comissao:        'Percentual de comissão',
  permite_registro_operador: 'Operador pode registrar',
  nivel:               'Nível de acesso',
  conteudo:            'Conteúdo',
  cor:                 'Cor',
  escopo:              'Escopo',
  titulo:              'Título',
  versao:              'Versão',
  motivo:              'Motivo',
  mensagem:            'Mensagem',
  categoria:           'Categoria',
  responsavel_id:      'Responsável',
  solicitante_id:      'Solicitante',
  finalizado_em:       'Finalizado em',
  iniciado_em:         'Iniciado em',
  treinamento:         'Em treinamento',
  alternativo:         'Alternativo',
  descricao:           'Descrição',
  slug:                'Slug',
  config:              'Configuração',
  expira_em:           'Expira em',
  excluido_em:         'Excluído em',
  transferido_para_nome: 'Transferido para',
  autorizado_por_nome: 'Autorizado por',
  nr_value:            'NR',
  campo:               'Campo do NR',
};

export function campoLabel(campo: string): string {
  return CAMPO_LABEL[campo] ?? campo.replace(/_/g, ' ');
}

// ═══════════════════════════════════════════════════════════════════════════
// Valores
// ═══════════════════════════════════════════════════════════════════════════
const STATUS_ACORDO_LABEL: Record<string, string> = {
  verificar_pendente: 'Verificar/Pendente',
  pago:               'Pago',
  nao_pago:           'Não pago',
};

const CARGO_LABEL: Record<string, string> = {
  operador:      'Operador',
  lider:         'Líder',
  administrador: 'Administrador',
  super_admin:   'Super Admin',
  elite:         'Elite',
  gerencia:      'Gerência',
  diretoria:     'Diretoria',
  ouvidoria:     'Ouvidoria',
};

/**
 * Valor de campo pronto para leitura.
 *
 * O JSONB do log guarda o valor cru do banco: `null`, `true`, `"2026-08-12"`,
 * `1234.5`, um UUID, um array. Mostrar isso como está transfere para quem lê o
 * trabalho de decifrar — e UUID cru não se decifra.
 *
 * `campo` orienta a formatação: valor em dinheiro, data em pt-BR, status e
 * cargo pelos rótulos do produto, UUID encurtado (a tela mostra o nome quando
 * o log trouxe o nome ao lado, como `operador_nome`).
 */
export function formatarValorLog(campo: string, valor: unknown): string {
  if (valor === null || valor === undefined || valor === '') return '—';

  if (typeof valor === 'boolean') return valor ? 'Sim' : 'Não';

  if (Array.isArray(valor)) {
    if (valor.length === 0) return 'nenhum';
    return `${valor.length} item(ns)`;
  }

  if (campo === 'status' && typeof valor === 'string') {
    return STATUS_ACORDO_LABEL[valor] ?? valor;
  }

  if ((campo === 'perfil' || campo === 'cargo') && typeof valor === 'string') {
    return CARGO_LABEL[valor] ?? valor;
  }

  if (typeof valor === 'number') {
    if (/valor|meta_valor|total/.test(campo)) {
      return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }
    if (/pct/.test(campo)) return `${valor}%`;
    return valor.toLocaleString('pt-BR');
  }

  if (typeof valor === 'object') {
    return JSON.stringify(valor);
  }

  const texto = String(valor);

  // Dinheiro em coluna NUMERIC chega como string ("1234.50").
  if (/^(valor|valor_total|meta_valor)$/.test(campo) && /^-?\d+(\.\d+)?$/.test(texto)) {
    return Number(texto).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  // Timestamp completo.
  if (/^\d{4}-\d{2}-\d{2}T/.test(texto)) {
    const d = new Date(texto);
    if (!Number.isNaN(d.getTime())) return d.toLocaleString('pt-BR');
  }

  // Data pura (vencimento, data_cadastro) — sem `new Date()`, que interpreta
  // "2026-08-12" como UTC e mostra 11/08 para quem está em São Paulo.
  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
    const [ano, mes, dia] = texto.split('-');
    return `${dia}/${mes}/${ano}`;
  }

  // UUID: encurta. Mostrar 36 caracteres de identificador não informa nada.
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(texto)) {
    return `${texto.slice(0, 8)}…`;
  }

  return texto;
}

// ═══════════════════════════════════════════════════════════════════════════
// Diferenças
// ═══════════════════════════════════════════════════════════════════════════
export interface DiferencaLog {
  campo: string;
  label: string;
  antes: string;
  depois: string;
  /** `true` quando o campo saiu do nada (criação) ou virou nada. */
  novo: boolean;
  removido: boolean;
}

type JsonObj = Record<string, unknown> | null | undefined;

/**
 * Monta a tabela de diferenças a partir de `antes`/`depois`/`campos`.
 *
 * A lista de campos vem do banco (`campos TEXT[]`) e é a fonte da ordem; se
 * estiver ausente — linha antiga, ou evento gravado só com `depois` —, as
 * chaves dos dois objetos são usadas.
 */
export function montarDiferencas(
  antes: JsonObj,
  depois: JsonObj,
  campos?: string[] | null,
): DiferencaLog[] {
  const a = (antes ?? {}) as Record<string, unknown>;
  const d = (depois ?? {}) as Record<string, unknown>;

  const chaves = campos?.length
    ? campos
    : Array.from(new Set([...Object.keys(a), ...Object.keys(d)])).sort();

  return chaves.map((campo) => {
    const temAntes = campo in a && a[campo] !== null && a[campo] !== undefined;
    const temDepois = campo in d && d[campo] !== null && d[campo] !== undefined;
    return {
      campo,
      label: campoLabel(campo),
      antes: formatarValorLog(campo, a[campo]),
      depois: formatarValorLog(campo, d[campo]),
      novo: !temAntes && temDepois,
      removido: temAntes && !temDepois,
    };
  });
}
