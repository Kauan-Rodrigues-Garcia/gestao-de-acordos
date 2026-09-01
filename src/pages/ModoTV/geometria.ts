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

export type TipoFonte =
  | 'texto' | 'imagem' | 'ranking' | 'meta' | 'fundo' | 'relogio' | 'video'
  | 'sorteio' | 'desafio';

/** O Alert Box: entra por cima da cena, fica alguns segundos e sai. */
export interface Alerta {
  id: string;
  titulo: string;
  mensagem: string | null;
  midia_url: string | null;
  som_url: string | null;
  duracao_s: number;
  criado_em: string;
  /** Quanto ainda falta dele, calculado pelo banco. Pode vir negativo. */
  resta_s: number;
}

export interface DadosDesafio {
  nome: string;
  premio: string | null;
  data_fim: string;
  dias_restantes: number;
}

export interface DadosSorteio {
  id: string;
  tipo: 'roleta' | 'bingo';
  titulo: string;
  participantes: string[];
  resultado: { vencedor?: string; indice?: number; numeros?: number[] };
  estado: 'aberto' | 'girando' | 'encerrado';
  girado_em: string | null;
}

/** Como uma cena entra no lugar da outra. */
export type Transicao = 'corte' | 'fade' | 'deslize';

/** Quanto dura a troca. Curta de propósito: transição longa cansa em laço. */
export const DURACAO_TRANSICAO_MS = 600;

export interface LinhaRanking {
  nome: string;
  foto_url: string | null;
  total: number;
}

/**
 * Tudo o que os templates de meta desenham, resolvido por
 * `fn_tv_metricas_setor` — a MESMA régua de dia útil do dashboard.
 *
 * Os campos além de `alvo`/`realizado` são opcionais porque uma cena montada
 * antes da fase 2 pode estar no ar quando o build novo sobe. Faltando, o
 * desenho cai no que dá para dizer com dois números — e não em `NaN%` na
 * parede, que é o modo caro de descobrir que o dado mudou de forma.
 */
export interface DadosMeta {
  alvo: number;
  realizado: number;
  /** Só o que entrou HOJE. */
  realizado_hoje?: number;
  falta?: number;
  dias_uteis?: number;
  dias_decorridos?: number;
  dias_restantes?: number;
  /** Meta do mês ÷ dias úteis. Não muda ao longo do mês. */
  meta_diaria?: number;
  /** O que ainda falta ÷ dias que sobram. Sobe quando se fica para trás. */
  ritmo_necessario?: number;
  esperado_ate_hoje?: number;
  /** No ritmo de hoje, onde o mês termina. */
  projecao?: number;
  serie?: { dia: string; valor: number }[];
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
  /**
   * Desligada some da TV E da prévia. O banco já a filtra em `fn_tv_palco`;
   * aqui é opcional porque a prévia lê a tabela direto, sem esse filtro.
   */
  visivel?: boolean;
  /** 0 a 1. Só vale para fonte com áudio. */
  volume?: number;
  mudo?: boolean;
  /** Preenchido pelo banco para `ranking` e `meta`; nulo nos demais. */
  dados: LinhaRanking[] | DadosMeta | DadosDesafio | DadosSorteio | null;
}

export interface CenaNoAr {
  encontrada: boolean;
  tela?: { nome: string; slug: string; rotacao?: boolean };
  cena?: { id: string; nome: string; transicao?: Transicao } | null;
  fontes?: Fonte[];
  /**
   * Segundos até a próxima troca, quando a rotação está ligada.
   *
   * É o que permite ao palco agendar a releitura no instante certo, em vez de
   * perguntar de 20 em 20 segundos e trocar de cena sempre atrasado.
   */
  /** Alertas ainda vivos neste setor, do mais novo para o mais velho. */
  alertas?: Alerta[];
  proxima_em_s?: number | null;
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
  if (!(larguraCaixa > 0)) return 0;

  /*
   * Altura zero com largura boa NÃO é caso teórico: já aconteceu. O contêiner
   * da prévia tirava a altura de `aspect-ratio`, o `height: 100%` do filho não
   * resolvia contra isso, e a caixa media 1920×0 — escala 0, palco escondido,
   * prévia preta.
   *
   * O layout foi corrigido, mas a regra fica: se a altura não veio, deduzir da
   * largura pela proporção do palco. Uma prévia levemente fora do lugar é um
   * problema que a pessoa vê e reporta; uma tela preta ela interpreta como
   * "não funciona" e desiste.
   */
  if (!(alturaCaixa > 0)) return larguraCaixa / PALCO_LARGURA;

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

/**
 * Onde a fonte encosta ao ser arrastada perto de uma linha notável.
 *
 * Sem encaixe, "centralizar" vira 49,7% — e 49,7% numa TV de 55 polegadas é um
 * deslocamento de meio centímetro que a pessoa vê e não consegue consertar no
 * olho. Com encaixe, soltar perto do meio significa o meio.
 *
 * A tolerância é em % do palco, não em pixel: a prévia é pequena e a TV é
 * grande, e um encaixe medido em pixel de tela seria generoso demais na TV e
 * apertado demais na prévia.
 */
export const LINHAS_DE_ENCAIXE = [0, 25, 50, 75, 100] as const;
const TOLERANCIA_ENCAIXE = 1.6;

export function encaixar(valor: number, linhas: readonly number[] = LINHAS_DE_ENCAIXE): number {
  let melhor = valor;
  let menorDistancia = TOLERANCIA_ENCAIXE;
  for (const linha of linhas) {
    const distancia = Math.abs(valor - linha);
    if (distancia < menorDistancia) {
      menorDistancia = distancia;
      melhor = linha;
    }
  }
  return melhor;
}

/**
 * Mantém a fonte dentro do palco, com sangria.
 *
 * O limite é o mesmo do CHECK em `tv_fontes` (-20 a 120). Deixar sair um pouco
 * é proposital — arte sangrando na borda é recurso legítimo. Deixar sair de
 * vez não é: a fonte some da tela e some também da prévia, e a pessoa fica
 * procurando o que "apagou".
 */
export function limitarAoPalco(valor: number): number {
  return Math.round(Math.max(-20, Math.min(120, valor)) * 10) / 10;
}

/*
 * ── Redimensionar pelas alças ───────────────────────────────────────────────
 *
 * Os limites são os MESMOS CHECK de `tv_fontes`. Repetidos aqui porque quem
 * arrasta precisa parar na borda, e não descobrir o limite quando o banco
 * recusa a gravação depois de a alça já ter ido longe.
 */
export const LARGURA_MIN = 2;
export const LARGURA_MAX = 100;
export const ESCALA_MIN = 0.1;
export const ESCALA_MAX = 5;

/**
 * As alças que existem — e as que não existem.
 *
 * Não há alça em cima nem embaixo, e a ausência é honesta: a ALTURA de uma
 * fonte sai do conteúdo (o texto quebra, o ranking tem N linhas), não de um
 * número guardado. Uma alça vertical prometeria um controle que o modelo não
 * tem, e arrastá-la não faria nada — que é pior do que ela não estar lá.
 *
 * Os quatro cantos mexem na ESCALA: crescem a fonte inteira, como puxar o canto
 * de uma foto. As duas laterais mexem na LARGURA: mudam a caixa sem mudar o
 * corpo do texto, que é o que se quer para reflow.
 */
export type Alca = 'nw' | 'ne' | 'sw' | 'se' | 'w' | 'e';
export const ALCAS: readonly Alca[] = ['nw', 'ne', 'sw', 'se', 'w', 'e'];

/** A alça está do lado esquerdo? Decide qual borda fica ancorada. */
export function alcaNoOeste(alca: Alca): boolean {
  return alca === 'nw' || alca === 'sw' || alca === 'w';
}

/** Canto mexe na escala; lateral mexe na largura. */
export function alcaEhCanto(alca: Alca): boolean {
  return alca === 'nw' || alca === 'ne' || alca === 'sw' || alca === 'se';
}

/** Largura que a fonte OCUPA na tela: a caixa vezes a escala. */
export function larguraVisivel(f: Pick<Fonte, 'largura' | 'escala'>): number {
  return f.largura * f.escala;
}

export interface Redimensionamento {
  x: number;
  largura: number;
  escala: number;
}

/**
 * Onde a fonte fica depois de arrastar uma alça até `ponteiroX`.
 *
 * A borda OPOSTA à alça fica parada — é o que todo editor de imagem faz, e é o
 * que permite encostar um elemento numa margem e depois só esticar o outro
 * lado. O centro (`x`) é recalculado para que isso aconteça, porque no modelo
 * `x` é o centro e não o canto.
 *
 * `y` não muda. Com a escala aplicada em torno do centro, crescer pelo canto
 * cresce para cima e para baixo em partes iguais — previsível, e o único
 * comportamento possível sem conhecer a altura, que vem do conteúdo.
 *
 * Tudo em % do palco: a conta vale igual na prévia de 400px e na TV de 1920.
 */
export function redimensionar(
  inicio: Pick<Fonte, 'x' | 'largura' | 'escala'>,
  alca: Alca,
  ponteiroX: number,
): Redimensionamento {
  const visivel = larguraVisivel(inicio);
  const oeste = alcaNoOeste(alca);
  // A borda que fica parada.
  const ancora = oeste ? inicio.x + visivel / 2 : inicio.x - visivel / 2;

  // A borda que anda encaixa nas guias, igual ao arrasto: soltar perto da
  // margem significa a margem.
  const borda = encaixar(ponteiroX);
  const novaVisivel = oeste ? ancora - borda : borda - ancora;

  let largura = inicio.largura;
  let escala = inicio.escala;

  if (alcaEhCanto(alca)) {
    escala = Math.min(ESCALA_MAX, Math.max(ESCALA_MIN, novaVisivel / inicio.largura));
  } else {
    largura = Math.min(LARGURA_MAX, Math.max(LARGURA_MIN, novaVisivel / inicio.escala));
  }

  // Recalcula a partir dos valores JÁ limitados: se o limite mordeu, a âncora
  // continua parada e a fonte para de crescer, em vez de escorregar de lado.
  const visivelFinal = largura * escala;
  const x = oeste ? ancora - visivelFinal / 2 : ancora + visivelFinal / 2;

  return {
    x: limitarAoPalco(x),
    largura: Math.round(largura * 10) / 10,
    escala: Math.round(escala * 100) / 100,
  };
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
