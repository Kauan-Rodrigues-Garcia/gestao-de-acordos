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
 * Sete entraram no fim em 14/10/2026, de «Poesia Acústica #6» a «Somebody That I Used To Know».
 */
export const MUSICAS = [
  'provavelmente', 'doiwannaknow', 'novobalanco', 'raindance', 'leao',
  'poesiaacustica', 'vidachique', 'malvadinho', 'infiel', 'innerbloom', 'deixemeir', 'somebody',
] as const;
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
  provavelmente: '/sounds/halloween-hungria-provavelmente.mp3',
  doiwannaknow: '/sounds/halloween-arctic-monkeys-do-i-wanna-know.mp3',
  novobalanco: '/sounds/halloween-veigh-novo-balanco.mp3',
  raindance: '/sounds/halloween-raindance.mp3',
  leao: '/sounds/halloween-marilia-mendonca-leao.mp3',
  poesiaacustica: '/sounds/halloween-poesia-acustica-6.mp3',
  vidachique: '/sounds/halloween-veigh-vida-chique.mp3',
  malvadinho: '/sounds/halloween-mc-luuky-malvadinho.mp3',
  infiel: '/sounds/halloween-marilia-mendonca-infiel.mp3',
  innerbloom: '/sounds/halloween-rufus-du-sol-innerbloom.mp3',
  deixemeir: '/sounds/halloween-1kilo-deixe-me-ir.mp3',
  somebody: '/sounds/halloween-gotye-somebody.mp3',
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
 * Faixa nova: medir e pôr aqui (o teste cobra que toda faixa tenha ganho).
 */
export const GANHO: Record<FaixaEmbutida, number> = {
  saw: 0.97,           // -12,7
  deadsilence: 0.86,   // -11,7
  it: 2.30,            // -20,3
  halloween: 0.82,     // -11,3
  stranger: 1.04,      // -13,3
  provavelmente: 0.95, // -12,5
  doiwannaknow: 0.68,  // -9,6
  novobalanco: 0.71,   // -10,0
  raindance: 0.64,     // -9,1 (11/10/2026)
  leao: 0.50,          // -7,0 (13/10/2026) — a mais alta da lista
  poesiaacustica: 0.94, // -12,4 (14/10/2026)
  vidachique: 0.74,    // -10,4
  malvadinho: 0.72,    // -10,2
  infiel: 0.65,        // -9,2
  innerbloom: 0.73,    // -10,3
  deixemeir: 0.92,     // -12,3
  somebody: 2.86,      // -22,1 — a mais baixa da lista
};

/**
 * Faixas que saíram da fábrica e quem fica no lugar delas para quem as tinha
 * escolhido. A posição salva para o F5 não é trocada: a de faixa que saiu só
 * é descartada (`lerPosicao`).
 *
 * Temas que saíram em 13/10/2026 vão para «Halloween», o padrão; músicas — as
 * de 13/10 e as que já tinham saído antes (Veigh em 05/10, «Puxa o Lança» e
 * «Na Relíquia do 2T» em 08/10) — para «Provavelmente», a primeira das músicas.
 */
const SUBSTITUTAS: Record<string, FaixaEmbutida> = {
  sexta13: 'halloween', candyman: 'halloween', pesadelo: 'halloween', pecadores: 'halloween',
  rainha: 'provavelmente', boladao: 'provavelmente', numb: 'provavelmente', byob: 'provavelmente',
  bicho: 'provavelmente', gemebaixo: 'provavelmente',
  veigh: 'provavelmente', puxalanca: 'provavelmente', reliquia: 'provavelmente',
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
  const faixa = lida !== null && (ehEmbutida(lida) || playlists.some(p => p.id === lida))
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
