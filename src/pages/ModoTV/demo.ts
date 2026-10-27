/**
 * demo.ts — um painel de mentira para `/tv?demo=1`.
 *
 * Serve para ver os templates na TV sem banco, sem pareamento e sem dado de
 * ninguém. Os nomes são inventados.
 */
import type { NumerosTv, Painel } from './tipos';
import { temaValido } from './templates';

export function numerosDemo(): NumerosTv {
  const hoje = new Date();
  const mes = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
  return {
    alvo_nome: 'Setor Demonstração',
    alvo_tipo: 'setor',
    regra: 'nosso_produto',
    ho_percentual: 0.226,
    mes,
    hoje: hoje.toISOString().slice(0, 10),
    meta: 500_000,
    recebido: 348_215.4,
    recebido_ho: 78_696.68,
    recebido_hoje: 14_830.12,
    recebido_hoje_ho: 3_351.61,
    pagamentos: 1210,
    dias_uteis: 22,
    dias_decorridos: 17,
    ranking: [
      ['Ana Beatriz Lima', 41_220.1], ['Carlos Eduardo Rocha', 38_904.55], ['Juliana Prado', 35_310],
      ['Marcos Vinícius Teixeira', 29_877.4], ['Patrícia Gomes', 27_115.9], ['Rafael Souza', 24_480],
      ['Luana Martins Costa', 21_960.3], ['Diego Almeida', 19_005.75], ['Fernanda Ribeiro', 17_430],
      ['Bruno Carvalho', 15_220.6],
    ].map(([nome, valor], i) => ({
      id: `demo-${i}`, nome: nome as string, foto: null as string | null,
      valor: valor as number, valor_ho: Math.round((valor as number) * 22.6) / 100,
    })),
    calculado_em: new Date().toISOString(),
  };
}

export function painelDemo(tema: string | null): Painel {
  return {
    id: 'demo',
    nome: 'Demonstração',
    tema: temaValido(tema),
    unidade: 'bruto',
    segundos_por_tela: 10,
    tela_fixa: null,
    telas: [
      { id: 'd1', template: 'contagem', opcoes: {} },
      { id: 'd2', template: 'barra', opcoes: {} },
      { id: 'd3', template: 'anel', opcoes: {} },
      { id: 'd4', template: 'hoje', opcoes: {} },
      { id: 'd5', template: 'ritmo', opcoes: {} },
      { id: 'd6', template: 'placar', opcoes: {} },
      { id: 'd7', template: 'podio', opcoes: {} },
      { id: 'd8', template: 'lista', opcoes: { quantidade: '10' } },
      { id: 'd9', template: 'recado', opcoes: { texto: 'Faltam poucos dias. Cada acordo conta!', assinatura: 'Liderança' } },
    ],
  };
}
