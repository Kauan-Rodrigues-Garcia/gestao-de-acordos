/**
 * individual.ts — uma página de fechamento por pessoa.
 *
 * O caso de uso é a conversa de avaliação: o líder abre a página do operador e
 * mostra o mês dele sem precisar de nenhuma outra seção. Por isso a página é
 * autossuficiente — número, meta, quartil, ritmo, formas e Pix, tudo junto.
 *
 * ## O teto existe por causa do arquivo
 *
 * Trinta páginas cobrem qualquer setor da operação e mantêm o HTML na casa das
 * centenas de KB. Acima disso entram as de maior recebimento, e o relatório diz
 * quantas ficaram de fora. Quem ficou sem página continua nas tabelas, no
 * ranking e nos quartis: o teto corta a seção detalhada, nunca a pessoa.
 */

import { esc, brl, num, comSinal, pct } from '../formato';
import { corDaProjecao, corDaVariacao, COR_PIX } from '../graficos/paleta';
import { svgSparkline } from '../graficos/sparkline';
import { svgDonut } from '../graficos/donut';
import { barraProgressoMarcos } from '../graficos/progressoMarcos';
import {
  htmlCartoes, htmlCabecalhoSecao, htmlPilulaQuartil, painel,
} from './componentes';
import type { LinhaOperadorFechamento, BlocoPixFechamento } from '../tipos';

/** Teto de páginas individuais — ver o cabeçalho do arquivo. */
export const TETO_PAGINAS_INDIVIDUAIS = 30;

/** Identificador de âncora estável, para o índice apontar. */
function ancora(id: string): string {
  return `pessoa-${id.replace(/[^a-zA-Z0-9_-]/g, '')}`;
}

function paginaDaPessoa(
  o: LinhaOperadorFechamento,
  posicao: number,
  pix: BlocoPixFechamento | null,
): string {
  const progresso = o.meta
    ? barraProgressoMarcos({
      realizado: o.bruto,
      meta: o.meta,
      opcoes: {
        marcos: o.metasExtras.map((v, i) => ({ valor: v, rotulo: `${i + 2}ª meta` })),
        mostrarLegenda: o.metasExtras.length > 0,
      },
    })
    : { html: '', batidos: 0, proximo: null };

  const linhaMetas = o.meta && o.metasExtras.length
    ? `<p class="cartao-apoio" style="margin:8px 0 0">
        ${progresso.batidos} de ${o.metasExtras.length + 1} metas batidas.
        ${progresso.proximo
          ? `Faltam ${esc(brl(progresso.proximo.valor - o.bruto))} para a ${esc(progresso.proximo.rotulo)}.`
          : 'Todas as metas do mês foram alcançadas.'}
      </p>`
    : '';

  const semMeta = o.meta === null || o.meta <= 0;
  const semMovimento = o.bruto <= 0;

  const cartoes = htmlCartoes([
    {
      rotulo: 'Recebido no mês', valor: brl(o.bruto),
      apoio: `${num(o.qtd)} pagamento(s)`,
      cor: semMovimento ? undefined : corDaProjecao(o.pctMeta),
    },
    semMeta
      ? { rotulo: 'Meta', valor: '—', apoio: 'sem meta cadastrada para o mês' }
      : { rotulo: 'Meta do mês', valor: brl(o.meta as number), apoio: `${pct(o.pctMeta)} alcançado` },
    o.diferenca !== null
      ? {
        rotulo: 'Contra o esperado', valor: comSinal(o.diferenca),
        apoio: o.diferenca >= 0 ? 'acima do ritmo' : 'abaixo do ritmo',
        cor: corDaVariacao(o.diferenca),
      }
      : null,
    o.projecaoPct !== null
      ? {
        rotulo: 'Projeção', valor: pct(o.projecaoPct),
        apoio: 'do esperado no período', cor: corDaProjecao(o.projecaoPct),
      }
      : null,
  ], 'compacto');

  // O Pix da pessoa sai do ranking já coletado — sem consulta extra.
  const meuPix = pix?.ranking.find(r => r.id === o.id) ?? null;
  const blocoPix = meuPix
    ? htmlCartoes([
      { rotulo: 'Pix Automático', valor: brl(meuPix.valor), apoio: `${num(meuPix.acordos)} acordo(s)`, cor: COR_PIX },
      { rotulo: 'Comissão de Pix', valor: brl(meuPix.comissao), apoio: 'no mês' },
    ], 'compacto')
    : '';

  const temSerie = o.porDia.some(v => v > 0);
  const ritmo = temSerie
    ? `<div>
        <span class="rotulo-forte">Ritmo do mês</span>
        ${svgSparkline(o.porDia, { rotulo: `Ritmo diário de ${o.nome}` })}
      </div>`
    : '';

  const formas = o.porForma.length
    ? `<div>
        <span class="rotulo-forte">Formas de pagamento</span>
        ${svgDonut(
          o.porForma.map(f => ({ rotulo: f.rotulo, valor: f.bruto, qtd: f.qtd })),
          o.bruto,
        )}
      </div>`
    : '';

  const nota = semMovimento
    ? '<p class="vazio">Sem recebimento registrado no mês. O zero acima é ausência de '
      + 'movimento, não ausência de dado.</p>'
    : semMeta
      ? '<p class="vazio">Sem meta cadastrada para esta pessoa no mês — por isso não há '
        + 'percentual, projeção nem quartil.</p>'
      : '';

  return `<article class="pessoa" id="${esc(ancora(o.id))}">
    <div class="pessoa-cabecalho">
      <div>
        <h4 class="pessoa-nome">${esc(o.nome)}</h4>
        <span class="pessoa-sub">
          ${esc(o.usuario)}${o.equipeNome ? ` · Equipe ${esc(o.equipeNome)}` : ''}${o.setorNome ? ` · ${esc(o.setorNome)}` : ''}
        </span>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        ${htmlPilulaQuartil(o.quartil)}
        <span class="pessoa-posicao">${posicao}º no ranking</span>
      </div>
    </div>
    ${cartoes}
    ${progresso.html}${linhaMetas}
    ${blocoPix}
    ${nota}
    <div class="pessoa-corpo">${ritmo}${formas}</div>
  </article>`;
}

export interface ParametrosIndividual {
  operadores: readonly LinhaOperadorFechamento[];
  pix: BlocoPixFechamento | null;
  /** Agrupa por setor — só faz sentido no relatório da diretoria. */
  agruparPorSetor: boolean;
  /** Quantos ficaram de fora pelo teto. */
  semPagina: number;
}

export function secaoIndividual(p: ParametrosIndividual): string {
  if (!p.operadores.length) return '';

  // A posição no ranking é a do escopo INTEIRO, e por isso é calculada antes
  // de qualquer corte por teto: dizer "3º" para quem é 3º entre os 30 exibidos
  // seria mentira se o escopo tivesse 40 pessoas.
  const posicaoPorId = new Map(p.operadores.map((o, i) => [o.id, i + 1]));
  const exibidos = p.operadores.slice(0, TETO_PAGINAS_INDIVIDUAIS);

  const indice = exibidos.length > 1
    ? `<ul class="indice-pessoas">${exibidos.map(o => `
        <li><a href="#${esc(ancora(o.id))}">
          <span>${esc(o.nome)}</span>
          <span class="v">${esc(brl(o.bruto))}</span>
        </a></li>`).join('')}</ul>`
    : '';

  let corpo: string;
  if (p.agruparPorSetor) {
    const porSetor = new Map<string, LinhaOperadorFechamento[]>();
    for (const o of exibidos) {
      const chave = o.setorNome ?? 'Sem setor';
      const lista = porSetor.get(chave);
      if (lista) lista.push(o); else porSetor.set(chave, [o]);
    }
    corpo = [...porSetor.entries()].map(([setor, lista]) =>
      `<div class="divisor">${esc(setor)}</div>`
      + lista.map(o => paginaDaPessoa(o, posicaoPorId.get(o.id) ?? 0, p.pix)).join(''),
    ).join('');
  } else {
    corpo = exibidos.map(o => paginaDaPessoa(o, posicaoPorId.get(o.id) ?? 0, p.pix)).join('');
  }

  const avisoTeto = p.semPagina > 0
    ? `<p class="ajuda">
        ${p.semPagina} operador(es) com menor recebimento não ganharam página própria
        para manter o arquivo leve — eles continuam nas tabelas, no ranking e nos quartis.
      </p>`
    : '';

  return painel(`${htmlCabecalhoSecao({
    titulo: 'Fechamento individual',
    rotuloSlide: 'Fechamento individual',
    ajuda: 'Uma página por pessoa, autossuficiente: dá para abrir só a dela numa '
      + 'conversa de avaliação.',
  })}${avisoTeto}${indice}${corpo}`);
}
