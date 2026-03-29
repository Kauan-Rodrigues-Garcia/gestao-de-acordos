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

export type PerfilUsuario = 'operador' | 'lider' | 'administrador';
export type StatusAcordo = 'verificar_pendente' | 'pago' | 'nao_pago';
export type TipoAcordo = 'boleto' | 'pix' | 'cartao' | 'cartao_recorrente' | 'pix_automatico';

export interface Setor {
  id: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
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
  criado_em: string;
  atualizado_em: string;
  setores?: Setor;
}

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
  observacoes: string | null;
  instituicao: string | null;
  criado_em: string;
  atualizado_em: string;
  perfis?: Perfil;
  setores?: Setor;
}

export interface HistoricoAcordo {
  id: string;
  acordo_id: string;
  usuario_id: string;
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
  mensagem: string;
  enviado_em: string;
}

export interface ModeloMensagem {
  id: string;
  nome: string;
  conteudo: string;
  ativo: boolean;
  criado_em: string;
}

export interface LogSistema {
  id: string;
  usuario_id: string | null;
  acao: string;
  tabela: string | null;
  registro_id: string | null;
  detalhes: Record<string, unknown> | null;
  criado_em: string;
  perfis?: Perfil;
}
