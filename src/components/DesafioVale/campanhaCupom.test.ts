import { describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ perfil: null }) }));
vi.mock('@/hooks/useDesafioVale', () => ({ useDesafioVale: () => ({ data: null }) }));

import { pixDaCampanha, setoresDoCupom, type CampanhaCupom } from './campanhaCupom';
import type { DesafioVale, SetorNoVale } from '@/services/desafioVale/desafioVale.service';

const setor = (setor_id: string, extra: Partial<SetorNoVale> = {}): SetorNoVale => ({
  setor_id, nome: setor_id, cidade: null, regra: null, participa: true,
  pct: null, origem: null, pct_manual: null, pct_auto: null, recebido: null, meta: null, ...extra,
});

describe('Cupons do Pix: o setor é o da linha', () => {
  it('quem vê todos: só os setores que participam pelo Pix (a Manutenção é ranking)', () => {
    const ids = setoresDoCupom({
      setores: [setor('play1'), setor('manutencao', { cupom_regra: 'ranking' }), setor('jornada', { participa: false })],
      meu_setor: null,
    });
    expect([...ids]).toEqual(['play1']);
  });

  it('líder/operador: só o próprio setor, se participa', () => {
    expect([...setoresDoCupom({ setores: null, meu_setor: setor('receptivo') })]).toEqual(['receptivo']);
    expect(setoresDoCupom({ setores: null, meu_setor: setor('jornada', { participa: false }) }).size).toBe(0);
  });

  it('Pix da Jornada no período não é da campanha', () => {
    const c: CampanhaCupom = {
      d: { cupom_ativo: true, cupom_inicio: '2026-11-23', cupom_fim: '2026-11-26' } as DesafioVale,
      setores: new Set(['play1']),
    };
    const meioDia23 = '2026-11-23T15:00:00Z';
    expect(pixDaCampanha(c, meioDia23, 'play1')).toBe(true);
    expect(pixDaCampanha(c, meioDia23, 'jornada')).toBe(false);
    expect(pixDaCampanha(c, meioDia23, null)).toBe(false);
    expect(pixDaCampanha(c, '2026-11-27T15:00:00Z', 'play1')).toBe(false);
  });
});
