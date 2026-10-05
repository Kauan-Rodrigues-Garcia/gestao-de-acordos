/**
 * presencaAoVivo.ts — a lista de quem está online, montada com duas fontes.
 *
 *   A batida (`fn_presenca_bater`, a cada 60 s)   a VERDADE: quem bateu nos
 *                                                 últimos 150 s, com a hora do
 *                                                 banco (`agora`).
 *   O aviso (`presenca:global`, Realtime)         o ATALHO: «entrou» e «saiu»
 *                                                 no instante em que acontece,
 *                                                 com a hora do banco (`em`).
 *
 * Duas regras fazem as duas concordarem:
 *
 *   1. Lista que chega troca tudo, e os avisos MAIS NOVOS que ela são
 *      reaplicados por cima. Uma lista calculada um segundo antes de alguém
 *      entrar não o apaga.
 *   2. «Saiu» espera `graca` antes de tirar a pessoa. Recarregar a página é um
 *      «saiu» seguido de um «entrou» poucos segundos depois; sem a espera, todo
 *      F5 piscava a bolinha de todo mundo.
 *
 * Sem React e sem rede: o `PresenceProvider` liga as peças, os testes daqui
 * conferem a regra.
 */

export interface AvisoPresenca {
  tipo: 'entrou' | 'saiu';
  pessoa: string;
  empresa: string | null;
  /** Milissegundos do relógio do banco. */
  em: number;
}

/** O payload do Broadcast, conferido. Qualquer coisa fora do formato é ignorada. */
export function lerAviso(p: Record<string, unknown> | null | undefined): AvisoPresenca | null {
  if (!p) return null;
  const tipo = p.tipo === 'entrou' || p.tipo === 'saiu' ? p.tipo : null;
  const pessoa = typeof p.pessoa === 'string' && p.pessoa ? p.pessoa : null;
  const em = Number(p.em);
  if (!tipo || !pessoa || !Number.isFinite(em)) return null;
  return { tipo, pessoa, empresa: typeof p.empresa === 'string' ? p.empresa : null, em };
}

/** Quanto tempo um aviso fica guardado para ser reaplicado sobre uma lista. */
const GUARDA_AVISO_MS = 3 * 60_000;

export interface MapaOnline {
  /** A lista da batida: pares [pessoa, empresa] e a hora do banco em que foi lida. */
  aplicarLista(lista: readonly (readonly [string, string | null])[], agora: number): void;
  aplicarAviso(aviso: AvisoPresenca): void;
  /** Quem está online agora, como pares [pessoa, empresa]. */
  linhas(): [string, string | null][];
  /** Para os timers. A lista fica como estava. */
  encerrar(): void;
}

export function criarMapaOnline({ graca, aoMudar, relogio = () => Date.now() }: {
  /** Espera do «saiu» antes de tirar a pessoa. */
  graca: number;
  aoMudar: () => void;
  relogio?: () => number;
}): MapaOnline {
  let mapa = new Map<string, string | null>();
  /** pessoa → timer do «saiu» em espera, e o `em` dele. */
  const pendentes = new Map<string, { timer: ReturnType<typeof setTimeout>; em: number }>();
  /** Avisos recentes, com a hora local em que chegaram (para o descarte). */
  let guardados: { aviso: AvisoPresenca; chegou: number }[] = [];

  const cancelar = (pessoa: string) => {
    const p = pendentes.get(pessoa);
    if (p) { clearTimeout(p.timer); pendentes.delete(pessoa); }
  };

  const agendarSaida = (aviso: AvisoPresenca) => {
    if (pendentes.has(aviso.pessoa)) return;
    const timer = setTimeout(() => {
      pendentes.delete(aviso.pessoa);
      if (mapa.delete(aviso.pessoa)) aoMudar();
    }, graca);
    pendentes.set(aviso.pessoa, { timer, em: aviso.em });
  };

  /** Aplica sem avisar ninguém; devolve se mudou o mapa. */
  const aplicar = (aviso: AvisoPresenca): boolean => {
    if (aviso.tipo === 'entrou') {
      cancelar(aviso.pessoa);
      const mudou = !mapa.has(aviso.pessoa) || mapa.get(aviso.pessoa) !== aviso.empresa;
      mapa.set(aviso.pessoa, aviso.empresa);
      return mudou;
    }
    // A pessoa continua na lista durante a espera: quem só recarregou volta antes.
    if (mapa.has(aviso.pessoa)) agendarSaida(aviso);
    return false;
  };

  return {
    aplicarLista(lista, agora) {
      const anterior = mapa;
      const novo = new Map<string, string | null>(lista.map(([p, e]) => [p, e] as [string, string | null]));
      // «Saiu» em espera: se a lista é mais nova que ele e traz a pessoa, ela
      // voltou; se não traz, a espera continua valendo até o fim.
      for (const [pessoa, p] of [...pendentes]) {
        if (novo.has(pessoa) && agora > p.em) { cancelar(pessoa); continue; }
        if (!novo.has(pessoa) && anterior.has(pessoa)) novo.set(pessoa, anterior.get(pessoa) ?? null);
      }
      mapa = novo;
      const limite = relogio() - GUARDA_AVISO_MS;
      guardados = guardados.filter(g => g.chegou >= limite);
      for (const g of guardados) if (g.aviso.em > agora) aplicar(g.aviso);
      aoMudar();
    },
    aplicarAviso(aviso) {
      guardados.push({ aviso, chegou: relogio() });
      if (aplicar(aviso)) aoMudar();
    },
    linhas() {
      return [...mapa];
    },
    encerrar() {
      for (const p of pendentes.values()) clearTimeout(p.timer);
      pendentes.clear();
    },
  };
}
