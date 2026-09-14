/**
 * Desfazer a remoção de uma importação do 58.
 *
 * ## O que se trava aqui
 *
 * **A frase não pode enganar.** «13 linhas voltaram», num lote de 413, faz
 * parecer que a restauração falhou; «413 restauradas» faz parecer que voltou
 * tudo. Entre a remoção e o arrependimento, outra importação pode ter trazido
 * parte das linhas de volta — e as duas metades juntas são a única versão que
 * diz a verdade.
 *
 * **Números vêm como texto.** PostgREST devolve `numeric` e `bigint` como
 * string, e `jsonb_build_object` não muda isso.
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
  buscarRemocoesGuardadas,
  fraseDaRestauracao,
  restaurarRemocao,
  type ResultadoRestauracao,
} from './desfazer.service';

const resultado = (over: Partial<ResultadoRestauracao> = {}): ResultadoRestauracao => ({
  voltaram: 1, jaEstavam: 0, total: 1, valor: 100, ...over,
});

beforeEach(() => { mock.porRpc = {}; mock.args = {}; });

describe('buscarRemocoesGuardadas', () => {
  it('converte os números e preserva a identidade do lote', async () => {
    mock.porRpc = {
      fn_analitico_remocoes_guardadas: {
        data: [{
          lote_id: 'lote-1', setor_id: 'setor-receptivo', mes: '2026-09',
          linhas: '413', valor: '175768.38',
          removido_em: '2026-09-13T14:02:00Z', restaurado_em: null, pode_desfazer: true,
        }],
        error: null,
      },
    };

    const [r] = await buscarRemocoesGuardadas('emp-1');

    expect(r.loteId).toBe('lote-1');
    expect(r.linhas).toBe(413);
    expect(r.valor).toBeCloseTo(175768.38, 2);
    expect(r.podeDesfazer).toBe(true);
    expect(r.restauradoEm).toBeNull();
  });

  /*
   * O snapshot passou a existir em 14/09/2026. Antes disso nada guardava o que
   * a importação apagava — a lista vazia é o estado normal no começo, não erro.
   */
  it('lista vazia é o estado normal, não erro', async () => {
    mock.porRpc = { fn_analitico_remocoes_guardadas: { data: null, error: null } };
    await expect(buscarRemocoesGuardadas('emp-1')).resolves.toEqual([]);
  });

  it('repassa o mês, e null quando não há', async () => {
    mock.porRpc = { fn_analitico_remocoes_guardadas: { data: [], error: null } };

    await buscarRemocoesGuardadas('emp-1');
    expect(mock.args.fn_analitico_remocoes_guardadas).toMatchObject({ p_mes: null });

    await buscarRemocoesGuardadas('emp-1', '2026-09');
    expect(mock.args.fn_analitico_remocoes_guardadas).toMatchObject({ p_mes: '2026-09' });
  });
});

describe('restaurarRemocao', () => {
  it('converte os dois números e o valor', async () => {
    mock.porRpc = {
      fn_analitico_restaurar_remocao: {
        data: { voltaram: '400', ja_estavam: '13', total: '413', valor: '175768.38' },
        error: null,
      },
    };

    const r = await restaurarRemocao('lote-1');

    expect(r.voltaram).toBe(400);
    expect(r.jaEstavam).toBe(13);
    expect(r.total).toBe(413);
    expect(r.valor).toBeCloseTo(175768.38, 2);
  });

  /* O portão é do banco: `if not fn_user_is_super_admin() then raise`. O que
     cabe aqui é não engolir a mensagem dele. */
  it('recusa do banco chega com a mensagem do banco', async () => {
    mock.porRpc = {
      fn_analitico_restaurar_remocao: {
        data: null,
        error: { message: 'Somente super_admin pode desfazer a remocao de uma importacao.' },
      },
    };
    await expect(restaurarRemocao('lote-1')).rejects.toThrow('Somente super_admin');
  });

  it('resposta vazia vira erro, e não sucesso silencioso', async () => {
    mock.porRpc = { fn_analitico_restaurar_remocao: { data: null, error: null } };
    await expect(restaurarRemocao('lote-1')).rejects.toThrow('não respondeu');
  });
});

describe('fraseDaRestauracao', () => {
  it('tudo voltou: diz só isso', () => {
    expect(fraseDaRestauracao(resultado({ voltaram: 413, jaEstavam: 0, total: 413 })))
      .toBe('413 linhas voltaram para o analítico.');
  });

  /*
   * O caso que a frase existe para não estragar: restaurar um lote de 413 em
   * que outra importação já trouxe 400 de volta. Dizer só «13 voltaram» faria
   * alguém achar que a restauração falhou.
   */
  it('parte já estava lá: diz as duas metades', () => {
    const f = fraseDaRestauracao(resultado({ voltaram: 13, jaEstavam: 400, total: 413 }));
    expect(f).toContain('13 linhas voltaram');
    expect(f).toContain('400');
    expect(f).toContain('importação posterior');
  });

  it('nada precisou voltar: não finge que restaurou', () => {
    const f = fraseDaRestauracao(resultado({ voltaram: 0, jaEstavam: 413, total: 413 }));
    expect(f).toContain('Nada precisou voltar');
    expect(f).not.toMatch(/^0 linhas voltaram/);
  });

  it('uma linha só fica no singular', () => {
    expect(fraseDaRestauracao(resultado({ voltaram: 1, jaEstavam: 0, total: 1 })))
      .toBe('1 linha voltou para o analítico.');
  });

  it('sem nada guardado, usa a nota do banco', () => {
    const f = fraseDaRestauracao(resultado({
      voltaram: 0, jaEstavam: 0, total: 0, nota: 'Nada guardado para esta importacao.',
    }));
    expect(f).toBe('Nada guardado para esta importacao.');
  });
});
