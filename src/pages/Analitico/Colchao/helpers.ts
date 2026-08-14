import type { ColchaoForaMeta } from '@/services/analitico/colchao.service';

export interface GrupoColchaoOperador {
  operador: string;
  linhas: ColchaoForaMeta[];
  nrs: string[];
  total: number;
}

export function nrsUnicos(linhas: ColchaoForaMeta[]): string[] {
  return [...new Set(linhas.map(l => l.nr_documento.trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
}

export function agruparColchaoPorOperador(linhas: ColchaoForaMeta[]): GrupoColchaoOperador[] {
  const grupos = new Map<string, ColchaoForaMeta[]>();
  for (const linha of linhas) {
    const grupo = grupos.get(linha.operador_usuario) ?? [];
    grupo.push(linha);
    grupos.set(linha.operador_usuario, grupo);
  }

  return [...grupos.entries()]
    .map(([operador, itens]) => ({
      operador,
      linhas: itens,
      nrs: nrsUnicos(itens),
      total: itens.reduce((soma, item) => soma + Number(item.valor_recebido), 0),
    }))
    .sort((a, b) => a.operador.localeCompare(b.operador, 'pt-BR'));
}

export function formatarCopiaColchao(data: string, linhas: ColchaoForaMeta[]): string {
  const [ano, mes, dia] = data.split('-');
  const titulo = `COLCHÃO ${dia}/${mes}/${ano}`;
  const blocos = agruparColchaoPorOperador(linhas).map(grupo => [
    `${grupo.operador} (${grupo.nrs.length} NR${grupo.nrs.length !== 1 ? 's' : ''})`,
    ...grupo.nrs,
  ].join('\n'));
  return [titulo, ...blocos].join('\n\n');
}
