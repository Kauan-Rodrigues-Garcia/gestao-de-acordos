import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/realtime', () => ({ assinarTabela: vi.fn(() => () => {}) }));
vi.mock('@/lib/supabaseSemTipo', () => ({ rpcSemTipo: vi.fn() }));

import { ENTRE_TENTATIVAS_MS, SILENCIO_MINIMO_MS, deveTentar, lerParabens, topicoDosParabens } from './parabensAoVivo';

describe('parabéns ao vivo', () => {
  it('o tópico é o da cidade', () => {
    expect(topicoDosParabens('birigui')).toBe('natal_parabens:birigui');
    expect(topicoDosParabens('marilia')).toBe('natal_parabens:marilia');
  });

  it('tenta o banco só com a cidade quieta e uma vez a cada 10 s', () => {
    const agora = 100_000;
    expect(deveTentar({ agora, ultimoColega: 0, ultimaTentativa: 0 })).toBe(true);
    expect(deveTentar({ agora, ultimoColega: agora - SILENCIO_MINIMO_MS + 1, ultimaTentativa: 0 })).toBe(false);
    expect(deveTentar({ agora, ultimoColega: 0, ultimaTentativa: agora - ENTRE_TENTATIVAS_MS + 1 })).toBe(false);
    expect(deveTentar({ agora, ultimoColega: agora - SILENCIO_MINIMO_MS, ultimaTentativa: agora - ENTRE_TENTATIVAS_MS })).toBe(true);
  });

  it('lê só o parabéns do show que está no palco', () => {
    const p = { chave: 'k1', pessoa: 'u1', nome: ' Ana Clara Souza ', foto: '', frase: 3 };
    expect(lerParabens(p, 'k1')).toEqual({ pessoa: 'u1', nome: 'Ana Clara Souza', foto: null, frase: 3 });
    expect(lerParabens(p, 'outro')).toBeNull();
    expect(lerParabens({ ...p, frase: -1 }, 'k1')).toBeNull();
    expect(lerParabens({ ...p, frase: 'x' }, 'k1')).toBeNull();
    expect(lerParabens({ ...p, nome: '' }, 'k1')).toBeNull();
    expect(lerParabens({ ...p, foto: 'https://x/f.jpg' }, 'k1')?.foto).toBe('https://x/f.jpg');
    expect(lerParabens(null, 'k1')).toBeNull();
  });
});
