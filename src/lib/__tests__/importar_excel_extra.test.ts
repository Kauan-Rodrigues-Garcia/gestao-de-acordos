/**
 * Testes do suporte à aba EXTRA na importação de planilhas.
 * Cobre: seleção de abas (DIRETO/EXTRA), marcação/deslocamento de linhas e o
 * forçamento da categoria 'extra' (com dono, órfão e dono = próprio operador).
 */
import { describe, it, expect } from 'vitest';
import {
  selecionarAbas,
  marcarAba,
  forcarClassificacaoExtra,
  OFFSET_ABA_EXTRA,
} from '@/lib/importar_excel_extra';
import type { RegistroImportado } from '@/lib/importar_excel_parser';
import type { ClassificacaoNR } from '@/services/classificar_nrs_import.service';

function reg(linha: number, over: Partial<RegistroImportado> = {}): RegistroImportado {
  return {
    linha, bloco: null,
    nr_cliente: `NR-${linha}`, instituicao: '', nome_cliente: 'Cliente',
    whatsapp: null, estado_uf: null, tipo: 'boleto', parcelas: 1,
    valor: 100, vencimento: '2026-05-30', status: 'verificar_pendente',
    observacoes_raw: null, valido: true, erros: [],
    ...over,
  };
}

describe('selecionarAbas', () => {
  it('acha DIRETO e EXTRA por nome (case-insensitive)', () => {
    expect(selecionarAbas(['direto', ' Extra '])).toEqual({ diretoIdx: 0, extraIdx: 1 });
    expect(selecionarAbas(['EXTRA', 'DIRETO'])).toEqual({ diretoIdx: 1, extraIdx: 0 });
  });

  it('aba única (nome livre): direto = 0, sem extra', () => {
    expect(selecionarAbas(['Acordos'])).toEqual({ diretoIdx: 0, extraIdx: -1 });
  });

  it('sem aba DIRETO nomeada: usa a primeira que não é EXTRA', () => {
    expect(selecionarAbas(['Plan1', 'EXTRA'])).toEqual({ diretoIdx: 0, extraIdx: 1 });
    expect(selecionarAbas(['EXTRA', 'Plan1'])).toEqual({ diretoIdx: 1, extraIdx: 0 });
  });

  it('aceita aba cujo nome CONTÉM "EXTRA" quando não há nome exato', () => {
    expect(selecionarAbas(['DIRETO', 'EXTRA BOOKPLAY'])).toEqual({ diretoIdx: 0, extraIdx: 1 });
    expect(selecionarAbas(['Plan1', 'Aba Extra'])).toEqual({ diretoIdx: 0, extraIdx: 1 });
  });

  it('nome exato "EXTRA" tem prioridade sobre "contém EXTRA"', () => {
    expect(selecionarAbas(['EXTRAS ANTIGAS', 'EXTRA', 'DIRETO']))
      .toEqual({ diretoIdx: 2, extraIdx: 1 });
  });
});

describe('marcarAba', () => {
  it('DIRETO mantém linha e marca origem', () => {
    const [r] = marcarAba([reg(3)], 'direto');
    expect(r.abaOrigem).toBe('direto');
    expect(r.linha).toBe(3);
    expect(r.linhaPlanilha).toBe(3);
  });

  it('EXTRA desloca linha e preserva a linha real', () => {
    const [r] = marcarAba([reg(3)], 'extra');
    expect(r.abaOrigem).toBe('extra');
    expect(r.linha).toBe(3 + OFFSET_ABA_EXTRA);
    expect(r.linhaPlanilha).toBe(3);
  });

  it('evita colisão de chaves entre abas com as mesmas linhas', () => {
    const dir = marcarAba([reg(3)], 'direto');
    const ext = marcarAba([reg(3)], 'extra');
    expect(dir[0].linha).not.toBe(ext[0].linha);
  });
});

describe('forcarClassificacaoExtra', () => {
  const OP = 'op-atual';
  const base = (linha: number, over: Partial<ClassificacaoNR> = {}): ClassificacaoNR => ({
    linhaOriginal: linha, nr: `NR-${linha}`, categoria: 'novo', ...over,
  });

  it('força extra com vínculo quando há dono de outro operador', () => {
    const dono = { acordoId: 'a1', operadorId: 'outro', operadorNome: 'Outro' };
    const linhasExtra = new Set([10]);
    const [c] = forcarClassificacaoExtra(
      [base(10, { categoria: 'duplicado', donoAtual: dono })],
      linhasExtra, OP,
    );
    expect(c.categoria).toBe('extra');
    expect(c.donoAtual).toEqual(dono);
    expect(c.precisaAutorizacao).toBe(false);
  });

  it('força extra órfão (sem dono)', () => {
    const [c] = forcarClassificacaoExtra([base(10)], new Set([10]), OP);
    expect(c.categoria).toBe('extra');
    expect(c.donoAtual).toBeUndefined();
  });

  it('dono é o próprio operador → extra órfão (sem vínculo a si mesmo)', () => {
    const dono = { acordoId: 'a1', operadorId: OP, operadorNome: 'Eu' };
    const [c] = forcarClassificacaoExtra(
      [base(10, { categoria: 'duplicado', donoAtual: dono })],
      new Set([10]), OP,
    );
    expect(c.categoria).toBe('extra');
    expect(c.donoAtual).toBeUndefined();
  });

  it('não altera linhas que não são da aba EXTRA', () => {
    const original = base(5, { categoria: 'novo' });
    const [c] = forcarClassificacaoExtra([original], new Set([10]), OP);
    expect(c).toEqual(original);
  });

  // ── A aba EXTRA não é passe livre ─────────────────────────────────────────
  // O portão da aba é "quem IMPORTA tem a lógica ativa" — o dono do NR não era
  // consultado. Com os dois lados tendo a lógica (CASO C) a regra exige líder,
  // e a versão anterior carimbava precisaAutorizacao:false em tudo, passando
  // por cima do classificador.
  it('CASO C (dono também tem a lógica): mantém a exigência de autorização', () => {
    const dono = { acordoId: 'a1', operadorId: 'outro', operadorNome: 'Outro' };
    const [c] = forcarClassificacaoExtra(
      [base(10, { categoria: 'duplicado', donoAtual: dono, donoTemLogica: true, precisaAutorizacao: true })],
      new Set([10]), OP,
    );
    expect(c.categoria).toBe('extra');
    expect(c.precisaAutorizacao).toBe(true);
  });

  it('CASO A (dono NÃO tem a lógica): dispensa o líder, como manda a regra', () => {
    const dono = { acordoId: 'a1', operadorId: 'outro', operadorNome: 'Outro' };
    const [c] = forcarClassificacaoExtra(
      [base(10, { categoria: 'duplicado', donoAtual: dono, donoTemLogica: false })],
      new Set([10]), OP,
    );
    expect(c.precisaAutorizacao).toBe(false);
  });

  it('extra órfão nunca exige autorização — não há de quem tomar nada', () => {
    const [c] = forcarClassificacaoExtra(
      [base(10, { donoTemLogica: true })], new Set([10]), OP,
    );
    expect(c.donoAtual).toBeUndefined();
    expect(c.precisaAutorizacao).toBe(false);
  });
});
