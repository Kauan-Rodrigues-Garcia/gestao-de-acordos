/**
 * Modo Batman (05/10/2026): entra com a faixa tocando, fica com ela pausada,
 * sai ao trocar, não reentra no meio da saída e volta montado no F5.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DESCIDA_MS, SEGURA_MS, SUBIDA_MS, decidir, duracaoDaFase, nivelEm, type EstadoBatman,
} from './modoBatman';
import { mirar } from './miraDaLanterna';

describe('nível e decisão (puros)', () => {
  it('o nível sobe em 3,5 s, segura na saída enquanto ele some e desce em 8 s', () => {
    const entrando: EstadoBatman = { fase: 'entrando', desde: 1000, n0: 0 };
    expect(nivelEm(entrando, 1000)).toBe(0);
    expect(nivelEm(entrando, 1000 + SUBIDA_MS / 2)).toBeCloseTo(0.5);
    expect(nivelEm(entrando, 1000 + SUBIDA_MS * 2)).toBe(1);
    const saindo: EstadoBatman = { fase: 'saindo', desde: 0, n0: 1 };
    expect(nivelEm(saindo, SEGURA_MS - 1)).toBe(1);
    expect(nivelEm(saindo, SEGURA_MS + DESCIDA_MS / 2)).toBeCloseTo(0.5);
    expect(nivelEm(saindo, SEGURA_MS + DESCIDA_MS)).toBe(0);
    expect(nivelEm({ fase: 'dentro', desde: 0, n0: 1 }, 99)).toBe(1);
    expect(nivelEm({ fase: 'fora', desde: 0, n0: 0 }, 99)).toBe(0);
  });

  it('saída no meio da entrada parte de onde estava, e dura proporcional', () => {
    const saindo: EstadoBatman = { fase: 'saindo', desde: 0, n0: 0.4 };
    expect(nivelEm(saindo, 0)).toBe(0.4);
    expect(duracaoDaFase(saindo)).toBe(SEGURA_MS + 0.4 * DESCIDA_MS);
    expect(duracaoDaFase({ fase: 'entrando', desde: 0, n0: 0.25 })).toBe(0.75 * SUBIDA_MS);
    expect(duracaoDaFase({ fase: 'dentro', desde: 0, n0: 1 })).toBeNull();
  });

  it('entra só tocando; pausa não tira; trocar tira; na saída espera terminar', () => {
    expect(decidir('fora', { faixa: 'batman', tocando: true })).toBe('entrar');
    expect(decidir('fora', { faixa: 'batman', tocando: false })).toBeNull();
    expect(decidir('dentro', { faixa: 'batman', tocando: false })).toBeNull();
    expect(decidir('entrando', { faixa: 'halloween', tocando: true })).toBe('sair');
    expect(decidir('dentro', { faixa: 'sexta13', tocando: false })).toBe('sair');
    expect(decidir('saindo', { faixa: 'batman', tocando: true })).toBeNull();
  });

  it('a lanterna mira: alvo à direita na mesma altura do braço = quase reto', () => {
    // O ombro fica 34 px acima: o feixe sai um pouco para baixo para cruzar o alvo.
    const reto = mirar({ x: 0, y: 0 }, { x: 400, y: 0 });
    expect(reto.ang).toBeGreaterThan(-1);
    expect(reto.ang).toBeLessThan(1);
    expect(reto.x).toBeGreaterThan(390);
    const abaixo = mirar({ x: 0, y: 0 }, { x: 300, y: 150 });
    expect(abaixo.ang).toBeGreaterThan(20);
    // Nunca aponta para trás nem para dentro da barra.
    expect(mirar({ x: 0, y: 0 }, { x: 300, y: -400 }).ang).toBe(-4);
  });
});

// ── A loja, com o motor de mentira ──────────────────────────────────────────

type Som = { perfil: string | null; estado: string; noAr: string | null; silenciado: boolean; prefs: { faixa: string } };
const ctl = vi.hoisted(() => ({
  snap: { perfil: null, estado: 'parado', noAr: null, silenciado: false, prefs: { faixa: 'halloween' } } as Som,
  ouvintes: new Set<() => void>(),
  ligado: true,
}));
// O tema está desligado no site (06/10/2026); os testes do comportamento o ligam.
vi.mock('../SomAmbiente/preferencias', async importOriginal => ({
  ...(await importOriginal<typeof import('../SomAmbiente/preferencias')>()),
  get BATMAN_LIGADO() { return ctl.ligado; },
}));
vi.mock('../SomAmbiente/motor', () => ({
  lerEstadoSom: () => ctl.snap,
  assinarSom: (o: () => void) => { ctl.ouvintes.add(o); return () => ctl.ouvintes.delete(o); },
}));
function som(parcial: Partial<Som>) {
  ctl.snap = { ...ctl.snap, ...parcial, prefs: { ...ctl.snap.prefs, ...(parcial.prefs ?? {}) } };
  for (const o of ctl.ouvintes) o();
}
async function carregar() {
  vi.resetModules();
  ctl.ouvintes.clear();
  return import('./modoBatman');
}

describe('modo Batman no navegador', () => {
  beforeEach(() => {
    localStorage.clear();
    ctl.ligado = true;
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance', 'Date'] });
    ctl.snap = { perfil: 'p1', estado: 'parado', noAr: null, silenciado: false, prefs: { faixa: 'halloween' } };
  });
  afterEach(() => vi.useRealTimers());

  it('entra ao tocar, fica pausado e sai ao trocar de faixa', async () => {
    const m = await carregar();
    expect(m.lerModoBatman().fase).toBe('fora');
    som({ estado: 'tocando', noAr: 'batman', prefs: { faixa: 'batman' } });
    expect(m.lerModoBatman().fase).toBe('entrando');
    vi.advanceTimersByTime(SUBIDA_MS);
    expect(m.lerModoBatman().fase).toBe('dentro');
    som({ estado: 'pausado' });
    vi.advanceTimersByTime(60_000);
    expect(m.lerModoBatman().fase).toBe('dentro');
    som({ estado: 'tocando', noAr: 'sexta13', prefs: { faixa: 'sexta13' } });
    expect(m.lerModoBatman().fase).toBe('saindo');
    vi.advanceTimersByTime(SEGURA_MS + DESCIDA_MS);
    expect(m.lerModoBatman().fase).toBe('fora');
  });

  it('a trava: play de novo no meio da saída só entra depois que ela termina', async () => {
    const m = await carregar();
    som({ estado: 'tocando', noAr: 'batman', prefs: { faixa: 'batman' } });
    vi.advanceTimersByTime(SUBIDA_MS);
    som({ estado: 'tocando', noAr: 'halloween', prefs: { faixa: 'halloween' } });
    vi.advanceTimersByTime(1000);
    som({ estado: 'tocando', noAr: 'batman', prefs: { faixa: 'batman' } });
    expect(m.lerModoBatman().fase).toBe('saindo');
    vi.advanceTimersByTime(SEGURA_MS + DESCIDA_MS);
    expect(m.lerModoBatman().fase).toBe('entrando');
  });

  it('F5 com o tema no ar: volta já montado se a faixa continua escolhida', async () => {
    let m = await carregar();
    som({ estado: 'tocando', noAr: 'batman', prefs: { faixa: 'batman' } });
    expect(localStorage.getItem('modo-batman:p1')).toBe('1');
    // Recarregou: o motor volta com a faixa escolhida e pausada.
    ctl.snap = { perfil: 'p1', estado: 'pausado', noAr: 'batman', silenciado: false, prefs: { faixa: 'batman' } };
    m = await carregar();
    expect(m.lerModoBatman().fase).toBe('dentro');
    // Recarregou com outra faixa escolhida: Halloween normal, e a marca sai.
    ctl.snap = { perfil: 'p1', estado: 'pausado', noAr: 'halloween', silenciado: false, prefs: { faixa: 'halloween' } };
    m = await carregar();
    expect(m.lerModoBatman().fase).toBe('fora');
    expect(localStorage.getItem('modo-batman:p1')).toBeNull();
  });

  it('desligado: a faixa toca e o tema não entra, nem no F5 com a marca de antes', async () => {
    ctl.ligado = false;
    localStorage.setItem('modo-batman:p1', '1');
    ctl.snap = { perfil: 'p1', estado: 'pausado', noAr: 'batman', silenciado: false, prefs: { faixa: 'batman' } };
    const m = await carregar();
    expect(m.lerModoBatman().fase).toBe('fora');
    expect(localStorage.getItem('modo-batman:p1')).toBeNull();
    som({ estado: 'tocando' });
    vi.advanceTimersByTime(SUBIDA_MS);
    expect(m.lerModoBatman().fase).toBe('fora');
  });

  it('logout volta ao normal sem animação', async () => {
    const m = await carregar();
    som({ estado: 'tocando', noAr: 'batman', prefs: { faixa: 'batman' } });
    som({ perfil: null, estado: 'parado', noAr: null });
    expect(m.lerModoBatman().fase).toBe('fora');
  });
});
