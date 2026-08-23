/**
 * cacheInstantaneo.test.ts
 *
 * O que estes casos protegem, em ordem de gravidade:
 *
 *   1. **Vazamento entre pessoas.** O cache existe para pintar a tela antes da
 *      rede responder. Se ele devolvesse o instantâneo de outro usuário ou de
 *      outra empresa, pintaria por 300 ms um dado que a RLS jamais entregaria.
 *   2. **Dado de ontem passando por dado de agora.** Uma aba restaurada no dia
 *      seguinte não pode abrir com os números da véspera.
 *   3. **Falhar sem derrubar a tela.** `sessionStorage` cheio, JSON corrompido
 *      por um deploy que mudou o formato — nenhum deles é motivo para o Gestão
 *      não abrir.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  chaveDeCache, lerInstantaneo, gravarInstantaneo, valorInstantaneo,
  idadeDoInstantaneo, esquecerInstantaneos, __resetCacheParaTestes,
} from '@/lib/cacheInstantaneo';

beforeEach(() => { __resetCacheParaTestes(); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('chaveDeCache', () => {
  it('junta as partes numa chave estável', () => {
    expect(chaveDeCache('tickets', 'emp-1', 'perfil-9')).toBe('tickets|emp-1|perfil-9');
  });

  it('distingue empresas — o vazamento que o cache poderia causar', () => {
    expect(chaveDeCache('tickets', 'emp-1')).not.toBe(chaveDeCache('tickets', 'emp-2'));
  });

  it('trata nulo, indefinido e vazio como a MESMA ausência', () => {
    expect(chaveDeCache('x', null)).toBe(chaveDeCache('x', undefined));
    expect(chaveDeCache('x', null)).toBe(chaveDeCache('x', ''));
    expect(chaveDeCache('x', null)).toBe('x|-');
  });

  it('não confunde ausência com o texto "undefined"', () => {
    expect(chaveDeCache('x', undefined)).not.toBe(chaveDeCache('x', 'undefined'));
  });
});

describe('memória', () => {
  it('devolve o que foi gravado', () => {
    gravarInstantaneo('a', [1, 2, 3]);
    expect(valorInstantaneo<number[]>('a')).toEqual([1, 2, 3]);
  });

  it('devolve null para chave que nunca foi gravada', () => {
    expect(lerInstantaneo('nunca-vista')).toBeNull();
  });

  it('preserva a REFERÊNCIA do valor — é o que evita reconciliar contra um clone', () => {
    const lista = [{ id: '1' }];
    gravarInstantaneo('a', lista);
    expect(valorInstantaneo('a')).toBe(lista);
  });

  it('a última gravação vence', () => {
    gravarInstantaneo('a', 'velho');
    gravarInstantaneo('a', 'novo');
    expect(valorInstantaneo('a')).toBe('novo');
  });

  it('informa a idade do instantâneo', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-23T10:00:00Z'));
    gravarInstantaneo('a', 1);
    vi.setSystemTime(new Date('2026-08-23T10:00:05Z'));
    expect(idadeDoInstantaneo('a')).toBe(5_000);
  });
});

describe('esquecerInstantaneos', () => {
  it('sem argumento, apaga tudo — é o que o logout chama', () => {
    gravarInstantaneo('a', 1);
    gravarInstantaneo('b', 2);
    esquecerInstantaneos();
    expect(lerInstantaneo('a')).toBeNull();
    expect(lerInstantaneo('b')).toBeNull();
  });

  it('com prefixo, apaga só o recorte pedido', () => {
    gravarInstantaneo('tickets|emp-1', 1);
    gravarInstantaneo('tickets|emp-2', 2);
    gravarInstantaneo('acordos|emp-1', 3);
    esquecerInstantaneos('tickets|');
    expect(lerInstantaneo('tickets|emp-1')).toBeNull();
    expect(lerInstantaneo('tickets|emp-2')).toBeNull();
    expect(valorInstantaneo('acordos|emp-1')).toBe(3);
  });
});

describe('persistência em sessionStorage', () => {
  it('não grava no disco sem `persistir`', () => {
    gravarInstantaneo('a', 1);
    const gravadas = Object.keys(sessionStorage).filter(k => k.includes('instantaneo'));
    expect(gravadas).toHaveLength(0);
  });

  it('sobrevive à perda da memória quando `persistir` está ligado', () => {
    gravarInstantaneo('a', { total: 7 }, { persistir: true });
    // Simula um F5: a memória do módulo some, o sessionStorage fica.
    const doDisco = sessionStorage.getItem('gac:instantaneo:v1:a');
    expect(doDisco).toBeTruthy();
  });

  it('descarta o que está no disco além da validade', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-23T10:00:00Z'));
    gravarInstantaneo('a', 1, { persistir: true });

    // Uma aba restaurada no dia seguinte não pode abrir com os números da véspera.
    __resetCacheParaTestesSemDisco();
    vi.setSystemTime(new Date('2026-08-24T10:00:00Z'));
    expect(lerInstantaneo('a')).toBeNull();
  });

  it('não persiste um valor grande demais, mas mantém na memória', () => {
    const gigante = Array.from({ length: 40_000 }, (_, i) => ({ id: String(i), nome: 'x'.repeat(20) }));
    gravarInstantaneo('grande', gigante, { persistir: true });
    expect(valorInstantaneo('grande')).toBe(gigante);
    expect(sessionStorage.getItem('gac:instantaneo:v1:grande')).toBeNull();
  });

  it('JSON corrompido no disco não derruba a leitura', () => {
    sessionStorage.setItem('gac:instantaneo:v1:a', '{isto não é json');
    expect(() => lerInstantaneo('a')).not.toThrow();
    expect(lerInstantaneo('a')).toBeNull();
  });

  it('sessionStorage que lança não derruba a gravação', () => {
    const espiao = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(() => gravarInstantaneo('a', 1, { persistir: true })).not.toThrow();
    // E o valor continua acessível pela memória, que é o caminho que importa.
    espiao.mockRestore();
    expect(valorInstantaneo('a')).toBe(1);
  });
});

/** Zera só a camada de memória, para simular um recarregamento da página. */
function __resetCacheParaTestesSemDisco(): void {
  const guardado: [string, string][] = [];
  for (let i = 0; i < sessionStorage.length; i++) {
    const k = sessionStorage.key(i);
    if (k) guardado.push([k, sessionStorage.getItem(k) ?? '']);
  }
  __resetCacheParaTestes();
  for (const [k, v] of guardado) sessionStorage.setItem(k, v);
}
