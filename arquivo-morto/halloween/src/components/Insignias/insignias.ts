/**
 * insignias.ts — o álbum de insígnias das gincanas: quais são, e quem tem.
 *
 * ## O pedido (19/10/2026)
 *
 * «Uma insígnia pequena, tipo uma medalha, na parte de cima do Gestão, onde
 * ficam as conquistas: um troféu por completar as gincanas.» Quatro, por
 * enquanto, e o álbum completo é ter as quatro:
 *
 *   zumbi     pegou um zumbi na Caça aos Zumbis
 *   reiDoPop  ajudou a derrubar o Rei do Pop (deu dano numa rodada em que ele
 *             foi DERROTADO — se ele fugiu, ninguém completou a gincana)
 *   bruxas    derrubou uma bruxa na Caça às Bruxas
 *   pantano   ajudou a derrubar a Bruxa do Pântano (a mesma regra do Rei)
 *   guerra    ajudou a derrubar o Cavalo da Guerra, na Guerra na Corrida
 *             (23/10/2026; a mesma regra: deu dano numa luta em que ele CAIU)
 *
 * ## De onde vem (nada novo no banco)
 *
 * Tudo já está gravado pelas próprias gincanas, em tabelas que quem está
 * logado já lê (RLS `USING (TRUE)`):
 *
 *   - `abobora_rodadas`, `situacao = 'achada'`: `achada_por` pegou. Tema
 *     `zumbis` com `zumbi` preenchido é zumbi; as linhas de antes de
 *     07/10/2026 (`zumbi` NULL) eram a Caça à Abóbora e não contam. Tema
 *     `bruxas` é bruxa (quem DERRUBOU; finalizar é outra coisa).
 *   - `chefao_golpes` / `chefona_golpes` com `dano > 0`, numa rodada
 *     `situacao = 'derrotado'`. `golpe_final_por` ganha a menção «golpe final».
 *
 * Puro de propósito: a leitura do banco está em `banco.ts`, e os testes
 * conferem a contagem sem rede.
 */

export type IdInsignia = 'zumbi' | 'reiDoPop' | 'bruxas' | 'pantano' | 'guerra';

export interface Insignia {
  id: IdInsignia;
  nome: string;
  /** O que dá a insígnia, para quem ainda não tem. */
  como: string;
  /** A cor da fita (e do ponto na barra do topo). */
  fita: string;
}

/** Na ordem do álbum: a gincana, depois o chefe dela. */
export const INSIGNIAS: readonly Insignia[] = [
  { id: 'zumbi',    nome: 'Caçador de Zumbis', como: 'Pegue um zumbi na Caça aos Zumbis.',                 fita: '#4d7c3a' },
  { id: 'reiDoPop', nome: 'Rei do Pop',        como: 'Ajude a derrubar o Rei do Pop zumbi até o fim.',      fita: '#c8202a' },
  { id: 'bruxas',   nome: 'Caçador de Bruxas', como: 'Derrube uma bruxa na Caça às Bruxas.',               fita: '#d9661a' },
  { id: 'pantano',  nome: 'Bruxa do Pântano',  como: 'Ajude a derrubar a Bruxa do Pântano até o fim.',      fita: '#2f6f6a' },
  { id: 'guerra',   nome: 'Cavalo da Guerra',  como: 'Ajude a derrubar o Cavalo da Guerra na Guerra na Corrida.', fita: '#8e1016' },
];

export const TOTAL_INSIGNIAS = INSIGNIAS.length;

// ── O que vem do banco ──────────────────────────────────────────────────────

/** Uma linha de `abobora_rodadas` achada (só as colunas que o álbum lê). */
export interface LinhaCaca {
  achada_por: string;
  achada_por_nome: string | null;
  achada_por_foto: string | null;
  achada_por_setor?: string | null;
  achada_em: string;
  tema: string;
  zumbi: number | null;
  bruxa: number | null;
  /** Zumbi: tiro na cabeça. */
  headshot?: boolean | null;
  /** Bruxa: onde o tiro pegou (`cabeca`, `corpo`, `vassoura`). */
  tiro?: string | null;
  /** Quanto levou para pegar, desde que saiu (ms). */
  ms?: number | null;
}

/** Uma linha de `chefao_golpes` / `chefona_golpes` de rodada derrotada. */
export interface LinhaGolpe {
  usuario: string;
  nome: string | null;
  foto: string | null;
  dano: number;
  rodada_id: number;
  derrotado_em: string | null;
  golpe_final_por: string | null;
}

// ── O álbum de uma pessoa ───────────────────────────────────────────────────

export interface Conquista {
  /** Quantas vezes: zumbis pegos, bruxas derrubadas, chefes derrotados. */
  vezes: number;
  /** A primeira vez (ISO). */
  primeiraEm: string;
  /** A mais recente (ISO). */
  ultimaEm: string;
  /** Zumbi / bruxa: o índice do desenho da mais recente (`ZUMBIS`/`BRUXAS`). */
  desenho: number | null;
  /** Zumbi/bruxa: quantas foram com tiro na cabeça. */
  headshots: number;
  /** Zumbi/bruxa: o tempo mais rápido (ms). */
  melhorMs: number | null;
  /** Chefes: deu o golpe final em alguma. */
  golpeFinal: boolean;
  /** Chefes: o maior dano numa rodada. */
  maiorDano: number;
}

export interface Album {
  usuario: string;
  nome: string;
  foto: string | null;
  setor: string | null;
  conquistas: Partial<Record<IdInsignia, Conquista>>;
}

export function quantas(a: Pick<Album, 'conquistas'> | null | undefined): number {
  if (!a) return 0;
  return INSIGNIAS.reduce((n, i) => n + (a.conquistas[i.id] ? 1 : 0), 0);
}

export function insigniaDaCaca(l: Pick<LinhaCaca, 'tema' | 'zumbi'>): IdInsignia | null {
  if (l.tema === 'bruxas') return 'bruxas';
  if (l.tema === 'zumbis' && l.zumbi != null) return 'zumbi';
  return null;
}

function somar(
  atual: Conquista | undefined,
  em: string,
  extra: { desenho?: number | null; golpeFinal?: boolean; dano?: number; headshot?: boolean; ms?: number | null },
): Conquista {
  const c: Conquista = atual
    ? { ...atual }
    : { vezes: 0, primeiraEm: em, ultimaEm: em, desenho: null, headshots: 0, melhorMs: null, golpeFinal: false, maiorDano: 0 };
  c.vezes += 1;
  if (em < c.primeiraEm) c.primeiraEm = em;
  if (em >= c.ultimaEm) {
    c.ultimaEm = em;
    if (extra.desenho != null) c.desenho = extra.desenho;
  }
  if (c.desenho == null && extra.desenho != null) c.desenho = extra.desenho;
  if (extra.headshot) c.headshots += 1;
  if (extra.ms != null && extra.ms >= 0 && (c.melhorMs == null || extra.ms < c.melhorMs)) c.melhorMs = extra.ms;
  if (extra.golpeFinal) c.golpeFinal = true;
  if (extra.dano != null && extra.dano > c.maiorDano) c.maiorDano = extra.dano;
  return c;
}

/**
 * Junta as linhas das gincanas num álbum por pessoa. Nome e foto: os mais
 * recentes que as gincanas gravaram (quem chama pode trocar pelos do perfil).
 */
export function montarAlbuns(
  caca: readonly LinhaCaca[],
  rei: readonly LinhaGolpe[],
  pantano: readonly LinhaGolpe[],
  guerra: readonly LinhaGolpe[] = [],
): Map<string, Album> {
  const albuns = new Map<string, Album>();
  const visto = new Map<string, string>(); // usuario -> quando o nome/foto foi gravado

  const pessoa = (usuario: string, nome: string | null, foto: string | null, em: string, setor?: string | null) => {
    let a = albuns.get(usuario);
    if (!a) {
      a = { usuario, nome: nome?.trim() || 'Alguém', foto, setor: setor ?? null, conquistas: {} };
      albuns.set(usuario, a);
      visto.set(usuario, em);
    } else if (em >= (visto.get(usuario) ?? '')) {
      if (nome?.trim()) a.nome = nome.trim();
      if (foto) a.foto = foto;
      if (setor) a.setor = setor;
      visto.set(usuario, em);
    }
    return a;
  };

  for (const l of caca) {
    const id = insigniaDaCaca(l);
    if (!id || !l.achada_por) continue;
    const a = pessoa(l.achada_por, l.achada_por_nome, l.achada_por_foto, l.achada_em, l.achada_por_setor);
    a.conquistas[id] = somar(a.conquistas[id], l.achada_em, {
      desenho: id === 'zumbi' ? l.zumbi : l.bruxa,
      headshot: id === 'zumbi' ? !!l.headshot : l.tiro === 'cabeca',
      ms: l.ms,
    });
  }

  const chefes: [IdInsignia, readonly LinhaGolpe[]][] = [['reiDoPop', rei], ['pantano', pantano], ['guerra', guerra]];
  for (const [id, linhas] of chefes) {
    for (const l of linhas) {
      if (!l.usuario || !(l.dano > 0) || !l.derrotado_em) continue;
      const a = pessoa(l.usuario, l.nome, l.foto, l.derrotado_em);
      a.conquistas[id] = somar(a.conquistas[id], l.derrotado_em, {
        golpeFinal: l.golpe_final_por === l.usuario,
        dano: l.dano,
      });
    }
  }
  return albuns;
}

/** Quem tem mais primeiro; no empate, quem completou antes; depois o nome. */
export function ordenarAlbuns(albuns: Iterable<Album>): Album[] {
  const ultimaDeTodas = (a: Album) =>
    Object.values(a.conquistas).reduce((m, c) => (c && c.primeiraEm > m ? c.primeiraEm : m), '');
  return [...albuns].sort((x, y) =>
    quantas(y) - quantas(x)
    || ultimaDeTodas(x).localeCompare(ultimaDeTodas(y))
    || x.nome.localeCompare(y.nome, 'pt-BR'));
}

// ── «Ganhou uma nova» ───────────────────────────────────────────────────────
//
// A barra do topo brilha uma vez quando aparece insígnia que a pessoa ainda
// não viu no álbum. O que ela já viu fica no navegador, por pessoa.

const CHAVE_VISTAS = (usuario: string) => `insignias:vistas:${usuario}`;

export function insigniasVistas(usuario: string): IdInsignia[] | null {
  try {
    const bruto = localStorage.getItem(CHAVE_VISTAS(usuario));
    if (bruto == null) return null;
    const lista = JSON.parse(bruto);
    return Array.isArray(lista) ? lista.filter((x): x is IdInsignia => INSIGNIAS.some(i => i.id === x)) : [];
  } catch {
    return null;
  }
}

export function marcarInsigniasVistas(usuario: string, ids: readonly IdInsignia[]): void {
  try { localStorage.setItem(CHAVE_VISTAS(usuario), JSON.stringify(ids)); } catch { /* sem armazenamento: brilha de novo, só isso */ }
}

/**
 * As que a pessoa tem e ainda não viu. Nada guardado (o álbum nunca foi
 * aberto neste navegador) = todas que tem são novas: é o aviso de que o álbum
 * existe.
 */
/**
 * O super_admin tem todas (Cleber, 29/10/2026): as que ele não ganhou nas
 * gincanas entram como ganhas hoje, uma vez. Só na barra dele — o álbum
 * guardado e a lista do pessoal continuam com o que o banco gravou.
 */
export function albumLiberado(album: Album | null, usuario: string, agora: string): Album {
  const base: Album = album ?? { usuario, nome: '', foto: null, setor: null, conquistas: {} };
  const conquistas = { ...base.conquistas };
  for (const ins of INSIGNIAS) {
    conquistas[ins.id] ??= {
      vezes: 1, primeiraEm: agora, ultimaEm: agora, desenho: null,
      headshots: 0, melhorMs: null, golpeFinal: false, maiorDano: 0,
    };
  }
  return { ...base, conquistas };
}

export function novasInsignias(tem: readonly IdInsignia[], vistas: readonly IdInsignia[] | null): IdInsignia[] {
  return tem.filter(id => !(vistas ?? []).includes(id));
}

// ── O álbum guardado no navegador ──────────────────────────────────────────
//
// Para as medalhas aparecerem NA HORA ao abrir o app (19/10/2026: «estão
// demorando para carregar»): a última leitura fica no navegador, por pessoa,
// e a barra começa por ela; a leitura do banco vem depois e só atualiza. O
// banco continua com a leitura espalhada — ninguém mais vê a espera.

const CHAVE_ALBUM = (usuario: string) => `insignias:album:v1:${usuario}`;
const IDS = new Set<string>(INSIGNIAS.map(i => i.id));

export function albumGuardado(usuario: string): Album | null {
  try {
    const bruto = localStorage.getItem(CHAVE_ALBUM(usuario));
    if (!bruto) return null;
    const a = JSON.parse(bruto) as Album;
    if (!a || a.usuario !== usuario || typeof a.conquistas !== 'object' || a.conquistas === null) return null;
    // Só as insígnias que existem, com o mínimo que a medalha e a placa leem.
    const conquistas: Album['conquistas'] = {};
    for (const [id, c] of Object.entries(a.conquistas)) {
      if (IDS.has(id) && c && typeof c.vezes === 'number' && typeof c.primeiraEm === 'string') {
        conquistas[id as IdInsignia] = c;
      }
    }
    return { ...a, conquistas };
  } catch {
    return null;
  }
}

export function guardarAlbum(usuario: string, album: Album | null): void {
  try {
    const a: Album = album ?? { usuario, nome: '', foto: null, setor: null, conquistas: {} };
    localStorage.setItem(CHAVE_ALBUM(usuario), JSON.stringify({ ...a, usuario }));
  } catch { /* sem armazenamento: a barra só espera a leitura, como antes */ }
}
