/**
 * clima.ts — a previsão do tempo do Calendário (pedido de 06/11/2026), sem
 * desenho: os tipos, a cidade de cada setor, a estação e o sorteio do desenho.
 *
 * Quem busca a previsão é a rota `api/clima.ts` (uma resposta guardada na CDN
 * para todo mundo); os tipos abaixo são o espelho do que ela devolve. Quem
 * desenha é `components/Calendario/clima/`.
 *
 * Cada setor vê o tempo da cidade dele: Birigui ou Marília. Setor sem cidade,
 * ou de outra cidade, vê Birigui (Cleber, 06/11/2026: «só pra escolher um»).
 */

export type CondicaoClima =
  | 'limpo' | 'poucas_nuvens' | 'nublado' | 'neblina'
  | 'garoa' | 'chuva' | 'chuva_forte' | 'tempestade';

export interface ClimaAgora {
  temp: number;
  sensacao: number;
  condicao: CondicaoClima;
  noite: boolean;
  umidade: number | null;
  /** km/h */
  vento: number | null;
}

export interface ClimaDia {
  /** YYYY-MM-DD, horário de Brasília. */
  data: string;
  condicao: CondicaoClima;
  max: number;
  min: number;
  chuvaMm: number;
}

export interface Previsao {
  agora: ClimaAgora;
  dias: ClimaDia[];
}

export type CidadeClima = 'birigui' | 'marilia';

export interface RespostaClima {
  fonte: string;
  geradoEm: string;
  cidades: Partial<Record<CidadeClima, Previsao | null>>;
}

export type Estacao = 'verao' | 'outono' | 'inverno' | 'primavera';

export const NOME_DA_CIDADE: Record<CidadeClima, string> = {
  birigui: 'Birigui',
  marilia: 'Marília',
};

export const ROTULO_CONDICAO: Record<CondicaoClima, string> = {
  limpo: 'Céu limpo',
  poucas_nuvens: 'Poucas nuvens',
  nublado: 'Nublado',
  neblina: 'Neblina',
  garoa: 'Garoa',
  chuva: 'Chuva',
  chuva_forte: 'Chuva forte',
  tempestade: 'Tempestade',
};

/** O «céu limpo» de noite não é «sol». */
export function rotuloDaCondicao(c: CondicaoClima, noite: boolean): string {
  if (noite && c === 'limpo') return 'Noite limpa';
  if (!noite && c === 'limpo') return 'Sol';
  return ROTULO_CONDICAO[c];
}

function chave(nome: string): string {
  return nome.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

/** A cidade da previsão pelo nome da cidade do setor. Sem cidade, ou outra: Birigui. */
export function cidadeDoClima(nomeDaCidade: string | null | undefined): CidadeClima {
  return nomeDaCidade && chave(nomeDaCidade) === 'marilia' ? 'marilia' : 'birigui';
}

/**
 * A estação do dia, no hemisfério sul, pelas datas de sempre (a do
 * calendário escolar, não a astronômica ao minuto):
 * verão 21/12, outono 20/03, inverno 21/06, primavera 23/09.
 */
export function estacaoDoDia(iso: string): Estacao {
  const md = iso.slice(5, 10);
  if (md >= '12-21' || md < '03-20') return 'verao';
  if (md < '06-21') return 'outono';
  if (md < '09-23') return 'inverno';
  return 'primavera';
}

/**
 * Qual das `quantas` variações de desenho vale no dia. Depende só da data e
 * do que se sorteia (`semente`): todo mundo vê o mesmo desenho no mesmo dia, e
 * ele muda de um dia para o outro.
 */
export function varianteDoDia(iso: string, semente: string, quantas: number): number {
  if (quantas <= 1) return 0;
  let h = 2166136261;
  for (const ch of `${iso}|${semente}`) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % quantas;
}

const SEMANA = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];

/** «SÁB», «DOM»… de uma data YYYY-MM-DD. */
export function semanaCurta(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return SEMANA[new Date(y, m - 1, d).getDay()];
}

/** HH:MM de um ISO, no horário de Brasília. */
export function horaDeBrasilia(isoInstante: string): string {
  const ms = Date.parse(isoInstante);
  if (!Number.isFinite(ms)) return '';
  return new Date(ms - 3 * 60 * 60 * 1000).toISOString().slice(11, 16);
}

/** A frase do botão e do leitor de tela: «Birigui: 31°, sol, máx 34° mín 21°». */
export function resumoDoClima(cidade: CidadeClima, p: Previsao): string {
  const hoje = p.dias[0];
  const base = `${NOME_DA_CIDADE[cidade]}: ${p.agora.temp}°, ${rotuloDaCondicao(p.agora.condicao, p.agora.noite).toLowerCase()}`;
  return hoje ? `${base}, máx ${hoje.max}° mín ${hoje.min}°` : base;
}
