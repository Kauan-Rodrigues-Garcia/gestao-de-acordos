/**
 * conflitoNr.service.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * A escada de decisão do conflito de NR. Ela vivia copiada em duas telas e
 * ausente numa terceira; estes testes são o que impede a cópia de voltar.
 *
 * O que importa aqui não é só cada desfecho isolado, mas a ORDEM: "dono
 * desligado" tem de vencer Direto/Extra, e "já tem extra" tem de vencer o
 * Caso A. Cada uma dessas precedências ganha um teste onde os dois fatos são
 * verdadeiros ao mesmo tempo — é o único jeito de a ordem ficar travada.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  decidirConflitoNr,
  coletarFatosConflitoNr,
  type FatosConflitoNr,
} from './conflitoNr.service';
import type { NrConflito } from './nr_registros.service';

// ── Mocks das dependências de coleta ────────────────────────────────────────

const mockEstaDesligado  = vi.fn();
const mockDiretoExtraAtivo = vi.fn();
const mockMaybeSingle    = vi.fn();

vi.mock('./desligamento.service', () => ({
  operadorEstaDesligado: (...args: unknown[]) => mockEstaDesligado(...args),
}));

vi.mock('./direto_extra.service', () => ({
  fetchIsDiretoExtraAtivo: (...args: unknown[]) => mockDiretoExtraAtivo(...args),
}));

vi.mock('@/lib/supabase', () => {
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'limit', 'order', 'neq']) {
    builder[m] = vi.fn(() => builder);
  }
  builder.maybeSingle = (...args: unknown[]) => mockMaybeSingle(...args);
  return { supabase: { from: vi.fn(() => builder) } };
});

// ── Helpers ─────────────────────────────────────────────────────────────────

const CONFLITO: NrConflito = {
  registroId:   'reg-1',
  acordoId:     'acordo-do-dono',
  operadorId:   'dono-1',
  operadorNome: 'Maria Valeria',
};

function fatos(over: Partial<FatosConflitoNr> = {}): FatosConflitoNr {
  return {
    conflito:         CONFLITO,
    meuOperadorId:    'eu-1',
    euTemLogica:      false,
    donoTemLogica:    false,
    donoDesligado:    false,
    jaTemExtra:       false,
    extraAtualId:     null,
    extraAtualOpId:   null,
    extraAtualOpNome: null,
    donoSetorNome:    null,
    ...over,
  };
}

// ── decidirConflitoNr ───────────────────────────────────────────────────────

describe('decidirConflitoNr — os seis desfechos', () => {
  it('NR do próprio operador não é conflito', () => {
    const d = decidirConflitoNr(fatos({ meuOperadorId: 'dono-1' }));
    expect(d.caso).toBe('proprio_acordo');
    expect(d).toMatchObject({ acordoId: 'acordo-do-dono' });
  });

  it('dono desligado → assume como DIRETO sem autorização', () => {
    const d = decidirConflitoNr(fatos({ donoDesligado: true }));
    expect(d.caso).toBe('dono_desligado');
  });

  it('acordo do dono já tem EXTRA → troca_extra com os dados do extra atual', () => {
    const d = decidirConflitoNr(fatos({
      jaTemExtra: true,
      extraAtualId: 'acordo-extra-9',
      extraAtualOpId: 'op-extra-9',
      extraAtualOpNome: 'Joana',
    }));
    expect(d).toMatchObject({
      caso: 'troca_extra',
      extraAtualId: 'acordo-extra-9',
      extraAtualOpId: 'op-extra-9',
      extraAtualOpNome: 'Joana',
    });
  });

  it('CASO A — eu tenho a lógica e o dono não → eu viro EXTRA', () => {
    const d = decidirConflitoNr(fatos({ euTemLogica: true, donoTemLogica: false }));
    expect(d.caso).toBe('eu_viro_extra');
  });

  it('CASO B — o dono tem a lógica e eu não → aviso, e ele cai para EXTRA', () => {
    const d = decidirConflitoNr(fatos({
      euTemLogica: false, donoTemLogica: true, donoSetorNome: 'Cobrança',
    }));
    expect(d).toMatchObject({ caso: 'aviso_direto_extra', operadorSetor: 'Cobrança' });
  });

  it('CASO C — ninguém tem a lógica → autorização de líder', () => {
    const d = decidirConflitoNr(fatos({ euTemLogica: false, donoTemLogica: false }));
    expect(d.caso).toBe('autorizacao_lider');
  });

  it('CASO D — os DOIS têm a lógica → autorização de líder', () => {
    // Regra de docs/REGRAS-DE-NEGOCIO.md §7.3: "ambos ou nenhum" cai no mesmo
    // desfecho. Não é omissão — é a regra escrita.
    const d = decidirConflitoNr(fatos({ euTemLogica: true, donoTemLogica: true }));
    expect(d.caso).toBe('autorizacao_lider');
  });
});

describe('decidirConflitoNr — precedência entre os desvios', () => {
  it('ser o próprio dono vence tudo, inclusive o desligamento', () => {
    const d = decidirConflitoNr(fatos({
      meuOperadorId: 'dono-1', donoDesligado: true, jaTemExtra: true, donoTemLogica: true,
    }));
    expect(d.caso).toBe('proprio_acordo');
  });

  it('dono desligado vence Direto/Extra — muda de dono, não vira vínculo', () => {
    const d = decidirConflitoNr(fatos({
      donoDesligado: true, donoTemLogica: true, euTemLogica: false,
    }));
    expect(d.caso).toBe('dono_desligado');
  });

  it('dono desligado vence a troca de extra', () => {
    const d = decidirConflitoNr(fatos({ donoDesligado: true, jaTemExtra: true }));
    expect(d.caso).toBe('dono_desligado');
  });

  it('já ter EXTRA vence o CASO A — tirar o lugar de terceiro passa por líder', () => {
    const d = decidirConflitoNr(fatos({ jaTemExtra: true, euTemLogica: true }));
    expect(d.caso).toBe('troca_extra');
  });

  it('já ter EXTRA vence o CASO B', () => {
    const d = decidirConflitoNr(fatos({ jaTemExtra: true, donoTemLogica: true }));
    expect(d.caso).toBe('troca_extra');
  });
});

// ── coletarFatosConflitoNr ──────────────────────────────────────────────────

describe('coletarFatosConflitoNr', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEstaDesligado.mockResolvedValue(false);
    mockDiretoExtraAtivo.mockResolvedValue(false);
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
  });

  const params = {
    conflito:      CONFLITO,
    empresaId:     'emp-1',
    meuOperadorId: 'eu-1',
    euTemLogica:   false,
    campoChave:    'nr_cliente' as const,
    valorChave:    '12345',
  };

  it('NR próprio: não consulta desligamento nem Direto/Extra', async () => {
    const f = await coletarFatosConflitoNr({ ...params, meuOperadorId: 'dono-1' });

    expect(mockEstaDesligado).not.toHaveBeenCalled();
    expect(mockDiretoExtraAtivo).not.toHaveBeenCalled();
    expect(f.jaTemExtra).toBe(false);
  });

  it('dono desligado: nem pergunta se ele tem a lógica', async () => {
    mockEstaDesligado.mockResolvedValue(true);

    const f = await coletarFatosConflitoNr(params);

    expect(f.donoDesligado).toBe(true);
    expect(mockDiretoExtraAtivo).not.toHaveBeenCalled();
  });

  it('a lógica do DONO é perguntada pelo id dele, não pelo meu', async () => {
    mockDiretoExtraAtivo.mockResolvedValue(true);

    const f = await coletarFatosConflitoNr(params);

    expect(mockDiretoExtraAtivo).toHaveBeenCalledWith({
      userId: 'dono-1', empresaId: 'emp-1',
    });
    expect(f.donoTemLogica).toBe(true);
  });

  it('acordo com vinculo_operador_id preenchido vira jaTemExtra', async () => {
    mockMaybeSingle
      // 1ª chamada: o acordo do dono
      .mockResolvedValueOnce({
        data: { id: 'acordo-do-dono', tipo_vinculo: 'direto',
                vinculo_operador_id: 'op-extra-9', vinculo_operador_nome: 'Joana' },
        error: null,
      })
      // 2ª chamada: o acordo EXTRA atual
      .mockResolvedValueOnce({
        data: { id: 'acordo-extra-9', operador_id: 'op-extra-9' },
        error: null,
      });

    const f = await coletarFatosConflitoNr(params);

    expect(f.jaTemExtra).toBe(true);
    expect(f.extraAtualId).toBe('acordo-extra-9');
    expect(f.extraAtualOpNome).toBe('Joana');
    // Com extra já existente a decisão é troca_extra; perguntar Direto/Extra
    // seria uma ida ao banco que não muda nada.
    expect(mockDiretoExtraAtivo).not.toHaveBeenCalled();
  });

  it('setor do dono inacessível não derruba a coleta', async () => {
    mockDiretoExtraAtivo.mockResolvedValue(true);
    mockMaybeSingle
      .mockResolvedValueOnce({ data: { id: 'acordo-do-dono', vinculo_operador_id: null }, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'RLS' } });

    const f = await coletarFatosConflitoNr(params);

    expect(f.donoSetorNome).toBeNull();
    expect(f.donoTemLogica).toBe(true);
  });

  it('os fatos coletados alimentam a decisão de ponta a ponta', async () => {
    mockDiretoExtraAtivo.mockResolvedValue(true);
    mockMaybeSingle
      .mockResolvedValueOnce({ data: { id: 'acordo-do-dono', vinculo_operador_id: null }, error: null })
      .mockResolvedValueOnce({ data: { setores: { nome: 'Cobrança' } }, error: null });

    const f = await coletarFatosConflitoNr(params);
    const d = decidirConflitoNr(f);

    expect(d).toMatchObject({
      caso: 'aviso_direto_extra',
      operadorNome: 'Maria Valeria',
      operadorSetor: 'Cobrança',
    });
  });
});
