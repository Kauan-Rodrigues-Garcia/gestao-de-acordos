/**
 * preferencias.ts — o que cada pessoa escolheu no Som ambiente.
 *
 * Fica no navegador (`localStorage`), por pessoa: trocar de usuário na mesma
 * máquina não herda a música de ninguém. Não tem coluna no banco de propósito
 * — é gosto de quem está sentado ali, não dado do negócio.
 *
 * Tudo que vem do armazenamento passa por `normalizar`: chave apagada, JSON
 * quebrado ou versão antiga voltam para o padrão em vez de derrubar o header.
 */
import { chaveDoLink, lerLink, type LinkExterno } from './links';

/** Os temas de terror que vêm de fábrica, na ordem do painel. Trocados em 13/10/2026. */
export const TEMAS_DE_TERROR = ['saw', 'deadsilence', 'it', 'halloween', 'stranger'] as const;
/**
 * As músicas para escutar que vêm de fábrica. Trocadas em 13/10/2026 («Raindance» ficou; «Leão» entrou no fim no mesmo dia).
 * Sete entraram em 14/10/2026, de «Poesia Acústica #6» a «Somebody That I Used To Know».
 *
 * Desde 16/10/2026 ficam agrupadas pelo gênero (`GENERO_DA_MUSICA`), na
 * ordem de `GENEROS` — é a ordem do painel e a da sequência. Seis entraram no
 * mesmo dia: cinco funks e «Flexiona / Poder da Gestão».
 *
 * Em 21/10/2026 todas as músicas foram trocadas pelas treze de agora (as que
 * saíram vão para `SUBSTITUTAS`). Os temas de terror ficaram. No mesmo dia
 * entraram mais duas, cada uma no fim do seu gênero: «Tô com uma Novinha
 * Mídia» (funk) e «Mantém o Pique» (rap).
 */
export const MUSICAS = [
  // Funk
  'trezentosno7', 'mdt', 'postounodaily', 'novinhamidia',
  // Rap e trap
  'donodaverdade', 'clickbait', 'walkemdown', 'mantemopique',
  // Sertanejo
  'pos', 'cowboy', 'temporaldeamor', 'umdegrau', 'cetadoido',
  // Pop
  'chicago', 'theydontcare',
] as const;
export type Musica = (typeof MUSICAS)[number];

/**
 * Os gêneros das músicas, na ordem do painel (16/10/2026: «separe por
 * categorias, funk, eletrônica etc.»). O gênero de cada uma foi conferido
 * pelo artista e pela faixa no Spotify; rap e trap ficam juntos porque os
 * artistas transitam entre os dois (Veigh, NLE Choppa). Desde 21/10/2026 não
 * há rock nem eletrônica na lista: o gênero vazio sairia como filtro sem
 * nenhuma faixa, então saiu também.
 */
export const GENEROS = [
  { id: 'funk', rotulo: 'Funk' },
  { id: 'rap', rotulo: 'Rap e trap' },
  { id: 'sertanejo', rotulo: 'Sertanejo' },
  { id: 'pop', rotulo: 'Pop' },
] as const;
export type Genero = (typeof GENEROS)[number]['id'];

export const GENERO_DA_MUSICA: Record<Musica, Genero> = {
  trezentosno7: 'funk', mdt: 'funk', postounodaily: 'funk', novinhamidia: 'funk',
  donodaverdade: 'rap', clickbait: 'rap', walkemdown: 'rap', mantemopique: 'rap',
  pos: 'sertanejo', cowboy: 'sertanejo', temporaldeamor: 'sertanejo', umdegrau: 'sertanejo',
  cetadoido: 'sertanejo',
  chicago: 'pop', theydontcare: 'pop',
};
/** Todas as de fábrica, na ordem do painel. */
export const FAIXAS_EMBUTIDAS = [...TEMAS_DE_TERROR, ...MUSICAS] as const;
export type FaixaEmbutida = (typeof FAIXAS_EMBUTIDAS)[number];
/** A ordem do anterior/próxima: todas as de fábrica, na ordem do painel. */
export const FAIXAS_DA_SEQUENCIA: readonly FaixaEmbutida[] = FAIXAS_EMBUTIDAS;

/** Onde cada uma mora — `public/sounds/`, junto da trilha da mensagem de outubro. */
export const ARQUIVOS: Record<FaixaEmbutida, string> = {
  saw: '/sounds/halloween-saw-hello-zepp.mp3',
  deadsilence: '/sounds/halloween-dead-silence.mp3',
  it: '/sounds/halloween-it-every-27-years.mp3',
  halloween: '/sounds/halloween-john-carpenter.mp3',
  stranger: '/sounds/halloween-stranger-things.mp3',
  trezentosno7: '/sounds/halloween-mc-gp-300-no-7.mp3',
  mdt: '/sounds/halloween-mc-kelvinho-mdt.mp3',
  postounodaily: '/sounds/halloween-me-postou-no-daily.mp3',
  novinhamidia: '/sounds/halloween-to-com-uma-novinha-midia.mp3',
  donodaverdade: '/sounds/halloween-veigh-dono-da-verdade.mp3',
  clickbait: '/sounds/halloween-veigh-clickbait.mp3',
  walkemdown: '/sounds/halloween-nle-choppa-walk-em-down.mp3',
  mantemopique: '/sounds/halloween-ryu-the-runner-mantem-o-pique.mp3',
  pos: '/sounds/halloween-felipe-e-rodrigo-pos.mp3',
  cowboy: '/sounds/halloween-joao-carreiro-nunca-namore-um-cowboy.mp3',
  temporaldeamor: '/sounds/halloween-cesar-menotti-fabiano-temporal-de-amor.mp3',
  umdegrau: '/sounds/halloween-chico-rey-parana-um-degrau-na-escada.mp3',
  cetadoido: '/sounds/halloween-ce-ta-doido-dvd.mp3',
  chicago: '/sounds/halloween-michael-jackson-chicago.mp3',
  theydontcare: '/sounds/halloween-michael-jackson-they-dont-care-about-us.mp3',
};

/**
 * Ganho de cada faixa, para todas soarem no mesmo volume. Os arquivos vieram
 * de lugares diferentes: medidos em 05/10/2026 (loudness integrada, BS.1770),
 * iam de -16,0 LUFS (Candyman) a -9,6 LUFS (Puxa o Lança) — 6 dB de diferença,
 * a mais alta soando quase o dobro da mais baixa. O alvo é -13 LUFS, o meio:
 * nem estourado nem sumido. `ganho = 10^((-13 - medido) / 20)`. As músicas de
 * 08/10/2026 vieram do YouTube bem mais altas (-8,3 a -7,6) e descem.
 *
 * As de 13/10/2026 foram medidas do mesmo jeito (BS.1770, decodificadas no
 * Chromium; a régua conferida contra Raindance, Halloween e Stranger Things,
 * a 0,1 dB do que estava anotado). «Every 27 Years» veio muito baixa: o ganho
 * passa de 2, e no volume alto ela bate no teto de 100% do navegador.
 *
 * As de 14/10/2026 também (a régua de novo conferida em Raindance, Halloween e
 * Stranger Things). «Somebody That I Used To Know» veio ainda mais baixa que
 * «Every 27 Years»: ganho 2,86, e o teto chega mais cedo.
 *
 * As de 16/10/2026 também, decodificadas no Edge (a régua conferida em
 * Raindance −9,1, Halloween −11,3 e Stranger Things −13,2). Os funks vieram
 * bem altos: «Escuta o Barulho do Rock» a −5,6, a mais alta de todas — ganho
 * 0,42, o primeiro abaixo de 0,5.
 *
 * As de 21/10/2026 também, decodificadas no Chrome (a régua conferida em
 * Raindance −9,1, Halloween −11,3 e Stranger Things −13,2, antes de Raindance
 * sair). «They Don't Care About Us» veio baixa (−20,4, ganho 2,33, quase a de
 * «Every 27 Years»); o DVD de «Cê Tá Doido» foi medido inteiro, os 43 minutos.
 * As duas que entraram depois, no mesmo dia, também no Chrome, com a régua
 * conferida em «300 no 7» (−8,7) e «They Don't Care About Us» (−20,4).
 *
 * Faixa nova: medir e pôr aqui (o teste cobra que toda faixa tenha ganho).
 */
export const GANHO: Record<FaixaEmbutida, number> = {
  saw: 0.97,           // -12,7
  deadsilence: 0.86,   // -11,7
  it: 2.30,            // -20,3
  halloween: 0.82,     // -11,3
  stranger: 1.04,      // -13,3
  trezentosno7: 0.61,  // -8,7 (21/10/2026)
  mdt: 0.69,           // -9,7
  postounodaily: 0.65, // -9,3
  novinhamidia: 0.80,  // -11,1 (21/10/2026, a segunda leva)
  donodaverdade: 1.05, // -13,5
  clickbait: 0.69,     // -9,7
  walkemdown: 0.74,    // -10,4
  mantemopique: 1.00,  // -13,0 — já no alvo
  pos: 0.58,           // -8,2
  cowboy: 0.63,        // -9,0
  temporaldeamor: 1.52, // -16,6
  umdegrau: 1.32,      // -15,4
  cetadoido: 0.54,     // -7,6 — a mais alta da lista
  chicago: 0.65,       // -9,2
  theydontcare: 2.33,  // -20,4 — a mais baixa da lista
};

/**
 * Faixas que saíram da fábrica e quem fica no lugar delas para quem as tinha
 * escolhido. A posição salva para o F5 não é trocada: a de faixa que saiu só
 * é descartada (`lerPosicao`).
 *
 * Temas que saíram em 13/10/2026 vão para «Halloween», o padrão; músicas — as
 * de 13/10 e as que já tinham saído antes (Veigh em 05/10, «Puxa o Lança» e
 * «Na Relíquia do 2T» em 08/10) — para a primeira das músicas. Desde
 * 21/10/2026 é «300 no 7», e vão para ela também as dezoito que saíram nesse dia.
 */
const SUBSTITUTAS: Record<string, FaixaEmbutida> = {
  sexta13: 'halloween', candyman: 'halloween', pesadelo: 'halloween', pecadores: 'halloween',
  ...Object.fromEntries([
    'rainha', 'boladao', 'numb', 'byob', 'bicho', 'gemebaixo', 'veigh', 'puxalanca', 'reliquia',
    // As de antes de 21/10/2026.
    'malvadinho', 'famosoima', 'penaporta', 'termineicomaex', 'barulhodorock', 'longedemagnata',
    'provavelmente', 'novobalanco', 'vidachique', 'flexiona', 'raindance', 'poesiaacustica', 'deixemeir',
    'leao', 'infiel', 'doiwannaknow', 'somebody', 'innerbloom',
  ].map(id => [id, 'trezentosno7' as const])),
};

export interface PlaylistSalva {
  /** `chaveDoLink` — também evita a mesma playlist duas vezes. */
  id: string;
  /** O link como a pessoa colou, para relê-lo se a regra de leitura mudar. */
  url: string;
  nome: string;
  /** Miniatura (música achada na busca do YouTube). Sem ela, vale o ícone. */
  capa?: string;
  /** Canal / artista (música achada na busca do YouTube). */
  descricao?: string;
}

export interface PreferenciasSom {
  /** Faixa escolhida: uma embutida ou o `id` de uma playlist salva. */
  faixa: string;
  /** 0 a 100. */
  volume: number;
  /** Começa a tocar sozinho ao entrar no sistema. */
  tocarAoEntrar: boolean;
  /**
   * Repete a faixa de fábrica. Desligado, elas tocam em sequência, como uma
   * playlist, e voltam à primeira do grupo (músicas ou temas) depois da última.
   */
  repetir: boolean;
  playlists: PlaylistSalva[];
}

/** Baixo de propósito: é som de fundo para quem está trabalhando. */
export const VOLUME_PADRAO = 15;
/**
 * O padrão de antes (até 01/10/2026). Quem tem exatamente ele gravado e ainda
 * não passou pela versão 2 ficou com o padrão, não escolheu: desce para o novo.
 */
const VOLUME_PADRAO_ANTIGO = 20;
/** Versão do que vai gravado. A 2 é a do padrão em 15%. */
const VERSAO = 2;
export const LIMITE_PLAYLISTS = 40;

export const PADRAO: PreferenciasSom = {
  faixa: 'halloween',
  volume: VOLUME_PADRAO,
  tocarAoEntrar: false,
  repetir: false,
  playlists: [],
};

const chave = (perfilId: string) => `som-ambiente:${perfilId}`;

/**
 * A rádio (29/10/2026): a mesma música para todo mundo que entrar nela — ver
 * `radio/radio.ts`. É uma «faixa» como as outras: fica escolhida, e com
 * «Tocar ao entrar» o sistema já entra na rádio.
 */
export const RADIO = 'radio';

export function ehEmbutida(faixa: string): faixa is FaixaEmbutida {
  return (FAIXAS_EMBUTIDAS as readonly string[]).includes(faixa);
}

export function normalizar(bruto: unknown): PreferenciasSom {
  if (!bruto || typeof bruto !== 'object') return { ...PADRAO, playlists: [] };
  const o = bruto as Record<string, unknown>;

  const playlists: PlaylistSalva[] = [];
  if (Array.isArray(o.playlists)) {
    for (const item of o.playlists) {
      if (!item || typeof item !== 'object') continue;
      const p = item as Record<string, unknown>;
      if (typeof p.url !== 'string') continue;
      const link = lerLink(p.url);
      if (!link) continue;
      const id = chaveDoLink(link);
      if (playlists.some(x => x.id === id)) continue;
      const nome = typeof p.nome === 'string' && p.nome.trim() ? p.nome.trim().slice(0, 60) : link.rotulo;
      const capa = typeof p.capa === 'string' && p.capa.startsWith('https://i.ytimg.com/') ? p.capa : undefined;
      const descricao = typeof p.descricao === 'string' && p.descricao.trim() ? p.descricao.trim().slice(0, 80) : undefined;
      playlists.push({ id, url: p.url, nome, ...(capa ? { capa } : {}), ...(descricao ? { descricao } : {}) });
      if (playlists.length >= LIMITE_PLAYLISTS) break;
    }
  }

  const lido = typeof o.volume === 'number' && Number.isFinite(o.volume)
    ? Math.round(Math.min(100, Math.max(0, o.volume)))
    : VOLUME_PADRAO;
  const volume = o.v !== VERSAO && lido === VOLUME_PADRAO_ANTIGO ? VOLUME_PADRAO : lido;

  const lida = typeof o.faixa === 'string' ? (SUBSTITUTAS[o.faixa] ?? o.faixa) : null;
  const faixa = lida !== null && (ehEmbutida(lida) || lida === RADIO || playlists.some(p => p.id === lida))
    ? lida
    : PADRAO.faixa;

  return { faixa, volume, tocarAoEntrar: o.tocarAoEntrar === true, repetir: o.repetir === true, playlists };
}

export function lerPreferencias(perfilId: string): PreferenciasSom {
  try {
    const texto = localStorage.getItem(chave(perfilId));
    return normalizar(texto ? JSON.parse(texto) : null);
  } catch {
    return normalizar(null);
  }
}

export function gravarPreferencias(perfilId: string, prefs: PreferenciasSom): void {
  try { localStorage.setItem(chave(perfilId), JSON.stringify({ ...prefs, v: VERSAO })); } catch { /* modo privado */ }
}

/**
 * Onde a música de fábrica parou — para o F5 voltar no mesmo ponto, pausada,
 * em vez de recomeçar do zero. Também só no navegador e por pessoa.
 */
export interface PosicaoSalva {
  faixa: FaixaEmbutida;
  /** Segundos desde o começo da faixa. */
  t: number;
}

const chavePosicao = (perfilId: string) => `som-ambiente-posicao:${perfilId}`;

export function lerPosicao(perfilId: string): PosicaoSalva | null {
  try {
    const o = JSON.parse(localStorage.getItem(chavePosicao(perfilId)) ?? 'null') as Record<string, unknown> | null;
    if (!o || typeof o.faixa !== 'string' || !ehEmbutida(o.faixa)) return null;
    const t = typeof o.t === 'number' && Number.isFinite(o.t) && o.t > 0 ? o.t : 0;
    return { faixa: o.faixa, t };
  } catch {
    return null;
  }
}

export function gravarPosicao(perfilId: string, pos: PosicaoSalva): void {
  try { localStorage.setItem(chavePosicao(perfilId), JSON.stringify({ faixa: pos.faixa, t: Math.round(pos.t * 10) / 10 })); } catch { /* modo privado */ }
}

export function esquecerPosicao(perfilId: string): void {
  try { localStorage.removeItem(chavePosicao(perfilId)); } catch { /* modo privado */ }
}

/** Link salvo de volta em formato que o motor toca. */
export function linkDaPlaylist(p: PlaylistSalva): LinkExterno | null {
  return lerLink(p.url);
}
