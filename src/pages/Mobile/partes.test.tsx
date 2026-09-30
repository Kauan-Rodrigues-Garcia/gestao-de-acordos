/**
 * Blocos da tela mínima: o que aparece e o que some.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';

// Movimento reduzido: os números animados mostram o valor final na hora — é
// esse o caminho que os testes leem (o outro é só a animação até ele).
beforeAll(() => {
  window.matchMedia = ((q: string) => ({
    matches: q.includes('reduce'), media: q, onchange: null,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

/** Texto que atravessa elementos (o valor em negrito no meio da frase). */
const textoCorrido = (re: RegExp) => (_: string, el: Element | null) =>
  !!el && re.test(el.textContent ?? '') && Array.from(el.children).every(c => !re.test(c.textContent ?? ''));
import type { MinhaComissao } from '@/services/comissao/useMinhaComissao';
import type { ResultadoComissao } from '@/services/comissao/comissao';
import { AvisoSaidas, CartaoComissao, CartaoQuartil, CartaoRecebido, ListaPagamentos, ParHojeRanking } from './partes';
import { pagamentosQueSairam } from './useTelaMobile';

function comissao(r: Partial<ResultadoComissao> | null, extra: Partial<MinhaComissao> = {}): MinhaComissao {
  return {
    podeVer: true, carregando: false, dbAtiva: true, erro: false, isPaguePlay: false,
    recarregar: () => {},
    resultado: r ? ({
      motivo: null, recebido: 38_420.5, faixas: [], atual: null, proxima: null,
      total: 0, totalBonus: 0, bonus: [], ...r,
    } as ResultadoComissao) : null,
    ...extra,
  };
}

const faixa = (ordem: number, meta: number, pct: number, minimo: number) =>
  ({ ordem, meta, pctEfetivo: pct, minimo }) as ResultadoComissao['faixas'][number];

describe('CartaoComissao', () => {
  it('faixa atual: valor, selo e quanto falta para a próxima', () => {
    const f2 = faixa(2, 37_000, 2.11, 780.7);
    const f3 = faixa(3, 40_000, 3.3, 1_320);
    render(<CartaoComissao comissao={comissao({ atual: f2, proxima: f3, total: 810.67, faixas: [f2, f3] })} />);
    expect(screen.getByText('2ª meta · 2,11%')).toBeTruthy();
    expect(screen.getByText('810,67')).toBeTruthy();
    expect(screen.getByText(/R\$\s1\.579,50/)).toBeTruthy();
    expect(screen.getByText(/R\$\s1\.320,00/)).toBeTruthy();
  });

  it('nenhuma faixa ainda: diz quanto falta para a 1ª', () => {
    const f1 = faixa(1, 40_000, 1.75, 700);
    render(<CartaoComissao comissao={comissao({ motivo: 'nenhuma_faixa', faixas: [f1], recebido: 30_000, proxima: f1 })} />);
    expect(screen.getByText(/ainda não chegou na 1ª meta/)).toBeTruthy();
  });

  it('erro de leitura nunca vira R$ 0,00', () => {
    render(<CartaoComissao comissao={comissao(null, { erro: true })} />);
    expect(screen.getByText(/Não foi possível carregar a comissão/)).toBeTruthy();
    expect(screen.queryByText('0,00')).toBeNull();
  });

  it('bônus entra no valor e é dito', () => {
    const f1 = faixa(1, 34_000, 1.75, 595);
    render(<CartaoComissao comissao={comissao({ atual: f1, total: 600, totalBonus: 100, faixas: [f1] })} />);
    expect(screen.getByText('700,00')).toBeTruthy();
    expect(screen.getByText(/de bônus/)).toBeTruthy();
  });
});

describe('ParHojeRanking', () => {
  const ranking = { posicao: 4, de: 18, faltam: 320 };
  it('ranking aparece com permissão', () => {
    render(<ParHojeRanking hoje={1240} qtdHoje={4} podeVerRanking ranking={ranking} />);
    expect(screen.getByText('Ranking')).toBeTruthy();
    expect(screen.getByText(/do 3º/)).toBeTruthy();
  });
  it('sem permissão o ranking some, mesmo com dado', () => {
    render(<ParHojeRanking hoje={1240} qtdHoje={4} podeVerRanking={false} ranking={ranking} />);
    expect(screen.queryByText('Ranking')).toBeNull();
    expect(screen.getByText('4 pagamentos')).toBeTruthy();
  });
});

describe('CartaoRecebido', () => {
  it('marca as faixas batidas e diz a maior', () => {
    const { container } = render(
      <CartaoRecebido
        recebido={38_420.5} meta={34_000} pctMeta={113} unidadeHO={false} semRelatorio={false}
        faixas={[
          { ordem: 1, valor: 34_000, batida: true },
          { ordem: 2, valor: 37_000, batida: true },
          { ordem: 3, valor: 40_000, batida: false },
        ]}
      />,
    );
    expect(container.querySelectorAll('.v-marco.v-ok')).toHaveLength(2);
    expect(container.querySelectorAll('.v-marco')).toHaveLength(3);
    expect(screen.getByText(/2ª meta batida/)).toBeTruthy();
    expect(screen.getByText('113%')).toBeTruthy();
  });
  it('antes da 1ª: quanto falta', () => {
    render(
      <CartaoRecebido recebido={30_000} meta={34_000} pctMeta={88} unidadeHO={false} semRelatorio={false}
        faixas={[{ ordem: 1, valor: 34_000, batida: false }]} />,
    );
    expect(screen.getByText(textoCorrido(/Faltam R\$\s4\.000,00 para a 1ª meta/))).toBeTruthy();
  });
  it('sem meta: sem régua e sem %', () => {
    const { container } = render(
      <CartaoRecebido recebido={5_000} meta={null} pctMeta={null} unidadeHO={false} semRelatorio={false} faixas={[]} />,
    );
    expect(container.querySelector('.v-barra')).toBeNull();
    expect(screen.getByText('Sem meta cadastrada neste mês')).toBeTruthy();
  });
});

describe('ListaPagamentos', () => {
  const pg = (id: string, novo: boolean, cliente = 'MARIA SILVA OLIVEIRA', codigo: string | null = '12345') => ({
    id, cliente, codigo, forma: 'boleto_pix' as const, detalhe: 'Pix',
    valor: 350, data: '2026-09-30', novo,
  });
  it('nome do cliente, embaixo o NR, e o valor com a forma', () => {
    render(<ListaPagamentos pagamentos={[pg('1', true)]} hoje="2026-09-30" carregando={false} limite={8} onVerTodos={null} />);
    expect(screen.getByText('Maria Silva Oliveira')).toBeTruthy();
    expect(screen.getByText('12345')).toBeTruthy();
    expect(screen.getByText(/R\$\s350,00/)).toBeTruthy();
    expect(screen.getByText('Pix')).toBeTruthy();
    expect(screen.getByText('novo')).toBeTruthy();
  });
  it('o código grudado na frente do nome some', () => {
    render(<ListaPagamentos pagamentos={[pg('1', false, '12345 - JOAO DA SILVA')]} hoje="2026-09-30" carregando={false} limite={8} onVerTodos={null} />);
    expect(screen.getByText('Joao da Silva')).toBeTruthy();
  });
  it('limita a lista e oferece «Ver todos»', () => {
    const muitos = Array.from({ length: 10 }, (_, i) => pg(String(i), false));
    render(<ListaPagamentos pagamentos={muitos} hoje="2026-09-30" carregando={false} limite={8} onVerTodos={() => {}} />);
    expect(screen.getAllByText('Maria Silva Oliveira')).toHaveLength(8);
    expect(screen.getByText('Ver todos')).toBeTruthy();
  });
  it('mês vazio convida a esperar, não mostra zeros', () => {
    render(<ListaPagamentos pagamentos={[]} hoje="2026-09-30" carregando={false} limite={8} onVerTodos={null} />);
    expect(screen.getByText('Nenhum pagamento neste mês ainda.')).toBeTruthy();
  });
});

describe('pagamento que saiu do recebimento', () => {
  const p = (id: string, codigo: string, valor = 350) => ({
    id, cliente: 'MARIA SILVA', codigo, forma: 'boleto_pix' as const, detalhe: 'Pix',
    valor, data: '2026-09-30', novo: false,
  });
  it('o que sumiu da lista, pela chave natural', () => {
    expect(pagamentosQueSairam([p('1', '111'), p('2', '222')], [p('1', '111')]).map(x => x.codigo)).toEqual(['222']);
  });
  it('limpar e reimportar troca os ids, mas não é saída', () => {
    expect(pagamentosQueSairam([p('1', '111'), p('2', '222')], [p('9', '111'), p('8', '222')])).toEqual([]);
  });
  it('o aviso diz o que saiu, com NR e valor negativo', () => {
    render(<AvisoSaidas saidas={[p('2', '222', 520)]} onDispensar={() => {}} />);
    expect(screen.getByText('Um pagamento saiu do seu recebimento')).toBeTruthy();
    expect(screen.getByText('Maria Silva · NR 222')).toBeTruthy();
    expect(screen.getByText(/−R\$\s520,00/)).toBeTruthy();
  });
});

describe('CartaoQuartil', () => {
  it('faixa atual, e quanto falta para as de cima hoje e amanhã', () => {
    render(<CartaoQuartil quartil={{
      atual: 2, projecaoPct: 95,
      degraus: [
        { quartil: 1, minPct: 100, falta: 1564, alcancado: false, faltaAmanha: 3473 },
        { quartil: 2, minPct: 80, falta: 0, alcancado: true, faltaAmanha: 0 },
        { quartil: 3, minPct: 50, falta: 0, alcancado: true, faltaAmanha: 0 },
      ],
    }} />);
    expect(screen.getByText(/2º quartil · 95%/)).toBeTruthy();
    expect(screen.getByText('R$ 1.564')).toBeTruthy();
    expect(screen.getByText('R$ 3.473')).toBeTruthy();
    expect(screen.getByText('na faixa')).toBeTruthy();
    expect(screen.queryByText(/^3º/)).toBeNull();
  });
});
