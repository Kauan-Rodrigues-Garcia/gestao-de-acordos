/**
 * A troca de fonte de um setor.
 *
 * ## O que se trava aqui
 *
 * **O botão não pode aparecer onde o banco recusa.** `PROJECAO_VAZIA` existe
 * porque trocar com projeção vazia apagaria o 58 e não poria nada no lugar —
 * o setor zeraria em ~30 telas. O banco recusa; a tela não pode nem oferecer.
 * É a mesma lição de `podeVincular` nas equipes sugeridas: botão que só sabe
 * falhar é pior que botão nenhum.
 *
 * **A frase precisa contar as linhas que vieram de outro setor.** É o número
 * que explica um setor vizinho ter encolhido sem ninguém mexer nele. Omiti-lo
 * transforma um efeito previsto em mistério.
 *
 * **Números vêm como texto.** PostgREST devolve `numeric` como string, e
 * `jsonb_build_object` não muda isso.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  porRpc: {} as Record<string, { data: unknown; error: { message: string } | null }>,
  args: {} as Record<string, unknown>,
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (nome: string, args: unknown) => {
      mock.args[nome] = args;
      const r = mock.porRpc[nome] ?? { data: null, error: null };
      return { then: (ok: (v: unknown) => unknown) => ok(r) };
    },
  },
}));

import {
  buscarFontesDosSetores,
  deltaDaLinha,
  devolverAo58,
  fraseDaTroca,
  podeTrocarPara59,
  podeVoltarPara58,
  trocarPara59,
  type LinhaDeFonte,
  type ResultadoTroca,
} from './fonteDoSetor.service';

/* Play 4 em setembro/2026, medido: 225 linhas e R$ 67.023,90 hoje; 254 linhas e
   R$ 73.052,59 com o 59. */
const PLAY4 = {
  setor_id: 'a2f0aad7-f108-40a3-9c68-80798c7fd5c1',
  setor_nome: 'Play 4',
  fonte: 'relatorio_58' as const,
  linhas_hoje: '225',
  valor_hoje: '67023.90',
  linhas_projetado: '254',
  valor_projetado: '73052.59',
  tem_lote_59: true,
  tem_guardado: false,
};

const linha = (over: Partial<LinhaDeFonte> = {}): LinhaDeFonte => ({
  setorId: 's', setorNome: 'S', fonte: 'relatorio_58',
  linhasHoje: 10, valorHoje: 100, linhasProjetado: 12, valorProjetado: 120,
  temLote59: true, temGuardado: false,
  ...over,
});

const troca = (over: Partial<ResultadoTroca> = {}): ResultadoTroca => ({
  removidas: 225, gravadas: 254, deOutroSetor: 0,
  valorAntes: 67023.90, valorDepois: 73052.59, delta: 6028.69,
  ...over,
});

beforeEach(() => { mock.porRpc = {}; mock.args = {}; });

describe('buscarFontesDosSetores', () => {
  it('converte os números e preserva a identidade do setor', async () => {
    mock.porRpc = { fn_mestre_fontes_dos_setores: { data: [PLAY4], error: null } };

    const [l] = await buscarFontesDosSetores('emp-1', '2026-09');

    expect(l.setorNome).toBe('Play 4');
    expect(l.fonte).toBe('relatorio_58');
    expect(l.linhasHoje).toBe(225);
    expect(l.valorHoje).toBeCloseTo(67023.90, 2);
    expect(l.valorProjetado).toBeCloseTo(73052.59, 2);
    expect(deltaDaLinha(l)).toBeCloseTo(6028.69, 2);
  });

  it('lista vazia não vira erro', async () => {
    mock.porRpc = { fn_mestre_fontes_dos_setores: { data: null, error: null } };
    await expect(buscarFontesDosSetores('emp-1', '2026-09')).resolves.toEqual([]);
  });
});

describe('podeTrocarPara59', () => {
  it('aceita o setor que ainda é do 58 e tem projeção', () => {
    expect(podeTrocarPara59(linha())).toBe(true);
  });

  /*
   * Sem lote vigente do 59 não há o que aplicar; o banco levanta SEM_LOTE_59.
   */
  it('recusa sem lote vigente do 59', () => {
    expect(podeTrocarPara59(linha({ temLote59: false }))).toBe(false);
  });

  /*
   * O caso perigoso: projeção vazia. Trocar apagaria o 58 e não poria nada no
   * lugar — o setor zeraria no Dashboard, no Painel Líder, no Analítico e na
   * comissão de uma vez. O banco recusa com PROJECAO_VAZIA; a tela não oferece.
   */
  it('recusa quando o 59 não projeta nada para o setor', () => {
    expect(podeTrocarPara59(linha({ linhasProjetado: 0, valorProjetado: 0 }))).toBe(false);
  });

  it('não oferece trocar o que já é do 59', () => {
    expect(podeTrocarPara59(linha({ fonte: 'relatorio_59' }))).toBe(false);
  });
});

describe('podeVoltarPara58', () => {
  it('só volta o que é do 59 e tem retrato guardado', () => {
    expect(podeVoltarPara58(linha({ fonte: 'relatorio_59', temGuardado: true }))).toBe(true);
  });

  /*
   * Sem retrato guardado, voltar apagaria o 59 e não reporia o 58 — o setor
   * ficaria vazio. O banco recusa com NADA_GUARDADO.
   */
  it('não volta sem retrato guardado', () => {
    expect(podeVoltarPara58(linha({ fonte: 'relatorio_59', temGuardado: false }))).toBe(false);
  });

  it('não volta o que nunca saiu do 58', () => {
    expect(podeVoltarPara58(linha({ fonte: 'relatorio_58', temGuardado: true }))).toBe(false);
  });
});

describe('trocarPara59 e devolverAo58', () => {
  it('converte o resultado da troca', async () => {
    mock.porRpc = {
      fn_mestre_aplicar_no_analitico: {
        data: {
          removidas: '225', gravadas: '254', de_outro_setor: '0',
          valor_antes: '67023.90', valor_depois: '73052.59', delta: '6028.69',
        },
        error: null,
      },
    };

    const r = await trocarPara59('emp-1', '2026-09', 'setor-play4');

    expect(r.removidas).toBe(225);
    expect(r.gravadas).toBe(254);
    expect(r.delta).toBeCloseTo(6028.69, 2);
    expect(mock.args.fn_mestre_aplicar_no_analitico).toMatchObject({
      p_mes: '2026-09', p_setor_id: 'setor-play4',
    });
  });

  it('recusa do banco chega com a mensagem do banco', async () => {
    mock.porRpc = {
      fn_mestre_aplicar_no_analitico: {
        data: null,
        error: { message: 'PROJECAO_VAZIA: o 59 nao projeta nenhuma linha…' },
      },
    };
    await expect(trocarPara59('emp-1', '2026-09', 's')).rejects.toThrow('PROJECAO_VAZIA');
  });

  it('resposta vazia vira erro, e não sucesso silencioso', async () => {
    mock.porRpc = { fn_mestre_aplicar_no_analitico: { data: null, error: null } };
    await expect(trocarPara59('emp-1', '2026-09', 's')).rejects.toThrow('não respondeu');
  });

  it('converte o resultado da volta', async () => {
    mock.porRpc = {
      fn_mestre_devolver_ao_58: {
        data: {
          tiradas_do_59: '254', guardadas: '225', voltaram: '225',
          ja_estavam: '0', valor_antes: '73052.59', valor_depois: '67023.90',
        },
        error: null,
      },
    };
    const r = await devolverAo58('emp-1', '2026-09', 's');
    expect(r.tiradasDo59).toBe(254);
    expect(r.voltaram).toBe(225);
    expect(r.valorDepois).toBeCloseTo(67023.90, 2);
  });
});

describe('fraseDaTroca', () => {
  it('diz as linhas e o delta', () => {
    const f = fraseDaTroca(troca());
    expect(f).toContain('254 linhas do 59');
    expect(f).toContain('225 do 58');
    expect(f).toContain('a mais');
  });

  it('diz «a menos» quando o setor encolhe', () => {
    expect(fraseDaTroca(troca({ delta: -3766.68 }))).toContain('a menos');
  });

  /*
   * O número que explica o setor vizinho ter mudado sem ninguém mexer nele.
   * Sem ele, o efeito previsto vira mistério.
   */
  it('conta as linhas que vieram de outro setor', () => {
    const f = fraseDaTroca(troca({ deOutroSetor: 3 }));
    expect(f).toContain('3 vieram');
    expect(f).toContain('de outro setor');
  });

  it('não fala de outro setor quando não houve', () => {
    expect(fraseDaTroca(troca({ deOutroSetor: 0 }))).not.toContain('outro setor');
  });
});
