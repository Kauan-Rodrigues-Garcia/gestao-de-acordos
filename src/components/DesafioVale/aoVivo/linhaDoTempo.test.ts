import { describe, expect, it } from 'vitest';
import { cenaDoShow, fimDaRevelacao, ganhadoresMostrados, GIRO_S, inicioDoGiro, PAUSA_S, type ShowJson } from './linhaDoTempo';

const T0 = Date.parse('2026-11-26T18:00:00Z') / 1000;
const iso = (s: number) => new Date(s * 1000).toISOString();
const pessoas = ['Ana', 'Bia', 'Caio', 'Duda', 'Eli'].map((nome, i) => ({ perfil_id: `p${i}`, nome }));

function show(extra: Partial<ShowJson>): ShowJson {
  return {
    id: 1, setor_id: 's', setor_nome: 'Play 1', premio: 'hot dog', estado: 'contagem', qtd: 2,
    criado_em: iso(T0 - 60), revela_em: iso(T0), revelado_em: null, encerrado_em: null, plateia: 30,
    concorrentes: pessoas, ganhadores: null, ...extra,
  };
}

describe('cenaDoShow', () => {
  it('aberto: aguardando', () => {
    expect(cenaDoShow(show({ estado: 'aberto', revela_em: null }), T0).fase).toBe('aguardando');
  });

  it('contagem: preparando, depois 5…1, depois gira', () => {
    const s = show({});
    expect(cenaDoShow(s, T0 - 6).fase).toBe('preparando');
    expect(cenaDoShow(s, T0 - 4.9)).toMatchObject({ fase: 'contagem', numero: 5 });
    expect(cenaDoShow(s, T0 - 0.2)).toMatchObject({ fase: 'contagem', numero: 1 });
    expect(cenaDoShow(s, T0 + 1).fase).toBe('sorteando');
  });

  it('sem ganhador o rolo nunca para em ninguém', () => {
    const s = show({});
    for (let t = 0; t < 30; t += 0.37) expect(cenaDoShow(s, T0 + t).fase).toBe('sorteando');
  });

  it('revelado: cada ganhador gira, para no nome certo e fica até o próximo', () => {
    const s = show({ estado: 'revelado', revelado_em: iso(T0 + 0.4), ganhadores: [
      { posicao: 1, perfil_id: 'p3', nome: 'Duda' }, { posicao: 2, perfil_id: 'p0', nome: 'Ana' }] });
    const base = T0 + 0.4;
    expect(inicioDoGiro(s, 0)).toBeCloseTo(base);
    const girando = cenaDoShow(s, base + 1);
    expect(girando).toMatchObject({ fase: 'revelando', indice: 0, parado: false });
    expect(ganhadoresMostrados(s, girando)).toEqual([]);
    // O freio termina no ganhador: o passo seguinte ao último do giro é ele.
    expect(cenaDoShow(s, base + GIRO_S - 0.001)).toMatchObject({ nome: 'Caio' });
    const parado = cenaDoShow(s, base + GIRO_S + 0.1);
    expect(parado).toMatchObject({ fase: 'revelando', indice: 0, parado: true, nome: 'Duda' });
    expect(ganhadoresMostrados(s, parado).map(g => g.nome)).toEqual(['Duda']);
    // O segundo: a Duda já saiu do rolo.
    const passo = GIRO_S + PAUSA_S;
    for (let t = 0; t < GIRO_S; t += 0.05) {
      const c = cenaDoShow(s, base + passo + t);
      expect(c.fase === 'revelando' && c.nome).not.toBe('Duda');
    }
    expect(cenaDoShow(s, base + passo + GIRO_S + 0.1)).toMatchObject({ indice: 1, parado: true, nome: 'Ana' });
    expect(cenaDoShow(s, fimDaRevelacao(s)! + PAUSA_S + 0.1).fase).toBe('final');
  });

  it('o revelado chegou atrasado: a cena conta do revelado_em, não da contagem', () => {
    const s = show({ estado: 'revelado', revelado_em: iso(T0 + 3), ganhadores: [{ posicao: 1, perfil_id: 'p1', nome: 'Bia' }] });
    expect(cenaDoShow(s, T0 + 2).fase).toBe('sorteando');
    expect(cenaDoShow(s, T0 + 3.5)).toMatchObject({ fase: 'revelando', indice: 0, parado: false });
  });

  it('recarregou depois do fim: tudo parado, todos os ganhadores', () => {
    const s = show({ estado: 'revelado', revelado_em: iso(T0), ganhadores: [
      { posicao: 1, perfil_id: 'p3', nome: 'Duda' }, { posicao: 2, perfil_id: 'p0', nome: 'Ana' }] });
    const c = cenaDoShow(s, T0 + 600);
    expect(c.fase).toBe('final');
    expect(ganhadoresMostrados(s, c)).toHaveLength(2);
  });

  it('encerrado e cancelado: fim', () => {
    expect(cenaDoShow(show({ estado: 'encerrado' }), T0).fase).toBe('fim');
    expect(cenaDoShow(show({ estado: 'cancelado' }), T0).fase).toBe('fim');
  });
});
