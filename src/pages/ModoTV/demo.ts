/**
 * demo.ts — um painel de mentira para `/tv?demo=1`.
 *
 * Serve para ver os templates na TV sem banco, sem pareamento e sem dado de
 * ninguém. Os nomes são inventados.
 */
import type { NumerosTv, Painel } from './tipos';
import { temaValido } from './templates';
import { cenaDoModelo } from './livre/cena';

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
    serie: serieDemo(hoje),
    destaques: destaquesDemo(serieDemo(hoje)),
    equipes: EQUIPES_DEMO.map(([id, nome]) => ({ id, nome })),
    equipe_id: null,
    setor_nome: 'Setor Demonstração',
    equipes_ranking: EQUIPES_DEMO.map(([id, nome, valor, meta]) => ({
      id, nome, valor, valor_ho: Math.round(valor * 22.6) / 100, meta,
    })),
    ranking_por_equipe: [{
      equipe_id: EQUIPES_DEMO[0][0],
      pessoas: [['Ana Beatriz Lima', 41_220.1], ['Juliana Prado', 35_310], ['Rafael Souza', 24_480], ['Bruno Carvalho', 15_220.6]]
        .map(([nome, valor], i) => ({ id: `demo-e${i}`, nome: nome as string, foto: null as string | null, valor: valor as number, valor_ho: Math.round((valor as number) * 22.6) / 100 })),
    }],
    quitacao: {
      habilitado: true,
      premios: [500, 300, 200, 150, 100, 50],
      participantes: 23,
      importado_em: new Date().toISOString(),
      posicoes: [
        ['Carlos Eduardo Rocha', 18, 92_410.5], ['Patrícia Gomes', 15, 81_200], ['Ana Beatriz Lima', 16, 77_935.2],
        ['Diego Almeida', 11, 60_120], ['Juliana Prado', 12, 58_800.4], ['Luana Martins Costa', 9, 51_330],
        ['Rafael Souza', 10, 49_870], ['Fernanda Ribeiro', 8, 41_005.9], ['Marcos Vinícius Teixeira', 7, 38_440], ['Bruno Carvalho', 6, 30_210],
      ].map(([nome, quitacoes, valor], i) => ({
        posicao: i + 1, id: `demo-q${i}`, nome: nome as string, foto: null as string | null, quitacoes: quitacoes as number, valor: valor as number,
      })),
    },
    calculado_em: new Date().toISOString(),
  };
}

/** id, nome, recebido no mês, meta. */
const EQUIPES_DEMO: [string, string, number, number][] = [
  ['00000000-0000-4000-8000-000000000001', 'Rosa', 128_400.55, 150_000],
  ['00000000-0000-4000-8000-000000000002', 'Azul', 112_930, 110_000],
  ['00000000-0000-4000-8000-000000000003', 'Verde', 64_880.85, 120_000],
  ['00000000-0000-4000-8000-000000000004', 'Laranja', 42_004, 0],
];

/** O 1º de cada dia com recebimento e do mês, revezando os nomes do ranking. */
function destaquesDemo(serie: NonNullable<NumerosTv['serie']>): NonNullable<NumerosTv['destaques']> {
  const nomes = ['Ana Beatriz Lima', 'Carlos Eduardo Rocha', 'Juliana Prado', 'Marcos Vinícius Teixeira'];
  const linha = (dia: string, i: number, valor: number) => ({
    escopo: 'setor', dia, id: `demo-${i}`, nome: nomes[i], foto: null as string | null,
    valor, valor_ho: Math.round(valor * 22.6) / 100, pagamentos: 6 + ((i * 5) % 9),
  });
  return [
    linha('mes', 0, 41_220.1),
    ...serie.map((s, k) => linha(s.dia, k % nomes.length, Math.round(s.valor * 0.18 * 100) / 100)),
  ];
}

/** Dias úteis com recebimento, fins de semana sem: o formato que o gráfico mostra. */
function serieDemo(hoje: Date): NonNullable<NumerosTv['serie']> {
  const a = hoje.getFullYear(), m = hoje.getMonth();
  const serie: NonNullable<NumerosTv['serie']> = [];
  for (let d = 1; d <= hoje.getDate(); d++) {
    const dia = new Date(a, m, d);
    if (dia.getDay() === 0 || dia.getDay() === 6) continue;
    const valor = 12_000 + ((d * 7919) % 11) * 1_400;
    serie.push({ dia: `${a}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`, valor, valor_ho: Math.round(valor * 22.6) / 100 });
  }
  return serie;
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
      { id: 'd10', template: 'grafico', opcoes: {} },
      { id: 'd7', template: 'podio', opcoes: {} },
      { id: 'd8', template: 'lista', opcoes: { quantidade: '10' } },
      { id: 'd9', template: 'recado', opcoes: { texto: 'Faltam poucos dias. Cada acordo conta!', assinatura: 'Liderança' } },
      { id: 'd11', template: 'destaque', opcoes: { dia: 'mes' } },
      { id: 'd12', template: 'destaque', opcoes: { dia: 'mes', estilo: 'serio' } },
      { id: 'd13', template: 'destaque', opcoes: { dia: 'mes', estilo: 'fofo' } },
      { id: 'd14', template: 'destaque', opcoes: { dia: 'mes', estilo: 'pixel' } },
      { id: 'd15', template: 'destaque', opcoes: { dia: 'mes', estilo: 'neon' } },
      { id: 'd16', template: 'destaque', opcoes: { dia: 'mes', estilo: 'jornal' } },
      { id: 'd17', template: 'lista', opcoes: { fonte: 'equipes', titulo: 'Equipe contra equipe' } },
      { id: 'd18', template: 'podio', opcoes: { valor: 'projecao', titulo: 'Quem fecha o mês na frente' } },
      { id: 'd19', template: 'quitacao', opcoes: {} },
      { id: 'd20', template: 'livre', opcoes: { cena: cenaDoModelo('meta') } },
      { id: 'd21', template: 'livre', opcoes: { cena: cenaDoModelo('campanha') }, sob_demanda: true },
    ],
  };
}

/**
 * Um «relatório» de mentira: entra entre R$ 3 mil e R$ 12 mil, espalhado por
 * duas ou três pessoas do ranking — às vezes o bastante para trocar posição.
 */
export function simularRelatorio(n: NumerosTv): NumerosTv {
  const entrou = Math.round(3_000 + Math.random() * 9_000);
  const ranking = n.ranking.map(p => ({ ...p }));
  const sorteados = new Set<number>();
  while (sorteados.size < Math.min(3, ranking.length)) sorteados.add(Math.floor(Math.random() * ranking.length));
  for (const i of sorteados) {
    const parte = Math.round(entrou / sorteados.size);
    ranking[i].valor += parte;
    ranking[i].valor_ho = Math.round(ranking[i].valor * 22.6) / 100;
  }
  ranking.sort((a, b) => b.valor - a.valor);
  return {
    ...n,
    recebido: n.recebido + entrou,
    recebido_ho: Math.round((n.recebido + entrou) * 22.6) / 100,
    recebido_hoje: n.recebido_hoje + entrou,
    recebido_hoje_ho: Math.round((n.recebido_hoje + entrou) * 22.6) / 100,
    ranking,
    // O dinheiro novo entra no dia de hoje da série.
    serie: (n.serie ?? []).some(p => p.dia === n.hoje)
      ? (n.serie ?? []).map(p => (p.dia === n.hoje ? { ...p, valor: p.valor + entrou } : p))
      : [...(n.serie ?? []), { dia: n.hoje, valor: entrou, valor_ho: Math.round(entrou * 22.6) / 100 }],
    calculado_em: new Date().toISOString(),
  };
}
