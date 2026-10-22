/**
 * exportar.ts — o mês da cantina em planilha, para o desconto em folha.
 *
 * Três abas: «Não retirados» (o controle que o Cleber pediu), «Por pessoa»
 * (o valor que cada um deve no mês) e «Todos os pedidos».
 */
import { horaSP, STATUS_ROTULO } from '@/lib/cantina';
import { relatorioDoMes, type LinhaRelatorio } from '@/services/cantina/cantina.service';

function dataBR(dia: string): string {
  const [a, m, d] = dia.split('-');
  return `${d}/${m}/${a}`;
}

const linha = (l: LinhaRelatorio) => ({
  Data: dataBR(l.dia),
  Pedido: l.numero,
  Nome: l.nome,
  Empresa: l.empresa_nome ?? '',
  Setor: l.setor_nome ?? '',
  Retirada: horaSP(l.retirada_em),
  Situação: STATUS_ROTULO[l.status],
  Itens: l.itens ?? '',
  Valor: l.total,
});

/** Baixa a planilha do mês (`yyyy-MM`). Devolve quantos pedidos foram. */
export async function baixarRelatorioDoMes(mes: string): Promise<number> {
  const linhas = await relatorioDoMes(mes);
  const { utils, write } = await import('@e965/xlsx');

  const porPessoa = new Map<string, { Nome: string; Empresa: string; Setor: string; Pedidos: number; 'Não retirados': number; Total: number }>();
  for (const l of linhas) {
    const chave = `${l.nome}|${l.empresa_nome ?? ''}`;
    const p = porPessoa.get(chave) ?? { Nome: l.nome, Empresa: l.empresa_nome ?? '', Setor: l.setor_nome ?? '', Pedidos: 0, 'Não retirados': 0, Total: 0 };
    p.Pedidos += 1;
    if (l.status === 'nao_retirado') p['Não retirados'] += 1;
    p.Total = Math.round((p.Total + l.total) * 100) / 100;
    porPessoa.set(chave, p);
  }

  const wb = utils.book_new();
  utils.book_append_sheet(wb, utils.json_to_sheet(linhas.filter(l => l.status === 'nao_retirado').map(linha)), 'Não retirados');
  utils.book_append_sheet(wb, utils.json_to_sheet([...porPessoa.values()].sort((a, b) => a.Nome.localeCompare(b.Nome))), 'Por pessoa');
  utils.book_append_sheet(wb, utils.json_to_sheet(linhas.map(linha)), 'Todos os pedidos');

  const buffer = write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  const url = URL.createObjectURL(new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `cantina-${mes}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5_000);
  return linhas.length;
}
