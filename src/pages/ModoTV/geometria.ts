/**
* geometria.ts — o sistema de coordenadas do Modo TV.
 *
 * ## A promessa que este arquivo sustenta
 *
 * "O que eu vejo na prévia é o que vai aparecer na TV." Isso não é cuidado ao
 * escrever CSS: é consequência de uma decisão só, tomada aqui.
 *
 * TUDO é desenhado num palco de tamanho FIXO — 1920 × 1080 — e depois a caixa
 * inteira é reduzida por `transform: scale()` até caber onde estiver. A prévia
 * na mesa é o mesmo palco a 30%; a TV é o mesmo palco a 100% (ou a 66%, se a
 * tela for 720p, ou a 200% num monitor 4K).
 *
 * Como a redução é uniforme e vale para o palco inteiro, nenhum número guardado
 * no banco depende da resolução. A TV do setor pode trocar amanhã por outra de
 * tamanho diferente e nada precisa ser reconfigurado.
 *
 * O modelo é o mesmo de `src/pages/Comemoracoes/layout.ts`, e pelo mesmo
 * motivo: posição em PERCENTUAL, nunca em pixel de tela.
 *
 * ## Por que puro e sem React
 *
 * Enquadramento é a parte que mais erra por sinal trocado ou coordenada
 * relativa ao elemento errado. Aqui dá para testar sem montar tela nenhuma.
 */

/** O palco é sempre 16:9. A TV pode ter qualquer tamanho; a proporção, não. */
export const PALCO_LARGURA = 1920;
export const PALCO_ALTURA = 1080;
export const PALCO_PROPORCAO = PALCO_LARGURA / PALCO_ALTURA;

export type TipoFonte = 'texto' | 'imagem' | 'ranking' | 'meta';

export interface LinhaRanking {
  nome: string;
  foto_url: string | null;
  total: number;
}

export interface DadosMeta {
  alvo: number;
  realizado: number;
}

export interface Fonte {
  id: string;
  tipo: TipoFonte;
  config: Record<string, unknown>;
  /** Centro do elemento, em % da largura do palco. */
  x: number;
  /** Centro do elemento, em % da altura do palco. */
  y: number;
  /** Largura em % do palco. A altura sai do conteúdo. */
  largura: number;
  escala: number;
  camada: number;
  /** Preenchido pelo banco para `ranking` e `meta`; nulo nos demais. */
  dados: LinhaRanking[] | DadosMeta | null;
}

export interface CenaNoAr {
  encontrada: boolean;
  tela?: { nome: string; slug: string };
  cena?: { id: string; nome: string } | null;
  fontes?: Fonte[];
  servidor_em?: string;
}

/**
 * Quanto reduzir o palco para caber na caixa disponível.
 *
 * Usa a MENOR das duas razões para o palco caber inteiro — nunca cortado. Numa
 * caixa mais larga que 16:9 sobra faixa preta nas laterais; numa mais alta,
 * acima e abaixo. É o comportamento de qualquer projeção, e é o certo: cortar
 * a borda esconderia justamente o que alguém posicionou lá.
 */
export function escalaDoPalco(larguraCaixa: number, alturaCaixa: number): number {
  if (!(larguraCaixa > 0) || !(alturaCaixa > 0)) return 0;
  return Math.min(larguraCaixa / PALCO_LARGURA, alturaCaixa / PALCO_ALTURA);
}

/**
 * Onde a fonte fica dentro do palco, em pixels do palco (não da tela).
 *
 * O `translate(-50%, -50%)` é o que faz `x`/`y` significarem CENTRO e não canto
 * superior esquerdo. Centro é o que a pessoa espera ao arrastar: o elemento
 * gira em torno do ponto onde o cursor está.
 */
export function estiloDaFonte(fonte: Pick<Fonte, 'x' | 'y' | 'largura' | 'escala' | 'camada'>): {
  position: 'absolute';
  left: string;
  top: string;
  width: string;
  transform: string;
  zIndex: number;
} {
  return {
    position: 'absolute',
    left: `${fonte.x}%`,
    top: `${fonte.y}%`,
    width: `${fonte.largura}%`,
    transform: `translate(-50%, -50%) scale(${fonte.escala})`,
    zIndex: fonte.camada,
  };
}

/** Lê um campo do `config` com valor de partida, sem estourar em dado torto. */
export function texto(config: Record<string, unknown>, chave: string, padrao: string): string {
  const v = config[chave];
  return typeof v === 'string' && v.trim() !== '' ? v : padrao;
}

export function numero(config: Record<string, unknown>, chave: string, padrao: number): number {
  const v = config[chave];
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : padrao;
}

export function ligado(config: Record<string, unknown>, chave: string, padrao: boolean): boolean {
  const v = config[chave];
  return typeof v === 'boolean' ? v : padrao;
}

/**
 * O percentual da meta, limitado a 100 na barra.
 *
 * Passar de 100% é motivo de festa, e a barra cheia é o sinal disso. Mas o
 * NÚMERO continua verdadeiro — 128% aparece escrito, porque quem bateu 128%
 * quer ver 128%, não uma barra cheia dizendo 100%.
 */
export function percentualDaMeta(dados: DadosMeta | null | undefined): {
  exibido: number;
  barra: number;
} {
  const alvo = Number(dados?.alvo) || 0;
  const realizado = Number(dados?.realizado) || 0;
  if (alvo <= 0) return { exibido: 0, barra: 0 };
  const bruto = (realizado / alvo) * 100;
  return { exibido: Math.round(bruto), barra: Math.max(0, Math.min(100, bruto)) };
}

/** As fontes na ordem de desenho: camada de baixo primeiro. */
export function ordenarPorCamada(fontes: readonly Fonte[]): Fonte[] {
  return [...fontes].sort((a, b) => a.camada - b.camada);
}

/**
 * Só o primeiro nome, para o ranking caber e ler bem a cinco metros.
 *
 * "MARIA APARECIDA DE SOUZA SANTOS" numa linha de ranking vira corpo 20 e
 * ninguém lê de longe. O sobrenome não é o que identifica na parede — o
 * primeiro nome é, porque é como as pessoas se chamam na operação.
 */
export function primeiroNome(nome: string): string {
  const limpo = (nome ?? '').trim();
  if (limpo === '') return 'Sem nome';
  return limpo.split(/\s+/)[0];
}
