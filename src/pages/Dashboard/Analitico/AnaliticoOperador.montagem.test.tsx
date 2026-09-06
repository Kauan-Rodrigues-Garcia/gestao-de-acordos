/**
 * A tela do operador MONTA? — teste de fumaça.
 *
 * Irmão de `AnaliticoLider.montagem.test.tsx`, e existe pelo mesmo motivo: a
 * visão do operador também foi reescrita sem nenhum teste que a montasse. Ver
 * o cabeçalho daquele arquivo para a história completa.
 *
 * Aqui a pergunta é uma só: a tela abre, com e sem ranking liberado, nas três
 * lentes? Uma exceção no render falha o teste.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Recorte } from '@/pages/Analitico/recorte';
import type { AnaliticoRecebimento } from '@/lib/supabase';

const { tenantRef } = vi.hoisted(() => ({
  tenantRef: { current: { slug: 'pagueplay', isPaguePlay: true } },
}));

vi.mock('@/lib/tenant-config', () => ({ useTenant: () => tenantRef.current }));
vi.mock('@/services/analitico/analitico.service', () => ({
  buscarResumoOperadoresAnalitico: vi.fn(async () => ({ data: [], error: null })),
}));
vi.mock('@/services/situacaoUsuario.service', () => ({
  buscarSituacaoOperadores: vi.fn(async () => ({})),
  idsOcultosRankingQuartil: () => new Set<string>(),
}));

/** Uma linha real o bastante para a tabela desenhar de verdade. */
const linha = {
  id: 'linha-1', empresa_id: 'empresa-1', operador_id: 'op-1',
  operador_usuario: 'ana.silva', codigo: '12345', nome_cliente: 'Cliente Um',
  instituicao: null, forma_pagamento: 'boleto_pix', forma_detalhe: 'Pix',
  valor_recebido: 1000, total_ho: 300, data_pagamento: '2026-09-03',
  mes_referencia: '2026-09-01', acordo_id: null,
  status_tabulacao: 'nao_tabulado', visto: false,
  importado_por_id: null, importado_em: '2026-09-04T14:22:00+00:00',
  lote_id: 'lote-1', pagamentos_detalhados: null,
} as unknown as AnaliticoRecebimento;

describe('AnaliticoOperador monta', () => {
  const props = {
    dados: [linha],
    loading: false,
    operadorId: 'op-1',
    operadorNome: 'Ana Silva',
    empresaId: 'empresa-1',
    liderId: null,
    podeVerRanking: false,
    onAbrirNovoAcordo: vi.fn(),
    onVerAcordo: vi.fn(),
    onRefetch: vi.fn(),
  };

  const recortes: Recorte[] = [
    { modo: 'mes', mes: '2026-09' },
    { modo: 'dia', dia: '2026-09-03' },
    { modo: 'periodo', mes: '2026-09', inicio: '2026-09-01', fim: '2026-09-10' },
  ];

  it.each(recortes.map(r => [r.modo, r] as const))(
    'monta sem lançar no recorte %s',
    async (_modo, recorte) => {
      const { AnaliticoOperador } = await import('./AnaliticoOperador');
      expect(() => render(<AnaliticoOperador {...props} recorte={recorte} />)).not.toThrow();
    },
  );

  it('monta com o ranking liberado — o caminho do tile de posição', async () => {
    const { AnaliticoOperador } = await import('./AnaliticoOperador');
    expect(() => render(
      <AnaliticoOperador {...props} podeVerRanking recorte={{ modo: 'mes', mes: '2026-09' }} />,
    )).not.toThrow();
  });

  it('monta sem nenhum recebimento', async () => {
    const { AnaliticoOperador } = await import('./AnaliticoOperador');
    render(<AnaliticoOperador {...props} dados={[]} recorte={{ modo: 'mes', mes: '2026-09' }} />);
    expect(screen.getByText(/Nenhum recebimento encontrado/)).toBeInTheDocument();
  });
});
