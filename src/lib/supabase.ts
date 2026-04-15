import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

function getSupabase(): SupabaseClient {
  if (typeof window !== 'undefined') {
    if (!(window as any).__supabaseInstance) {
      (window as any).__supabaseInstance = createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      });
    }
    return (window as any).__supabaseInstance;
  }
  
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}

export const supabase = getSupabase();

export type PerfilUsuario = 'operador' | 'lider' | 'administrador' | 'super_admin';
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
  empresa_id?: string;
  usuario?: string;
  foto_url?: string | null;
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
  instituicao: string | null;
  /** UUID que agrupa parcelas de um mesmo acordo parcelado */
  acordo_grupo_id?: string | null;
  /** Número desta parcela dentro do grupo (1-based) */
  numero_parcela?: number | null;
  criado_em: string;
  atualizado_em: string;
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
  criado_em: string;
}

export interface AIConfig {
  id: string;
  enabled: boolean;
  model: string;
  temperature: number;
  max_rows: number;
  max_cols: number;
  prompt_system: string;
  empresa_id?: string;
  updated_at: string;
}
