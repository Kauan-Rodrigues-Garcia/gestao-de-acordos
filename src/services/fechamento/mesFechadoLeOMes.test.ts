/**
 * Mês fechado lê o MÊS (31/10/2026): as peças puras que fazem as telas trocarem
 * o «de hoje» pelo retrato — o lugar de quem olha, o treinamento das equipes,
 * a config guardada, a remuneração do RH e o recorte do selo.
 *
 * Decisão do Cleber: quem abre um mês fechado vê o setor e a equipe onde estava
 * naquele mês, com os números de lá.
 */
import { describe, it, expect } from 'vitest';
import { lugarDaResposta } from '@/hooks/useLugarNoMes';
import { configDaLinha, mesTemConfigGuardada, treinamentoComRetrato } from './configDoMes';
import { numerosDoAlcance, type NumeroSelo } from './selo.service';
import { vinculosDoMes } from '@/services/premiacoes/premiacoes.service';

describe('lugarDaResposta — onde eu estava no mês', () => {
  it('membro de uma equipe: ela é a principal', () => {
    const l = lugarDaResposta({
      do_retrato: true, setor_id: 'play1', setores: ['play1'], equipes: ['eq-a'],
      equipes_lideradas: [], equipe_principal: 'eq-a',
    });
    expect(l).toMatchObject({ setorId: 'play1', principal: 'eq-a', todas: ['eq-a'], doRetrato: true });
  });

  it('líder de duas equipes fica sem principal — escolher uma no escuro seria pior', () => {
    const l = lugarDaResposta({
      do_retrato: true, setor_id: 'play1', setores: ['play1', 'play2'], equipes: ['eq-a', 'eq-b'],
      equipes_lideradas: ['eq-a', 'eq-b'], equipe_principal: 'eq-a',
    });
    expect(l.principal).toBeNull();
    expect(l.lideradas).toEqual(['eq-a', 'eq-b']);
  });

  it('membro de uma e líder de outra: a principal é a de membro', () => {
    const l = lugarDaResposta({
      do_retrato: true, setor_id: 's', setores: ['s'], equipes: ['eq-m', 'eq-l'],
      equipes_lideradas: ['eq-l'], equipe_principal: 'eq-m',
    });
    expect(l.principal).toBe('eq-m');
  });

  it('listas nulas viram vazias', () => {
    const l = lugarDaResposta({
      do_retrato: true, setor_id: null, setores: null, equipes: null,
      equipes_lideradas: null, equipe_principal: null,
    });
    expect(l).toMatchObject({ setorId: null, setores: [], todas: [], principal: null });
  });
});

describe('mesTemConfigGuardada', () => {
  it('só mês fechado de outubro/2026 em diante', () => {
    expect(mesTemConfigGuardada('2026-09')).toBe(false);
    expect(mesTemConfigGuardada(null)).toBe(false);
    // O mês corrente nunca é «fechado».
    const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }).slice(0, 7);
    expect(mesTemConfigGuardada(hoje)).toBe(false);
  });
});

describe('treinamentoComRetrato', () => {
  const hoje = [
    { id: 'eq-1', treinamento: false, treinamento_inicio: null },
    { id: 'eq-2', treinamento: true, treinamento_inicio: '2026-11-03' },
  ];

  it('a equipe que estava no mês leva o treinamento do mês, não o de hoje', () => {
    const r = treinamentoComRetrato(hoje, [
      { equipe_id: 'eq-1', treinamento: true, treinamento_inicio: '2026-10-15' },
      { equipe_id: 'eq-2', treinamento: false, treinamento_inicio: null },
    ]);
    expect(r.find(e => e.id === 'eq-1')).toEqual({ id: 'eq-1', treinamento: true, treinamento_inicio: '2026-10-15' });
    expect(r.find(e => e.id === 'eq-2')?.treinamento).toBe(false);
  });

  it('nulo no retrato é «não guardado»: fica o de hoje', () => {
    const r = treinamentoComRetrato(hoje, [{ equipe_id: 'eq-2', treinamento: null, treinamento_inicio: null }]);
    expect(r.find(e => e.id === 'eq-2')?.treinamento).toBe(true);
  });

  it('equipe excluída depois do mês aparece pelo retrato', () => {
    const r = treinamentoComRetrato(hoje, [{ equipe_id: 'eq-velha', treinamento: true, treinamento_inicio: '2026-10-01' }]);
    expect(r.map(e => e.id)).toContain('eq-velha');
  });
});

describe('configDaLinha', () => {
  it('coluna ausente vira vazio, nunca undefined', () => {
    const c = configDaLinha({
      empresa_config: { ho_percentual: 0.226 }, ranking: null, pix_config: null, carteiras: null,
      subgrupos: null, rh_setores: null, direto_extra: null, pix_bonus: null,
    });
    expect(c.empresaConfig.ho_percentual).toBe(0.226);
    expect(c.carteiras).toEqual({ grupos: [], equipes: [] });
    expect(c.subgrupos).toEqual([]);
  });
});

describe('vinculosDoMes — RH do mês fechado', () => {
  const hoje = new Map([
    ['play1', { celula: 'Birigui', tipo: 'premiacao' as const }],
    ['play5', { celula: 'Marília', tipo: 'comissao' as const }],
  ]);

  it('sem config do mês: null, vale a de hoje', () => {
    expect(vinculosDoMes(hoje, null)).toBeNull();
  });

  it('o tipo é o do mês, mesmo que hoje seja outro', () => {
    const m = vinculosDoMes(hoje, [
      { setor_id: 'play1', celula_id: 'c-bir', tipo_remuneracao: 'comissao', ativo: true },
    ]);
    expect(m?.get('play1')).toEqual({ celula: 'Birigui', tipo: 'comissao' });
    // Play 5 não estava ligado no mês: fica de fora.
    expect(m?.has('play5')).toBe(false);
  });

  it('setor desligado hoje acha a cidade por outro setor da mesma célula', () => {
    const m = vinculosDoMes(hoje, [
      { setor_id: 'play1', celula_id: 'c-bir', tipo_remuneracao: 'premiacao', ativo: true },
      { setor_id: 'play4', celula_id: 'c-bir', tipo_remuneracao: 'comissao', ativo: true },
    ]);
    expect(m?.get('play4')).toEqual({ celula: 'Birigui', tipo: 'comissao' });
  });

  it('inativo no mês não entra', () => {
    const m = vinculosDoMes(hoje, [
      { setor_id: 'play1', celula_id: 'c-bir', tipo_remuneracao: 'premiacao', ativo: false },
    ]);
    expect(m?.size).toBe(0);
  });
});

describe('numerosDoAlcance — o recorte do selo', () => {
  const n = (p: Partial<NumeroSelo> & Pick<NumeroSelo, 'nivel' | 'alvoId'>): NumeroSelo => ({
    nome: p.alvoId, setorId: null, equipeId: null, recebido: 0, recebidoHo: 0, pagamentos: 0,
    ajuste: null, meta: null, ...p,
  });
  const numeros = [
    n({ nivel: 'setor', alvoId: 'play1', recebido: 10 }),
    n({ nivel: 'setor', alvoId: 'play2', recebido: 20 }),
    n({ nivel: 'operador', alvoId: 'ana', setorId: 'play1', recebido: 5 }),
    n({ nivel: 'operador', alvoId: 'bia', setorId: 'play2', recebido: 7 }),
  ];

  it('sem setor em foco: o nível inteiro, do maior para o menor', () => {
    expect(numerosDoAlcance(numeros, 'setor', null).map(x => x.alvoId)).toEqual(['play2', 'play1']);
  });

  it('com setor: o setor e as pessoas que estavam NELE no mês', () => {
    expect(numerosDoAlcance(numeros, 'setor', 'play1').map(x => x.alvoId)).toEqual(['play1']);
    expect(numerosDoAlcance(numeros, 'operador', 'play1').map(x => x.alvoId)).toEqual(['ana']);
  });
});
