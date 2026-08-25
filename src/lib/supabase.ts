import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

export type { Database };

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

let _instance: SupabaseClient<Database> | null = null;

function getSupabase(): SupabaseClient<Database> {
  if (_instance) return _instance;
  _instance = createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return _instance;
}

export const supabase = getSupabase();

/**
 * Cria um client isolado (sem persistência de sessão) para operações de
 * signUp administrativo. Criar um novo usuário com este client NÃO substitui
 * nem derruba a sessão do admin logado no client principal.
 */
export function createIsolatedAuthClient(): SupabaseClient<Database> {
  return createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

// Aliases de conveniência para operações de banco puras (sem campos de join)
export type AcordoRow    = Database['public']['Tables']['acordos']['Row'];
export type AcordoInsert = Database['public']['Tables']['acordos']['Insert'];
export type AcordoUpdate = Database['public']['Tables']['acordos']['Update'];

export type PerfilUsuario = 'operador' | 'lider' | 'administrador' | 'super_admin' | 'elite' | 'gerencia' | 'diretoria' | 'ouvidoria' | 'rh';
export type StatusAcordo = 'verificar_pendente' | 'pago' | 'nao_pago';
export type TipoAcordo = 'boleto' | 'pix' | 'cartao' | 'cartao_recorrente' | 'pix_automatico';

export interface Empresa {
  id: string;
  nome: string;
  slug: string;
  ativo: boolean;
  /**
   * Que operação esta empresa roda: `cobranca` | `comercial` | `rh`.
   *
   * BookPlay e PaguePlay são duas EMPRESAS do mesmo PRODUTO. Ver
   * `src/lib/produto.ts` e a migration 20260825170000.
   *
   * Opcional no tipo porque uma leitura antiga (`select` sem a coluna, ou uma
   * base onde a migration ainda não subiu) não pode quebrar a tela; quem lê usa
   * `produtoDaEmpresa`, que cai no slug.
   */
  produto?: string | null;
  config: Record<string, unknown>;
  criado_em: string;
  atualizado_em: string;
}

export interface Setor {
  id: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
  /** Setor alternativo (sem relatório próprio): acumulado = soma dos usuários
   *  que pertencem a ele (membros + clones), não o total do relatório. */
  alternativo?: boolean;
  empresa_id?: string;
  criado_em: string;
  atualizado_em: string;
}

export interface Perfil {
  id: string;
  nome: string;
  email: string;
  perfil: PerfilUsuario;
  ativo: boolean;
  lider_id: string | null;
  setor_id: string | null;
  equipe_id?: string | null;
  empresa_id?: string;
  usuario?: string;
  foto_url?: string | null;
  /** true após o usuário instalar e confirmar o userscript Tampermonkey (PaguePlay) */
  tampermonkey_configured?: boolean | null;
  /** true após o usuário dispensar a notificação da nova funcionalidade Chatplay */
  viu_notificacao_chatplay?: boolean | null;
  /** true após o usuário trocar a senha padrão pelo botão de chave (troca 1x) */
  senha_alterada?: boolean | null;
  /**
   * Quando a pessoa leu as boas-vindas do chat (migration 20260825240000).
   * `null` = ainda não viu, e o cartão aparece antes da primeira conversa.
   */
  chat_boas_vindas_em?: string | null;
  /**
   * Liberado pelo super_admin para enxergar as duas empresas (migration
   * 20260818300000). Só vale junto com cargo `gerencia`/`diretoria` — use
   * `perfilVeDuasEmpresas` em vez de ler a flag crua.
   */
  acesso_multiempresa?: boolean | null;
  /** Quem liberou o acesso às duas empresas, e quando. */
  acesso_multiempresa_por_id?: string | null;
  acesso_multiempresa_em?: string | null;
  /**
   * Despedida do pet (migration 20260809c): `'pendente'` = deve ver o card,
   * `'concluida'` = já se despediu, `null` = nunca conviveu com o pet.
   *
   * `undefined` (campo ausente) é a migration ainda não aplicada, e significa
   * algo diferente de `null` — ver `fasePet` em `components/pet/petConfig.ts`.
   */
  pet_despedida?: string | null;
  /** Situação operacional (item 5): 'ativo' | 'ferias' | 'desligado'.
   *  Férias/desligado somem de ranking e quartil; recebimento ainda conta.
   *  Desligado não loga. Ver migration 20260723c. */
  situacao?: SituacaoUsuario | null;
  /** Quando foi desligado — usado para arquivar na virada do mês. */
  desligado_em?: string | null;
  /** true após ser arquivado (desligado de mês anterior) — some das listas. */
  arquivado?: boolean | null;
  criado_em: string;
  atualizado_em: string;
  setores?: Setor;
  empresas?: Empresa;
}

export type SituacaoUsuario = 'ativo' | 'ferias' | 'desligado';

/*
 * SQL para adicionar colunas de parcelamento (executar no Supabase SQL editor):
 *
 * ALTER TABLE public.acordos ADD COLUMN IF NOT EXISTS acordo_grupo_id UUID DEFAULT NULL;
 * ALTER TABLE public.acordos ADD COLUMN IF NOT EXISTS numero_parcela INTEGER DEFAULT 1;
 * CREATE INDEX IF NOT EXISTS idx_acordos_grupo ON public.acordos(acordo_grupo_id) WHERE acordo_grupo_id IS NOT NULL;
 *
 * SQL para integração Chatplay (PaguePlay):
 *
 * ALTER TABLE public.perfis ADD COLUMN IF NOT EXISTS tampermonkey_configured BOOLEAN DEFAULT FALSE;
 * ALTER TABLE public.perfis ADD COLUMN IF NOT EXISTS viu_notificacao_chatplay BOOLEAN DEFAULT FALSE;
 */
export interface Acordo {
  id: string;
  nome_cliente: string;
  nr_cliente: string;
  data_cadastro: string;
  vencimento: string;
  valor: number;
  tipo: TipoAcordo;
  parcelas: number;
  whatsapp: string | null;
  status: StatusAcordo;
  operador_id: string;
  setor_id: string | null;
  empresa_id?: string;
  observacoes: string | null;
  /** Estado (UF) — coluna dedicada, substitui o hack [ESTADO:SP] em observacoes */
  estado_uf: string | null;
  instituicao: string | null;
  /** UUID que agrupa parcelas de um mesmo acordo parcelado */
  acordo_grupo_id?: string | null;
  /** Número desta parcela dentro do grupo (1-based) */
  numero_parcela?: number | null;
  /** Tipo de vínculo: 'direto' (padrão) ou 'extra' (NR/inscrição já vinculada a outro operador direto) */
  tipo_vinculo?: 'direto' | 'extra' | null;
  /** Quando tipo_vinculo = 'extra': ID do operador que detém o vínculo DIRETO do mesmo NR */
  vinculo_operador_id?: string | null;
  /** Quando tipo_vinculo = 'extra': nome do operador DIRETO (desnormalizado para exibição) */
  vinculo_operador_nome?: string | null;
  /** IDs das tags visuais aplicadas a este acordo */
  tag_ids?: string[] | null;
  /** Valor total do acordo parcelado — PaguePay only. NULL = comportamento antigo/Bookplay. */
  valor_total?: number | null;
  /** true quando a 1ª parcela usou a regra dos 40% (PaguePLAY parcelado). */
  usou_quarenta_pct?: boolean;
  /**
   * BookPlay: valor da ENTRADA quando o 1º pagamento foi negociado como tal.
   * NULL no acordo comum. A entrada é a parcela 1 de N; o valor das demais sai
   * de `valorDemaisParcelas` (src/lib/money.ts). Migration 20260805b.
   */
  valor_entrada?: number | null;
  criado_em: string;
  atualizado_em: string;
  /** Timestamp de quando o acordo foi marcado como pago (preenchido automaticamente pelo trigger) */
  pago_em?: string | null;
  /** Data real em que o pagamento foi recebido (preenchida manualmente pelo operador) */
  data_pagamento?: string | null;
  /** Join parcial: cada consulta seleciona somente os campos de perfil usados na tela. */
  perfis?: (Pick<Perfil, 'id' | 'nome'> & Partial<Perfil>) | null;
  /** Join parcial pelo mesmo motivo de `perfis`: PostgREST tipa o select exato. */
  setores?: (Pick<Setor, 'id' | 'nome'> & Partial<Setor>) | null;
  empresas?: Empresa;
}

export interface HistoricoAcordo {
  id: string;
  acordo_id: string;
  usuario_id: string;
   empresa_id?: string;
  campo_alterado: string;
  valor_anterior: string | null;
  valor_novo: string | null;
  criado_em: string;
  perfis?: Perfil;
}

export interface LogWhatsapp {
  id: string;
  acordo_id: string;
  usuario_id: string;
  empresa_id?: string;
  mensagem: string;
  enviado_em: string;
}

export interface ModeloMensagem {
  id: string;
  nome: string;
  conteudo: string;
  ativo: boolean;
  empresa_id?: string;
  criado_em: string;
}

/**
 * Uma linha da trilha de auditoria.
 *
 * Os campos a partir de `categoria` vieram com a migration 20260812a (Logs
 * 2.0). Todos opcionais no tipo porque o histórico anterior à migration existe
 * e é lido pela mesma tela — `descricao` nula, por exemplo, significa "linha
 * antiga", e a tela cai em `descreverAcao(acao)`.
 *
 * `usuario_nome`/`email`/`cargo` são desnormalizados de propósito: `usuario_id`
 * é ON DELETE SET NULL, e desligar alguém apagava a autoria de todo o histórico
 * dele.
 */
export interface LogSistema {
  id: string;
  usuario_id: string | null;
  acao: string;
  tabela: string | null;
  registro_id: string | null;
  empresa_id?: string;
  detalhes: Record<string, unknown> | null;
  criado_em: string;

  categoria?: string;
  severidade?: string;
  descricao?: string | null;
  usuario_nome?: string | null;
  usuario_email?: string | null;
  usuario_cargo?: string | null;
  alvo_tipo?: string | null;
  alvo_rotulo?: string | null;
  antes?: Record<string, unknown> | null;
  depois?: Record<string, unknown> | null;
  campos?: string[] | null;
  origem?: string;
  rota?: string | null;
  ip?: string | null;
  user_agent?: string | null;

  perfis?: Perfil;
  empresas?: { id: string; nome: string } | null;
}

export interface Notificacao {
  id: string;
  usuario_id: string;
  titulo: string;
  mensagem: string;
  lida: boolean;
  empresa_id?: string;
  acordo_id?: string | null;
  /**
   * Para onde o clique leva (caminho interno, ex: `/analitico?aba=diario`).
   * Migration 20260731a. Nulo nas linhas antigas — ver `rotaDaNotificacao`.
   */
  rota?: string | null;
  /**
   * Quem causou o aviso: escreveu a mensagem, excluiu o registro. Nulo quando
   * não há pessoa por trás (importação, expurgo por prazo) e nas linhas
   * anteriores à migration 20260811d.
   *
   * Nome e foto vêm DESNORMALIZADOS de propósito: o payload do realtime é a
   * linha crua, sem junção, e a foto precisa estar pronta no instante em que o
   * card aparece. Ver o cabeçalho da migration.
   */
  autor_id?:   string | null;
  autor_nome?: string | null;
  autor_foto?: string | null;
  criado_em: string;
}

// 'troca_extra' é gravado pelo fluxo de troca de vínculo EXTRA (AcordoNovoInline
// e AcordoForm) — o union estava desatualizado em relação ao runtime.
export type MotivoLixeira = 'exclusao_manual' | 'transferencia_nr' | 'troca_extra';

export interface LixeiraAcordo {
  id: string;
  acordo_id: string;
  empresa_id?: string;
  operador_id?: string;
  operador_nome?: string;
  nome_cliente?: string;
  nr_cliente?: string;
  valor?: number;
  vencimento?: string;
  tipo?: string;
  status?: string;
  observacoes?: string;
  instituicao?: string;
  dados_completos?: Record<string, unknown>;
  motivo: MotivoLixeira;
  autorizado_por_id?: string;
  autorizado_por_nome?: string;
  transferido_para_id?: string;
  transferido_para_nome?: string;
  excluido_em: string;
  expira_em?: string;
}

export interface AcordoTag {
  id: string;
  empresa_id: string;
  nome: string;
  cor: string;
  criado_em: string;
}

export interface Profissional {
  id: string;
  empresa_id: string;
  codigo: string;
  nome: string;
  telefone: string | null;
  estado_uf: string | null;
  criado_em: string;
  atualizado_em: string;
}

export type StatusTabulacaoAnalitico = 'nao_tabulado' | 'tabulado' | 'divergente';
export type FormaPagementoAnalitico  = 'boleto_pix' | 'cartao';

export interface PagamentoDetalheAnalitico {
  tpdoc: string;
  valor: number;
  total_ho: number;
  data: string; // 'yyyy-MM-dd'
}

export interface AnaliticoRecebimento {
  id: string;
  empresa_id: string;
  operador_id: string | null;
  operador_usuario: string;
  codigo: string;
  nome_cliente: string | null;
  /** Coluna "Empresa" do relatório BookPlay (bookplay, mundial editora...); null na PaguePlay */
  instituicao?: string | null;
  forma_pagamento: FormaPagementoAnalitico;
  /** Rótulo real da forma de pagamento na BookPlay (Boleto, Pix, Pix Automático,
   *  Cartão Recorrente, Cartão de Crédito); null na PaguePlay. */
  forma_detalhe?: string | null;
  /** Coluna "Tipo comissão" do relatório (Extra / Integral). Migration 20260813a. */
  tipo_comissao?: string | null;
  valor_recebido: number;
  total_ho: number;
  data_pagamento: string;   // DATE → 'yyyy-MM-dd'
  mes_referencia: string;   // DATE → 'yyyy-MM-01'
  acordo_id: string | null;
  status_tabulacao: StatusTabulacaoAnalitico;
  visto: boolean;
  importado_por_id: string | null;
  importado_em: string;
  lote_id: string;
  /** Setor da importação — dá dono aos órfãos (sem operador). Pode não existir
   *  no banco enquanto a migration 20260712a não for aplicada. */
  setor_id?: string | null;
  /** Preenchido quando 2+ pagamentos (ex: BOLETO + PIX) foram consolidados nesta linha */
  pagamentos_detalhados?: PagamentoDetalheAnalitico[] | null;
  /** Join opcional: nome do perfil do operador */
  perfis?: Pick<Perfil, 'id' | 'nome' | 'usuario'> | null;
}

export interface DiarioRecebimento {
  id: string;
  empresa_id: string;
  operador_id: string | null;
  operador_usuario: string;
  /** Coluna "Cód.Cliente" do relatório, só dígitos. Substituiu o CPF (20260728b). */
  cliente_codigo: string | null;
  nome_cliente: string | null;
  acordo_codigo: string | null;
  /** Coluna "Empresa" do relatório BookPlay (bookplay, mundial editora...); null na PaguePlay */
  instituicao?: string | null;
  forma_pagamento: string;    // texto bruto (Pix, Boleto, Cartão Padrão…)
  valor_recebido: number;
  data_pagamento: string | null; // DATE → 'yyyy-MM-dd'
  dia_referencia: string;        // DATE → 'yyyy-MM-dd' (dia do relatório)
  prox_contato: string | null;   // DATE → 'yyyy-MM-dd'; ≤ dia_referencia → acordo ignorado
  tabulacao: string | null;
  id_baixa: string | null;
  chave_unica: string;
  import_index: number;
  visto: boolean;
  importado_por_id: string | null;
  importado_em: string;
  lote_id: string;
  /** Join opcional: nome do perfil do operador */
  perfis?: Pick<Perfil, 'id' | 'nome' | 'usuario'> | null;
}

/** Estado do pet Aura no banco — 1 linha por usuário (ver 20260709a_pet_economia.sql). */
export interface PetEstado {
  usuario_id: string;
  moedas: number;
  moedas_ganhas_total: number;
  moedas_gastas_total: number;
  xp: number;
  nivel: number;
  streak: number;
  ultimo_dia_ativo: string | null;
  roupa_equipada: string;
  itens_desbloqueados: string[];
  dormindo: boolean;
  criado_em: string;
  atualizado_em: string;
}

/** Item do catálogo/mercado do pet (ver 20260710b_pet_economia_estrutura.sql). */
export interface PetItem {
  id: string;
  tipo: 'roupa' | 'comida' | 'movel' | 'trofeu' | 'colecionavel';
  nome: string;
  descricao: string | null;
  emoji: string | null;
  raridade: 'comum' | 'raro' | 'epico' | 'lendario' | 'exclusivo';
  preco_moedas: number | null;      // null = não vendável (só concedido)
  tenant: string | null;            // null = ambos; 'bookplay' | 'pagueplay'
  disponivel_de: string | null;
  disponivel_ate: string | null;
  exclusivo: boolean;
  ativo: boolean;
  ordem: number;
  criado_em: string;
}

/** Item que o usuário possui (comprou/ganhou). "Bloqueado" = não está aqui. */
export interface PetInventarioItem {
  usuario_id: string;
  item_id: string;
  origem: 'compra' | 'recompensa' | 'concessao' | 'evento' | 'inicial';
  adquirido_em: string;
}

/** Regra de economia por cargo — o sistema de moedas difere por cargo. */
export interface PetEconomiaRegra {
  cargo: string;
  moedas_por_real: number;
  janela_dias: number;
  base_recebimento: 'proprio' | 'empresa' | 'equipe';
  ativo: boolean;
  observacao: string | null;
  atualizado_em: string;
}

/** Faixa de quartil por % mínimo de projeção (1 = melhor). Configurável na aba Metas. */
export interface QuartilConfig {
  quartil: number;   // 1..4
  min_pct: number;   // % mínimo de projeção para entrar neste quartil
}

/** Config mensal de metas — feriados e quartis (ver 20260710c_metas_config_analitico_dashboard.sql). */
export interface MetasConfigMes {
  id: string;
  empresa_id: string;
  mes: number;
  ano: number;
  feriados: string[];        // ['yyyy-MM-dd', ...]
  quartis: QuartilConfig[];
  /** Contar o dia de hoje nos dias úteis decorridos (migration 20260714a).
   *  Padrão FALSE: o dia atual ainda está acontecendo e infla o esperado. */
  contar_dia_atual?: boolean | null;
  atualizado_por: string | null;
  criado_em: string;
  atualizado_em: string;
}

/** Linha agregada de fn_analitico_dashboard_mes (dia × operador × forma × tabulação). */
export interface AnaliticoDashboardLinha {
  dia: string;               // 'yyyy-MM-dd'
  operador_id: string | null;
  /**
   * Setor carimbado na importação (migration 20260802a), já com o fallback no
   * setor de quem importou. É o que permite ao dashboard somar o setor pela
   * mesma regra da aba Analítico.
   *
   * `undefined` enquanto a 20260802a não estiver aplicada — ver
   * `temCarimboDeSetor` em `escopoAnalitico.ts`.
   */
  setor_id?: string | null;
  forma_pagamento: 'boleto_pix' | 'cartao';
  /** Rótulo real da forma (BookPlay: Boleto, Pix, Pix Automático…); NULL na PaguePlay. */
  forma_detalhe: string | null;
  status_tabulacao: 'tabulado' | 'nao_tabulado' | 'divergente';
  total: number;
  total_ho: number;
  qtd: number;
}

export type TipoDocumentoLgpd =
  | 'politica_privacidade'
  | 'ropa'
  | 'aviso_privacidade_interno'
  | 'politica_retencao_descarte'
  | 'plano_resposta_incidentes'
  | 'termo_responsabilidade_operador';

export interface DocumentoLgpd {
  id: string;
  empresa_id: string | null;
  tipo: TipoDocumentoLgpd;
  titulo: string;
  conteudo: string;
  versao: string;
  criado_em: string;
  atualizado_em: string;
}

export interface TermoUso {
  id: string;
  empresa_id: string;
  versao: string;
  titulo: string;
  conteudo: string;
  ativo: boolean;
  criado_em: string;
}

export interface AceiteTermo {
  id: string;
  usuario_id: string;
  termo_id: string;
  aceito_em: string;
  ip: string | null;
  user_agent: string | null;
}
