/**
 * tipos.ts — o formato do Modo TV 2, igual ao que o banco guarda e devolve.
 *
 * O painel mora em `tv_paineis` (migration 20261027170000). As telas são um
 * jsonb livre: o banco só limita o tamanho, e quem decide o formato é
 * `templates.ts`. Por isso todo leitor daqui é defensivo — um campo que falta
 * vira o padrão do template, nunca um erro na parede.
 */

export type TemaId = 'noite' | 'grafite' | 'oceano' | 'floresta' | 'vinho' | 'claro';
export type Unidade = 'ho' | 'bruto';

export type TemplateId =
  | 'contagem' | 'barra' | 'anel' | 'hoje' | 'ritmo' | 'placar' | 'grafico'
  | 'podio' | 'lista' | 'destaque'
  | 'imagem' | 'video' | 'recado';

/** Uma tela do rodízio. `opcoes` é o que o líder ajustou; o resto é padrão. */
export interface TelaDoPainel {
  id: string;
  template: TemplateId;
  opcoes: Record<string, unknown>;
  /** Tempo desta tela, em segundos. Nulo = o padrão do painel. */
  segundos?: number | null;
}

export interface Painel {
  id: string;
  nome: string;
  tema: TemaId;
  unidade: Unidade;
  segundos_por_tela: number;
  telas: TelaDoPainel[];
  /** Id da tela em que a TV está parada. Nulo = rodízio. */
  tela_fixa: string | null;
  setor_id?: string;
  equipe_id?: string | null;
  atualizado_em?: string;
}

export interface PessoaRanking {
  id: string;
  nome: string;
  foto: string | null;
  valor: number;
  valor_ho: number;
}

/**
 * O 1º de um dia (ou do mês) no setor ou numa equipe (20261029230000).
 * `escopo` = 'setor' ou o id da equipe; `dia` = 'YYYY-MM-DD' ou 'mes'.
 */
export interface DestaqueTv {
  escopo: string;
  dia: string;
  id: string;
  nome: string;
  foto: string | null;
  valor: number;
  valor_ho: number;
  pagamentos: number;
}

/** O pacote de `fn_tv_numeros_calcular`. */
export interface NumerosTv {
  alvo_nome: string;
  alvo_tipo: 'setor' | 'equipe';
  regra: 'nosso_produto' | 'cofen';
  ho_percentual: unknown;
  mes: string;
  hoje: string;
  meta: number;
  recebido: number;
  recebido_ho: number;
  recebido_hoje: number;
  recebido_hoje_ho: number;
  pagamentos: number;
  dias_uteis: number;
  dias_decorridos: number;
  ranking: PessoaRanking[];
  /** Dinheiro de cada dia com movimento (20261027200000). Formato do mês, não o total. */
  serie?: { dia: string; valor: number; valor_ho: number }[];
  /** A cena «Destaque» (20261029230000). Faltam no cache antigo. */
  destaques?: DestaqueTv[];
  equipes?: { id: string; nome: string }[];
  equipe_id?: string | null;
  setor_nome?: string;
  calculado_em: string;
  /** Hora do banco na resposta da prévia (20261027190000). */
  agora?: string;
}

/** A resposta de `fn_tv_ver`. */
export type RespostaTv =
  | { estado: 'desconhecida' | 'expirada' }
  | { estado: 'aguardando'; codigo: string; expira_em: string }
  | { estado: 'conectada'; painel: Painel; numeros: NumerosTv | null; agora?: string };

/** A resposta de `fn_tv_versao`, a pergunta curta. */
export type VersaoTv =
  | { estado: 'desconhecida' | 'aguardando' }
  | { estado: 'conectada'; versao: string; agora?: string };

export interface AlvoTv {
  setor_id: string;
  setor_nome: string;
  equipe_id: string | null;
  equipe_nome: string | null;
  regra: string;
}

export interface ConexaoTv {
  id: string;
  painel_id: string;
  nome: string | null;
  conectada_em: string | null;
  ultimo_sinal: string | null;
  saiu_em: string | null;
  versao_exibida: string | null;
}
