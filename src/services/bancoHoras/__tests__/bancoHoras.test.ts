import { describe, it, expect } from 'vitest';
import {
  ehEstruturaAusente, linhasParaPosicoes, setorParaRpc,
  type LinhaBancoHoras, type SetorParaGravar,
} from '../bancoHoras.service';
import { chaveDp, semVinculo, setoresDoDp, sugerirSetor } from '../vinculos';

const linha = (o: Partial<LinhaBancoHoras>): LinhaBancoHoras => ({
  saldo_em: '2026-11-16', empresa_codigo: '3', empresa_nome: 'BOOK PLAY LTDA', setor_dp: 'HOME RECEPTIVO',
  depto: 'COBRANCA', hierarquia: null, arquivo: 'HOME RECEPTIVO.csv', gerado_em: '2026-11-16T14:05:00',
  usuario_dp: 'TALIA', importado_em: '2026-11-17T10:00:00+00:00',
  pessoas: [{ mat: '30355', nome: 'FULANA DE TAL', saldo: 125, em: '2026-11-16', venc: [['2027-11-25', 125]] }],
  ...o,
});

describe('linhasParaPosicoes', () => {
  it('agrupa por data, da mais antiga à mais nova, com a chave empresa|setor do painel', () => {
    const pos = linhasParaPosicoes([
      linha({ saldo_em: '2026-11-16' }),
      linha({ saldo_em: '2026-10-20', setor_dp: 'PLAY 2' }),
      linha({ saldo_em: '2026-11-16', setor_dp: 'PLAY 2', empresa_codigo: '5' }),
    ]);
    expect(pos.map(p => p.date)).toEqual(['2026-10-20', '2026-11-16']);
    expect(Object.keys(pos[1].setores).sort()).toEqual(['3|HOME RECEPTIVO', '5|PLAY 2']);
    expect(pos[1].setores['3|HOME RECEPTIVO'].people[0].saldo).toBe(125);
  });

  it('o «gerado» volta no formato do painel e a posição fica com o mais recente', () => {
    const [pos] = linhasParaPosicoes([
      linha({ gerado_em: '2026-11-16T14:05:00' }),
      linha({ setor_dp: 'PLAY 2', gerado_em: '2026-11-16T15:30:00' }),
    ]);
    expect(pos.setores['3|HOME RECEPTIVO'].gerado).toBe('2026-11-16 14:05');
    expect(pos.gerado).toBe('2026-11-16 15:30');
  });

  it('pessoas que não vieram como lista viram lista vazia, sem quebrar', () => {
    const [pos] = linhasParaPosicoes([linha({ pessoas: null as unknown as [] })]);
    expect(pos.setores['3|HOME RECEPTIVO'].people).toEqual([]);
  });
});

describe('setorParaRpc', () => {
  const setor: SetorParaGravar = {
    date: '2026-11-16', assinatura: '30355:125:2027-11-25=125', setor: 'HOME RECEPTIVO', depto: 'COBRANCA',
    hierarquia: null, empresa: 'BOOK PLAY LTDA', empresaCode: '3', arquivo: 'x.csv', gerado: '2026-11-16 14:05',
    usuario: 'TALIA', people: [{ mat: '30355', nome: 'FULANA', saldo: 125, em: null, venc: [['2027-11-25', 125]] }],
  };

  it('manda o que a RPC espera, com o «gerado» como timestamp', () => {
    const r = setorParaRpc(setor);
    expect(r).toMatchObject({
      saldo_em: '2026-11-16', empresa_codigo: '3', setor_dp: 'HOME RECEPTIVO',
      gerado_em: '2026-11-16T14:05:00', assinatura: '30355:125:2027-11-25=125',
    });
    expect(r.pessoas).toEqual([{ mat: '30355', nome: 'FULANA', saldo: 125, em: null, venc: [['2027-11-25', 125]] }]);
  });

  it('só a data, ou nada, no «gerado» também serve', () => {
    expect(setorParaRpc({ ...setor, gerado: '2026-11-16' }).gerado_em).toBe('2026-11-16T00:00:00');
    expect(setorParaRpc({ ...setor, gerado: null }).gerado_em).toBeNull();
  });

  it('ida e volta: o que o banco devolve é o que o painel mandou', () => {
    const r = setorParaRpc(setor);
    const [pos] = linhasParaPosicoes([{ ...r, importado_em: null }]);
    const s = pos.setores['3|HOME RECEPTIVO'];
    expect(s.people).toEqual(setor.people);
    expect(s.gerado).toBe(setor.gerado);
  });
});

describe('ehEstruturaAusente', () => {
  it('reconhece a tabela que ainda não existe', () => {
    expect(ehEstruturaAusente('relation "public.banco_horas_setores" does not exist')).toBe(true);
    expect(ehEstruturaAusente("Could not find the table 'public.banco_horas_mapa' in the schema cache")).toBe(true);
    expect(ehEstruturaAusente('permission denied')).toBe(false);
  });
});

describe('vínculos', () => {
  const posicoes = linhasParaPosicoes([
    linha({ saldo_em: '2026-10-20', setor_dp: 'PLAY 2', pessoas: [] }),
    linha({ saldo_em: '2026-11-16', setor_dp: 'PLAY 2' }),
    linha({ saldo_em: '2026-11-16' }),
  ]);

  it('lista cada setor do DP uma vez, pelo relatório mais recente', () => {
    const dp = setoresDoDp(posicoes);
    expect(dp.map(s => s.setorDp)).toEqual(['HOME RECEPTIVO', 'PLAY 2']);
    expect(dp.find(s => s.setorDp === 'PLAY 2')).toMatchObject({ pessoas: 1, ultimaData: '2026-11-16' });
  });

  it('acha quem está sem setor do gestão ligado', () => {
    const dp = setoresDoDp(posicoes);
    const faltam = semVinculo(dp, [{ empresaCodigo: '3', setorDp: 'PLAY 2', setorId: 's1' }]);
    expect(faltam.map(s => s.chave)).toEqual([chaveDp('3', 'HOME RECEPTIVO')]);
  });

  it('sugere pelo nome inteiro, palavra a palavra', () => {
    const setores = [
      { id: 'rec', nome: 'Receptivo' }, { id: 'p2', nome: 'Play 2' }, { id: 'p20', nome: 'Play 20' },
      { id: 'rec0800', nome: 'Receptivo 0800' },
    ];
    expect(sugerirSetor('HOME RECEPTIVO', setores)).toBe('rec');
    expect(sugerirSetor('PLAY 2 - BH', setores)).toBe('p2');
    expect(sugerirSetor('PLAY 20', setores)).toBe('p20');
    // O mais específico ganha.
    expect(sugerirSetor('RECEPTIVO 0800', setores)).toBe('rec0800');
    expect(sugerirSetor('JURIDICO', setores)).toBeNull();
  });

  it('empate não sugere nada', () => {
    expect(sugerirSetor('PLAY MIX', [{ id: 'a', nome: 'Play' }, { id: 'b', nome: 'Mix' }])).toBeNull();
  });

  it('ignora acento e caixa', () => {
    expect(sugerirSetor('COBRANÇA JURÍDICA', [{ id: 'j', nome: 'Cobranca Juridica' }])).toBe('j');
  });
});
