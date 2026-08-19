/**
 * O que este teste protege
 * ─────────────────────────────────────────────────────────────────────────────
 * A ida e a volta precisam fechar. `exclusaoUsuario.service` ESCREVE o relatório
 * e este módulo o LÊ; se as duas pontas discordarem em uma coluna, o acordo
 * volta com o dado errado e ninguém percebe — o valor entra, a tela mostra um
 * número, e só o cliente do outro lado sabe que está torto.
 *
 * Por isso o caso central monta a planilha com as MESMAS colunas da exportação e
 * confere o que sai. Os outros dois são as armadilhas conhecidas:
 *
 *   • **"R$ 1.234,56"** — `raw: false` devolve o texto formatado, e `Number()`
 *     direto daria `NaN`. Um `NaN` virando zero apaga o valor em silêncio.
 *   • **NR igual à instituição** — o relatório escreve `nr_cliente ||
 *     instituicao` numa coluna só. Quando o acordo não tinha NR, o que aparece
 *     ali é a instituição, e importar aquilo como NR criaria um registro de NR
 *     falso, travando a categoria inteira para o primeiro que importasse.
 */
import { describe, it, expect, vi } from 'vitest';
import { utils, write } from '@e965/xlsx';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/services/nr_registros.service', () => ({
  verificarNrsEmLote: vi.fn(async () => new Map()),
}));

import { lerRelatorioAcordos, analisarImportacao } from './importacaoAcordos.service';

/** Uma planilha com as colunas exatas de `COLUNAS`, empacotada como o File do navegador. */
function planilha(linhas: Record<string, unknown>[]): File {
  const ws = utils.json_to_sheet(linhas);
  const wb = utils.book_new();
  utils.book_append_sheet(wb, ws, 'Acordos');
  const buffer = write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  return new File([buffer], 'acordos-fulano-setor-anterior.xlsx');
}

const LINHA_COMPLETA = {
  'NR / Código': '778899',
  'Cliente': 'Maria de Souza',
  'Instituição': 'BOOKPLAY',
  'Vencimento': '2026-09-10',
  'Valor': 250.5,
  'Valor total': 751.5,
  'Entrada': 100,
  'Parcela': '2/3',
  'Tipo': 'boleto',
  'Status': 'pago',
  'Pagamento em': '2026-08-15',
  'Cadastrado em': '2026-08-01',
  'Vínculo': 'extra',
  'Pareado com': 'Joao Pereira',
  'WhatsApp': '14999998888',
  'Observações': 'cliente pediu para ligar de manhã',
};

describe('lerRelatorioAcordos', () => {
  it('devolve a linha do relatório como o acordo que a gerou', async () => {
    const { linhas, recusadas } = await lerRelatorioAcordos(planilha([LINHA_COMPLETA]));

    expect(recusadas).toEqual([]);
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({
      linha: 2,
      nr_cliente: '778899',
      nome_cliente: 'Maria de Souza',
      instituicao: 'BOOKPLAY',
      vencimento: '2026-09-10',
      valor: 250.5,
      valor_total: 751.5,
      valor_entrada: 100,
      numero_parcela: 2,
      parcelas: 3,
      tipo: 'boleto',
      status: 'pago',
      data_pagamento: '2026-08-15',
      data_cadastro: '2026-08-01',
      tipo_vinculo: 'extra',
      vinculo_operador_nome: 'Joao Pereira',
      whatsapp: '14999998888',
    });
  });

  it('lê valor formatado como moeda sem virar zero', async () => {
    const { linhas } = await lerRelatorioAcordos(planilha([
      { ...LINHA_COMPLETA, Valor: 'R$ 1.234,56' },
    ]));
    expect(linhas[0].valor).toBe(1234.56);
  });

  it('não trata a instituição como NR quando o acordo não tinha NR', async () => {
    // Exatamente o que `COLUNAS` escreve para um acordo sem `nr_cliente`.
    const { linhas } = await lerRelatorioAcordos(planilha([
      { ...LINHA_COMPLETA, 'NR / Código': 'BOOKPLAY', 'Instituição': 'BOOKPLAY' },
    ]));
    expect(linhas[0].nr_cliente).toBe('');
    expect(linhas[0].instituicao).toBe('BOOKPLAY');
  });

  it('recusa a linha sem vencimento em vez de gravar uma data inventada', async () => {
    const { linhas, recusadas } = await lerRelatorioAcordos(planilha([
      { ...LINHA_COMPLETA, Vencimento: '' },
    ]));
    expect(linhas).toEqual([]);
    expect(recusadas[0]).toMatchObject({ linha: 2, rotulo: '778899' });
  });

  it('rejeita um arquivo que não é o relatório, com o nome das colunas que faltam', async () => {
    await expect(lerRelatorioAcordos(planilha([{ Nome: 'x', Total: 1 }])))
      .rejects.toThrow(/NR \/ Código/);
  });
});

describe('analisarImportacao', () => {
  it('separa o NR que já tem outro dono, e o resto entra', async () => {
    const { verificarNrsEmLote } = await import('@/services/nr_registros.service');
    (verificarNrsEmLote as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Map([['111', {
        registroId: 'r1', acordoId: 'a1', operadorId: 'op-2', operadorNome: 'Carla',
      }]]),
    );

    const { linhas } = await lerRelatorioAcordos(planilha([
      { ...LINHA_COMPLETA, 'NR / Código': '111', 'Vínculo': 'direto' },
      { ...LINHA_COMPLETA, 'NR / Código': '222', 'Vínculo': 'direto' },
    ]));

    const previa = await analisarImportacao({
      linhas, recusadas: [], empresaId: 'emp-1', campoNr: 'nr_cliente',
    });

    expect(previa.conflitos).toEqual([
      { linha: 2, nr: '111', rotulo: 'Maria de Souza', operadorNome: 'Carla' },
    ]);
    expect(previa.aptas.map(a => a.nr_cliente)).toEqual(['222']);
    expect(previa.totalLido).toBe(2);
  });
});
