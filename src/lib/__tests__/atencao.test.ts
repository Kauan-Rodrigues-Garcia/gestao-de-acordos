/**
 * «Ninguém olhando» (09/11/2026): o que pausa as animações e adia as
 * releituras quando a pessoa está em outra janela ou outra aba.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  REVISITA_MS, SEM_FOCO_MS, atencaoAgora, calcularAtencao, ninguemOlhando, ouvirAtencao, ouvirVolta,
  zerarAtencaoParaTeste,
} from '../atencao';

describe('calcularAtencao (a conta)', () => {
  const base = { oculta: false, isenta: false, perdeuFoco: null, ultimoSinal: 0, agora: 100_000 };

  it('com foco, olhando', () => {
    expect(calcularAtencao(base)).toBe('olhando');
  });
  it('aba oculta, oculta', () => {
    expect(calcularAtencao({ ...base, oculta: true })).toBe('oculta');
  });
  it('sem foco: olhando até SEM_FOCO_MS, depois de lado', () => {
    expect(calcularAtencao({ ...base, perdeuFoco: base.agora - SEM_FOCO_MS + 1 })).toBe('olhando');
    expect(calcularAtencao({ ...base, perdeuFoco: base.agora - SEM_FOCO_MS })).toBe('de-lado');
  });
  it('o mouse passando por cima conta como olhando', () => {
    expect(calcularAtencao({ ...base, perdeuFoco: 0, ultimoSinal: base.agora - 1000 })).toBe('olhando');
  });
  it('a TV da parede nunca sai de olhando, nem oculta', () => {
    expect(calcularAtencao({ ...base, isenta: true, oculta: true, perdeuFoco: 0 })).toBe('olhando');
  });
});

describe('os eventos da janela', () => {
  let foco = true;
  let visivel: DocumentVisibilityState = 'visible';

  beforeEach(() => {
    vi.useFakeTimers();
    zerarAtencaoParaTeste();
    foco = true;
    visivel = 'visible';
    vi.spyOn(document, 'hasFocus').mockImplementation(() => foco);
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visivel });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    zerarAtencaoParaTeste();
  });

  const sairDaJanela = () => { foco = false; window.dispatchEvent(new Event('blur')); vi.advanceTimersByTime(1); };
  const voltarParaJanela = () => { foco = true; window.dispatchEvent(new Event('focus')); };

  it('perdeu o foco: 10 s depois, de lado; voltou, olhando', () => {
    const estados: string[] = [];
    const parar = ouvirAtencao(a => estados.push(a));
    sairDaJanela();
    expect(atencaoAgora()).toBe('olhando');
    vi.advanceTimersByTime(SEM_FOCO_MS);
    expect(atencaoAgora()).toBe('de-lado');
    expect(ninguemOlhando()).toBe(true);
    expect(document.documentElement.getAttribute('data-ninguem-olhando')).toBe('de-lado');
    voltarParaJanela();
    expect(atencaoAgora()).toBe('olhando');
    expect(document.documentElement.hasAttribute('data-ninguem-olhando')).toBe(false);
    expect(estados).toEqual(['de-lado', 'olhando']);
    parar();
  });

  it('o foco foi para um iframe da página (blur, mas hasFocus segue true): continua olhando', () => {
    window.dispatchEvent(new Event('blur'));
    vi.advanceTimersByTime(SEM_FOCO_MS * 2);
    expect(atencaoAgora()).toBe('olhando');
  });

  it('a volta avisa quem ficou devendo; de lado, também a cada REVISITA_MS', () => {
    const volta = vi.fn();
    const parar = ouvirVolta(volta);
    sairDaJanela();
    vi.advanceTimersByTime(SEM_FOCO_MS);
    expect(volta).not.toHaveBeenCalled();
    vi.advanceTimersByTime(REVISITA_MS);
    expect(volta).toHaveBeenCalledTimes(1);
    voltarParaJanela();
    expect(volta).toHaveBeenCalledTimes(2);
    parar();
  });

  it('aba oculta: ninguemOlhando lê na hora, e a volta da aba avisa', () => {
    const volta = vi.fn();
    const parar = ouvirVolta(volta);
    visivel = 'hidden';
    expect(ninguemOlhando()).toBe(true);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(atencaoAgora()).toBe('oculta');
    visivel = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    expect(atencaoAgora()).toBe('olhando');
    expect(volta).toHaveBeenCalledTimes(1);
    parar();
  });

  it('mexer o mouse por cima da janela sem foco adia o «de lado»', () => {
    sairDaJanela();
    vi.advanceTimersByTime(SEM_FOCO_MS - 2000);
    window.dispatchEvent(new Event('pointermove'));
    vi.advanceTimersByTime(SEM_FOCO_MS - 1000);
    expect(atencaoAgora()).toBe('olhando');
    vi.advanceTimersByTime(2000);
    expect(atencaoAgora()).toBe('de-lado');
  });
});
