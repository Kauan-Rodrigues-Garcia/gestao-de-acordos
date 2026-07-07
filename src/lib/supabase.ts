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

export type PerfilUsuario = 'operador' | 'lider' | 'administrador' | 'super_admin' | 'elite' | 'gerencia' | 'diretoria';
export type StatusAcordo = 'verificar_pendente' | 'pago' | 'nao_pago';
export type TipoAcordo = 'boleto' | 'pix' | 'cartao' | 'cartao_recorrente' | 'pix_automatico';

export interface Empresa {
  id: string;
  nome: string;
  slug: string;
  ativo: boolean;
  config: Record<string, unknown>;
  criado_em: string;
  atualizado_em: string;
}

export interface Setor {
  id: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
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
  criado_em: string;
  atualizado_em: string;
  setores?: Setor;
  empresas?: Empresa;
}

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
  criado_em: string;
  atualizado_em: string;
  /** Timestamp de quando o acordo foi marcado como pago (preenchido automaticamente pelo trigger) */
  pago_em?: string | null;
  /** Data real em que o pagamento foi recebido (preenchida manualmente pelo operador) */
  data_pagamento?: string | null;
  perfis?: Perfil;
  setores?: Setor;
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

export interface LogSistema {
  id: string;
  usuario_id: string | null;
  acao: string;
  tabela: string | null;
  registro_id: string | null;
  empresa_id?: string;
  detalhes: Record<string, unknown> | null;
  criado_em: string;
  perfis?: Perfil;
}

export interface Notificacao {
  id: string;
  usuario_id: string;
  titulo: string;
  mensagem: string;
  lida: boolean;
  empresa_id?: string;
  acordo_id?: string | null;
  criado_em: string;
}

export type MotivoLixeira = 'exclusao_manual' | 'transferencia_nr';

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
  cpf: string | null;
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
  cpf: string | null;
  nome_cliente: string | null;
  acordo_codigo: string | null;
  /** Coluna "Empresa" do relatório BookPlay (bookplay, mundial editora...); null na PaguePlay */
  instituicao?: string | null;
  forma_pagamento: string;    // texto bruto (Pix, Boleto, Cartão Padrão…)
  valor_recebido: number;
  data_pagamento: string | null; // DATE → 'yyyy-MM-dd'
  dia_referencia: string;        // DATE → 'yyyy-MM-dd' (dia do relatório)
  prox_contato: string | null;   // DATE → 'yyyy-MM-dd'; ≤ hoje → acordo ignorado
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
