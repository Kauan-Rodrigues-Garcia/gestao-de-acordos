import { existsSync } from 'node:fs';
import path from 'node:path';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ARTES, DIA_DO_VI, LANCAMENTO_MS, TROCA_MS, VESPERA_DO_VI, ehDiaDoVi, escolherVi, indiceDaArte, partesDaContagem, textoDoConvite, useVi, viLigado } from './tema';
import { TETO_DO_VOLUME, volumeNaRampa, volumeReal } from './musica';

describe('tema do GTA VI: só em 18 e 19/11/2026', () => {
  it('vale na véspera e no dia, e em mais nenhum', () => {
    expect(ehDiaDoVi({ hoje: VESPERA_DO_VI, dev: false, previa: null })).toBe(true);
    expect(ehDiaDoVi({ hoje: DIA_DO_VI, dev: false, previa: null })).toBe(true);
    expect(ehDiaDoVi({ hoje: '2026-11-17', dev: false, previa: null })).toBe(false);
    expect(ehDiaDoVi({ hoje: '2026-11-20', dev: false, previa: null })).toBe(false);
    expect(ehDiaDoVi({ hoje: '2027-11-19', dev: false, previa: null })).toBe(false);
  });

  it('o convite fala de amanhã na véspera e de hoje no dia', () => {
    expect(textoDoConvite(VESPERA_DO_VI).titulo).toBe('Amanhã é dia de GTA VI');
    expect(textoDoConvite(VESPERA_DO_VI).fim).toBe('Depois de amanhã tudo volta ao normal.');
    expect(textoDoConvite(DIA_DO_VI).titulo).toBe('Hoje é dia de GTA VI');
    expect(textoDoConvite(DIA_DO_VI).fim).toBe('Amanhã tudo volta ao normal.');
  });

  it('a prévia só vale no npm run dev', () => {
    // Fora do dev, o que estiver gravado no navegador não liga nem desliga nada.
    expect(ehDiaDoVi({ hoje: '2026-11-16', dev: false, previa: 'on' })).toBe(false);
    expect(ehDiaDoVi({ hoje: DIA_DO_VI, dev: false, previa: 'off' })).toBe(true);
    // No dev, ela manda nos dois sentidos; sem prévia, vale a data.
    expect(ehDiaDoVi({ hoje: '2026-11-16', dev: true, previa: 'on' })).toBe(true);
    expect(ehDiaDoVi({ hoje: DIA_DO_VI, dev: true, previa: 'off' })).toBe(false);
    expect(ehDiaDoVi({ hoje: '2026-11-16', dev: true, previa: null })).toBe(false);
  });

  it('o tema não liga sozinho: só para quem ativou, e só no dia', () => {
    // No dia, sem resposta ao convite: nada muda na tela.
    expect(viLigado(true, null)).toBe(false);
    expect(viLigado(true, 'nao')).toBe(false);
    expect(viLigado(true, 'sim')).toBe(true);
    // Fora do dia, nem quem ativou: no dia 20 o tema sai sozinho.
    expect(viLigado(false, 'sim')).toBe(false);
  });
});

describe('convite do GTA VI: uma vez só', () => {
  // `escolha === null` é o que faz o `Layout` mostrar o convite.
  const pessoa = 'pessoa-teste';
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-18T12:00:00-03:00'));
  });
  afterEach(() => { vi.useRealTimers(); localStorage.clear(); });

  it('quem ativa não vê mais o convite e o tema segue ligado ao recarregar e no dia seguinte', () => {
    const primeira = renderHook(() => useVi(pessoa));
    expect(primeira.result.current).toMatchObject({ noDia: true, escolha: null, ligado: false });

    act(() => escolherVi(pessoa, 'sim'));
    expect(primeira.result.current).toMatchObject({ escolha: 'sim', ligado: true });
    primeira.unmount();

    // Recarregar a página é montar de novo, com o que ficou gravado.
    const recarga = renderHook(() => useVi(pessoa));
    expect(recarga.result.current).toMatchObject({ escolha: 'sim', ligado: true });
    recarga.unmount();

    vi.setSystemTime(new Date('2026-11-19T09:00:00-03:00'));
    const noDia19 = renderHook(() => useVi(pessoa));
    expect(noDia19.result.current).toMatchObject({ noDia: true, escolha: 'sim', ligado: true });
    noDia19.unmount();

    vi.setSystemTime(new Date('2026-11-20T00:00:00-03:00'));
    expect(renderHook(() => useVi(pessoa)).result.current).toMatchObject({ noDia: false, ligado: false });
  });

  it('sem armazenamento no navegador, ativar também fecha o convite', () => {
    const gravar = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('cheio'); });
    const { result } = renderHook(() => useVi('sem-armazenamento'));
    act(() => escolherVi('sem-armazenamento', 'sim'));
    expect(result.current).toMatchObject({ escolha: 'sim', ligado: true });
    gravar.mockRestore();
  });
});

describe('contagem até o lançamento do GTA VI', () => {
  it('acaba à meia-noite do dia 19 em Brasília (03:00 UTC)', () => {
    expect(new Date(LANCAMENTO_MS).toISOString()).toBe('2026-11-19T03:00:00.000Z');
  });

  it('mostra horas, minutos e segundos que faltam', () => {
    expect(partesDaContagem(LANCAMENTO_MS - (16 * 3600 + 5 * 60 + 9) * 1000)).toEqual(['16', '05', '09']);
    expect(partesDaContagem(LANCAMENTO_MS - 3_600_000)).toEqual(['01', '00', '00']);
  });

  it('só zera na hora exata, e depois não volta', () => {
    expect(partesDaContagem(LANCAMENTO_MS - 1)).toEqual(['00', '00', '01']);
    expect(partesDaContagem(LANCAMENTO_MS)).toBeNull();
    expect(partesDaContagem(LANCAMENTO_MS + 60_000)).toBeNull();
  });
});

describe('carrossel de artes do GTA VI', () => {
  it('toda arte da lista existe em public/vi', () => {
    for (const arte of ARTES) {
      expect(existsSync(path.join(process.cwd(), 'public', arte.src)), arte.src).toBe(true);
    }
    expect(new Set(ARTES.map(a => a.src)).size).toBe(ARTES.length);
  });

  it('a arte sai do relógio: a mesma para todo mundo, uma depois da outra, em volta', () => {
    const inicio = 1_000 * TROCA_MS;
    const primeira = indiceDaArte(inicio);
    // Dentro da mesma janela não troca; na virada, passa para a seguinte.
    expect(indiceDaArte(inicio + TROCA_MS - 1)).toBe(primeira);
    expect(indiceDaArte(inicio + TROCA_MS)).toBe((primeira + 1) % ARTES.length);
    // Depois de uma volta inteira, a mesma arte de novo.
    expect(indiceDaArte(inicio + ARTES.length * TROCA_MS)).toBe(primeira);
  });
});

describe('música do GTA VI', () => {
  it('o arquivo existe', () => {
    expect(existsSync(path.join(process.cwd(), 'public', 'vi', 'musica.mp3'))).toBe(true);
  });

  it('a barra de volume tem teto: o «alto» não é o volume inteiro', () => {
    expect(volumeReal(0)).toBe(0);
    expect(volumeReal(100)).toBe(TETO_DO_VOLUME);
    expect(volumeReal(50)).toBeCloseTo(TETO_DO_VOLUME / 2);
    expect(volumeReal(250)).toBe(TETO_DO_VOLUME);
  });

  it('começa bem baixinho e vai aumentando', () => {
    // Sai do zero, e na metade do tempo ainda está em um quarto do volume.
    expect(volumeNaRampa(0, 0.4, 0, 8000)).toBe(0);
    expect(volumeNaRampa(0, 0.4, 4000, 8000)).toBeCloseTo(0.1);
    expect(volumeNaRampa(0, 0.4, 8000, 8000)).toBeCloseTo(0.4);
    // Nunca passa do alvo, nem com o relógio adiantado.
    expect(volumeNaRampa(0, 0.4, 99_000, 8000)).toBeCloseTo(0.4);
  });

  it('para diminuindo o volume, não de uma vez', () => {
    expect(volumeNaRampa(0.4, 0, 0, 2000)).toBeCloseTo(0.4);
    expect(volumeNaRampa(0.4, 0, 1000, 2000)).toBeCloseTo(0.2);
    expect(volumeNaRampa(0.4, 0, 2000, 2000)).toBe(0);
  });
});
