/**
 * diretoExtraNoRecorte — o setor/equipe NA TELA tem Direto e Extra? (16/11/2026)
 * O caso real: Receptivo ligado no setor, Eduarda Siviero ligada sozinha no
 * Play 5, e configs ligadas que apontam para equipes e pessoas apagadas.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

import { diretoExtraNoRecorte, type DiretoExtraConfig } from './direto_extra.service';

const cfg = (escopo: DiretoExtraConfig['escopo'], referencia_id: string, ativo: boolean): DiretoExtraConfig => ({
  id: `${escopo}:${referencia_id}`, empresa_id: 'bp', escopo, referencia_id, ativo, criado_em: '', atualizado_em: '',
});

const configs = [
  cfg('setor', 'receptivo', true),
  cfg('usuario', 'lorenzo', false),
  cfg('usuario', 'siviero', true),
  cfg('equipe', 'bruno', false),
  cfg('setor', 'jornada', false),
  cfg('equipe', 'apagada', true),
  cfg('usuario', 'apagado', true),
];
const equipes = new Map<string, string | null>([['bruno', 'play5'], ['rec1', 'receptivo'], ['p5a', 'play5'], ['p5b', 'play5']]);
const pessoas = new Map([['siviero', { setorId: 'play5', equipeId: 'p5a' }]]);
const no = (setorId: string | null, equipeId: string | null = null, c = configs) =>
  diretoExtraNoRecorte({ configs: c, setorId, equipeId, equipes, pessoas });

describe('diretoExtraNoRecorte', () => {
  it('setor ligado: o setor e as equipes dele', () => {
    expect(no('receptivo')).toBe(true);
    expect(no(null, 'rec1')).toBe(true);
  });

  it('setor sem config, mas com alguém ligado: o setor e a equipe dela, não a outra equipe', () => {
    expect(no('play5')).toBe(true);
    expect(no(null, 'p5a')).toBe(true);
    expect(no(null, 'p5b')).toBe(false);
  });

  it('setor desligado ou sem nada ligado: não', () => {
    expect(no('jornada')).toBe(false);
    expect(no('play2')).toBe(false);
  });

  it('config ligada de equipe ou pessoa apagada não liga nada', () => {
    const soOrfas = [cfg('equipe', 'apagada', true), cfg('usuario', 'apagado', true)];
    expect(no(null, null, soOrfas)).toBe(false);
    expect(no('play2', null, soOrfas)).toBe(false);
  });

  it('empresa inteira: vale se algo ligado existe', () => {
    expect(no(null)).toBe(true);
    expect(no(null, null, [cfg('setor', 'jornada', false)])).toBe(false);
  });

  it('equipe desligada à parte num setor ligado: não, a não ser que alguém dela esteja ligado', () => {
    const c = [cfg('setor', 'play5', true), cfg('equipe', 'bruno', false)];
    expect(no(null, 'bruno', c)).toBe(false);
    expect(no(null, 'p5b', c)).toBe(true);
  });
});
