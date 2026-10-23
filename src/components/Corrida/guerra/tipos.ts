/** O estado da guerra de uma corrida, como o banco manda (`fn_corrida_guerra_json`, 20261023150000) e o ensaio imita. */
export interface RankingGuerra { usuario: string; nome: string; foto: string | null; dano: number }
export interface EstadoGuerra {
  corrida_id: number;
  ligada: boolean;
  versao?: number;
  agora?: string | null;
  cavalos?: number | null;
  /** A pressão que derruba todos (fixa quando a guerra começa). */
  alvo?: number | null;
  comecou_em?: string | null;
  pressao?: number;
  /** Sobrou um: começa o filme. */
  sobrou_em?: string | null;
  solta_em?: string | null;
  expira_em?: string | null;
  pessoas?: number;
  vida_max?: number | null;
  vida?: number | null;
  /** Quantos anjos ele já comeu (a cura), quando foi o último e quanto devolveu. */
  curas?: number;
  cura_em?: string | null;
  cura_vida?: number | null;
  ritmo?: number;
  caiu_em?: string | null;
  /** Quem clicou nos últimos 5 s. */
  atacando?: number;
  ranking?: RankingGuerra[];
  /** A chamada chegou fora da hora, ou cedo demais (o lote volta para o próximo). */
  fora?: boolean;
  freio?: boolean;
}
