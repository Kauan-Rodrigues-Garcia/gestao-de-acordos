/**
 * Os blocos da tela mínima (`/m`), de cima para baixo. Visual:
 * docs/mobile/prototipo-m.html. Os dados chegam prontos de `useTelaMobile`.
 */
import { formatBRL } from '@/lib/money';
import { formaDoPagamento, nomeDoCliente } from '@/lib/mobile/formato';
import { BarraMeta, DinheiroAnimado, PctAnimado } from './comum/partesComuns';
import { useDuracaoDaSubida } from './comum/numeroAnimado';
import { formatarPct } from '@/components/Comissao/formato';
import type { MinhaComissao } from '@/services/comissao/useMinhaComissao';
import type { PosicaoNoRanking } from '@/services/analitico/posicaoNoRanking';
import { escalaDaRegua, rotuloDoDia } from './regua';
import { chavePagamento, type Faixa, type Pagamento, type TelaMobile } from './useTelaMobile';

// ── Recebido no mês ─────────────────────────────────────────────────────────

/**
 * O cartão principal — cor sólida pastel (pedido de 30/09/2026: «neutra e
 * pastel, mais minimalista») com a barra simples e animada. A barra enche
 * conforme a % alcançada desde o primeiro real — antes só aparecia depois da
 * 1ª meta (ver `escalaDaRegua`).
 */
export function CartaoRecebido({ recebido, meta, faixas, pctMeta, unidadeHO, semRelatorio }: {
  recebido: number;
  meta: number | null;
  faixas: Faixa[];
  pctMeta: number | null;
  unidadeHO: boolean;
  semRelatorio: boolean;
}) {
  const batidas = faixas.filter(f => f.batida);
  const maior = batidas[batidas.length - 1];
  const escala = escalaDaRegua(recebido, faixas.map(f => f.valor));
  // Número, % e barra sobem juntos, no ritmo lento de «aposta» (30/09/2026).
  const duracao = useDuracaoDaSubida(recebido);

  let linha: React.ReactNode;
  if (!meta) linha = 'Sem meta cadastrada neste mês';
  else if (maior) linha = <>Meta <b>{formatBRL(meta)}</b> · {maior.ordem}ª meta batida</>;
  else linha = <>Faltam <b>{formatBRL(meta - recebido)}</b> para a 1ª meta</>;

  return (
    <section className="v-cartao" aria-label="Recebido no mês">
      <div className="v-rotulo">Recebido no mês{unidadeHO ? ' · H.O.' : ''}</div>
      <div className="v-valor"><DinheiroAnimado valor={recebido} aposta duracaoMs={duracao} /></div>
      <div className="v-linha">
        <span>{linha}</span>
        {pctMeta !== null && <span className="v-pct"><PctAnimado valor={pctMeta} aposta duracaoMs={duracao} /></span>}
      </div>
      {faixas.length > 0 && (
        <BarraMeta
          pct={escala.cheio}
          duracaoMs={duracao}
          marcos={escala.marcos.map((m, i) => ({ pct: m.pct, rotulo: `${m.ordem}ª`, ok: faixas[i].batida }))}
        />
      )}
      {semRelatorio && <div className="v-aviso">O relatório deste mês ainda não foi importado.</div>}
    </section>
  );
}

// ── Quartil ─────────────────────────────────────────────────────────────────

const COR_Q: Record<number, string> = { 1: '#2e9e6a', 2: '#5566d6', 3: '#d08a1e', 4: '#d0493f' };

/**
 * Em qual quartil a pessoa está e quanto falta para cada faixa — hoje (para
 * entrar) e amanhã (para continuar nela, porque a régua sobe um dia útil). A
 * mesma conta da linha expandida dos Quartis do Painel (`degrausComAmanha`).
 */
export function CartaoQuartil({ quartil }: { quartil: NonNullable<TelaMobile['quartil']> }) {
  const linhas = quartil.degraus.filter(g => !g.alcancado || g.quartil === quartil.atual);
  const cor = quartil.atual ? COR_Q[quartil.atual] ?? '#6a7784' : '#6a7784';
  const inteiro = (v: number) => `R$ ${Math.round(v).toLocaleString('pt-BR')}`;
  return (
    <section className="m-cartao m-quartil" aria-label="Seu quartil">
      <div className="m-quartil-topo">
        <span className="m-rot">Seu quartil</span>
        <span className="m-selo-q"><i style={{ background: cor }} />
          {quartil.atual ? `${quartil.atual}º quartil` : 'sem faixa'} · {quartil.projecaoPct}%
        </span>
      </div>
      {linhas.length > 0 && (
        <div className="m-faixas" role="table" aria-label="Quanto falta por faixa">
          <div className="m-faixa m-faixa-cab" role="row">
            <span /><span role="columnheader">Faixa</span>
            <span role="columnheader">Hoje</span><span role="columnheader">Amanhã</span>
          </div>
          {linhas.map(g => (
            <div className="m-faixa" role="row" key={g.quartil}>
              <i style={{ background: COR_Q[g.quartil] ?? '#6a7784' }} />
              <span role="cell" className="m-faixa-n">
                {g.quartil}º{g.quartil === quartil.atual && <small> atual</small>}
              </span>
              <span role="cell" className={g.alcancado ? 'm-verde-txt' : 'm-num'}>
                {g.alcancado ? 'na faixa' : inteiro(g.falta)}
              </span>
              <span role="cell" className="m-num m-cinza">
                {g.faltaAmanha === null ? '—' : g.faltaAmanha === 0 ? 'mantém' : inteiro(g.faltaAmanha)}
              </span>
            </div>
          ))}
        </div>
      )}
      <p className="m-quartil-nota">Hoje: quanto falta para entrar na faixa. Amanhã: para continuar nela.</p>
    </section>
  );
}

// ── Comissão ────────────────────────────────────────────────────────────────

export function CartaoComissao({ comissao }: { comissao: MinhaComissao }) {
  const r = comissao.resultado;
  if (comissao.erro || !r) {
    return (
      <section className="m-cartao m-comissao">
        <span className="m-rot">Sua comissão</span>
        <p>Não foi possível carregar a comissão agora. Tente de novo em instantes.</p>
      </section>
    );
  }

  const primeira = r.faixas[0];
  const semFaixa = r.motivo === 'nenhuma_faixa' || !r.atual;

  return (
    <section className="m-cartao m-comissao" aria-label="Sua comissão">
      <div className="m-comissao-topo">
        <span className="m-rot">Sua comissão</span>
        {r.atual && (
          <span className="m-selo">{r.atual.ordem}ª meta · {formatarPct(r.atual.pctEfetivo)}</span>
        )}
      </div>
      <div className="m-valor m-num"><DinheiroAnimado valor={r.total + r.totalBonus} aposta /></div>
      {semFaixa && primeira ? (
        <p>Você ainda não chegou na 1ª meta. Faltam <b>{formatBRL(Math.max(0, primeira.meta - r.recebido))}</b>.</p>
      ) : (
        <p>É quanto você recebe <b>se o mês fechar hoje</b>. O valor sobe junto com o recebido.</p>
      )}
      {r.totalBonus > 0 && <p>Inclui <b>{formatBRL(r.totalBonus)}</b> de bônus.</p>}
      {r.proxima && (
        <div className="m-prox">
          <span>Faltam <b className="m-num">{formatBRL(Math.max(0, r.proxima.meta - r.recebido))}</b> para a {r.proxima.ordem}ª meta</span>
          {r.proxima.minimo !== null && (
            <span>Lá, sua comissão vai a <b className="m-num m-verde">{formatBRL(r.proxima.minimo)}</b></span>
          )}
        </div>
      )}
    </section>
  );
}

// ── Hoje e ranking ──────────────────────────────────────────────────────────

/**
 * `unidadeHO` (regra Cofen): o «hoje» vem em H.O., como o cartão do mês, e o
 * ranking continua em bruto, como na aba Analítico — cada número diz a sua
 * unidade, senão os três parecem não bater (05/10/2026).
 */
export function ParHojeRanking({ hoje, qtdHoje, podeVerRanking, ranking, unidadeHO = false }: {
  hoje: number;
  qtdHoje: number;
  podeVerRanking: boolean;
  ranking: PosicaoNoRanking | null;
  unidadeHO?: boolean;
}) {
  const mostraRanking = podeVerRanking && !!ranking;
  return (
    <div className={mostraRanking ? 'm-dupla' : 'm-dupla m-uma'}>
      <section className="m-cartao">
        <div className="m-rot">Recebido hoje{unidadeHO ? ' · H.O.' : ''}</div>
        <div className="m-v m-num"><DinheiroAnimado valor={hoje} aposta /></div>
        <div className="m-d">{qtdHoje === 1 ? '1 pagamento' : `${qtdHoje} pagamentos`}</div>
      </section>
      {mostraRanking && ranking && (
        <section className="m-cartao">
          <div className="m-rot">Ranking</div>
          <div className="m-v m-num">{ranking.posicao}º <span className="m-de">de {ranking.de}</span></div>
          <div className="m-d">
            {ranking.faltam === null
              ? 'Você está em 1º'
              : `${formatBRL(ranking.faltam)}${unidadeHO ? ' bruto' : ''} do ${ranking.posicao - 1}º`}
          </div>
        </section>
      )}
    </div>
  );
}

// ── Pagamentos ──────────────────────────────────────────────────────────────

/**
 * A lista do mês — pedido de 30/09/2026: o nome do cliente (sem o código que
 * algumas origens gravam na frente), embaixo o NR, e o valor. Cada linha:
 *
 *   Maria da Silva                  R$ 350,00
 *   NR 12345 · Hoje                 ● Pix
 */
export function ListaPagamentos({ pagamentos, hoje, carregando, limite, onVerTodos, valoresBrutos = false }: {
  pagamentos: Pagamento[];
  hoje: string;
  carregando: boolean;
  limite: number | null;
  onVerTodos: (() => void) | null;
  /** Regra Cofen: o pagamento vem do relatório em bruto, e o cartão está em H.O. */
  valoresBrutos?: boolean;
}) {
  const visiveis = limite === null ? pagamentos : pagamentos.slice(0, limite);
  return (
    <>
      <div className="m-titulo" id="m-pagamentos">
        <h2>
          {limite === null ? 'Pagamentos do mês' : 'Últimos pagamentos'}
          {valoresBrutos && <span className="m-de"> · valores brutos</span>}
        </h2>
        {onVerTodos && pagamentos.length > (limite ?? 0) && (
          <button type="button" onClick={onVerTodos}>{limite === null ? 'Ver menos' : 'Ver todos'}</button>
        )}
      </div>
      <section className="m-lista">
        {carregando && <div className="m-vazio">Carregando pagamentos…</div>}
        {!carregando && visiveis.length === 0 && (
          <div className="m-vazio">Nenhum pagamento neste mês ainda.</div>
        )}
        {visiveis.map(p => {
          const f = formaDoPagamento(p.forma, p.detalhe);
          const nr = (p.codigo ?? '').trim();
          return (
            <div key={p.id} className={p.novo ? 'm-pg m-novo' : 'm-pg'}>
              <div className="m-pg-q">
                <div className="m-pg-c">{nomeDoCliente(p.cliente, nr)}</div>
                <div className="m-pg-h">
                  {nr ? <>NR <b className="m-nr">{nr}</b> · </> : null}
                  {rotuloDoDia(p.data, hoje)}{p.novo && <> · <b className="m-novo-tag">novo</b></>}
                </div>
              </div>
              <div className="m-pg-dir">
                <span className="m-num m-pg-v">{formatBRL(p.valor)}</span>
                <span className="m-pg-f"><i style={{ background: f.cor }} />{f.rotulo}</span>
              </div>
            </div>
          );
        })}
      </section>
    </>
  );
}

/** Pagamentos que saíram do recebimento com o app aberto. */
export function AvisoSaidas({ saidas, onDispensar }: { saidas: Pagamento[]; onDispensar: () => void }) {
  if (saidas.length === 0) return null;
  const total = saidas.reduce((s, p) => s + p.valor, 0);
  return (
    <section className="m-cartao m-saida v-entra" role="status">
      <div className="m-saida-topo">
        <b>{saidas.length === 1 ? 'Um pagamento saiu do seu recebimento' : `${saidas.length} pagamentos saíram do seu recebimento`}</b>
        <button type="button" onClick={onDispensar} aria-label="Dispensar aviso">Ok</button>
      </div>
      {saidas.map(p => (
        <div key={chavePagamento(p)} className="m-saida-linha">
          <span>{nomeDoCliente(p.cliente, p.codigo)}{p.codigo ? ` · NR ${p.codigo}` : ''}</span>
          <span className="m-num">−{formatBRL(p.valor)}</span>
        </div>
      ))}
      <p>O total do mês e o de hoje já estão sem {saidas.length === 1 ? 'ele' : `esses ${formatBRL(total)}`}.</p>
    </section>
  );
}
