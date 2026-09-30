/**
 * Os blocos da tela mínima (`/m`), de cima para baixo. Visual:
 * docs/mobile/prototipo-m.html. Os dados chegam prontos de `useTelaMobile`.
 */
import { formatBRL } from '@/lib/money';
import { abreviarCliente, formaDoPagamento } from '@/lib/mobile/formato';
import { formatarPct } from '@/components/Comissao/formato';
import type { MinhaComissao } from '@/services/comissao/useMinhaComissao';
import type { PosicaoNoRanking } from '@/services/analitico/posicaoNoRanking';
import { escalaDaRegua, rotuloDoDia } from './regua';
import type { Faixa, Pagamento } from './useTelaMobile';

/** «R$ 38.420,50» com o «R$» menor, como no protótipo. */
export function Dinheiro({ valor }: { valor: number }) {
  const texto = formatBRL(valor).replace(/^R\$\s?/, '');
  return <><small>R$</small>{texto}</>;
}

// ── Recebido no mês ─────────────────────────────────────────────────────────

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

  let linha: string;
  if (!meta) linha = 'Sem meta cadastrada neste mês';
  else if (maior) linha = `Meta ${formatBRL(meta)} · ${maior.ordem}ª meta batida`;
  else linha = `Faltam ${formatBRL(meta - recebido)} para a 1ª meta`;

  return (
    <section className="m-hero" aria-label="Recebido no mês">
      <div className="m-rot">Recebido no mês{unidadeHO ? ' · H.O.' : ''}</div>
      <div className="m-valor m-num"><Dinheiro valor={recebido} /></div>
      <div className="m-meta-linha">
        <span>{linha}</span>
        {pctMeta !== null && <b>{Math.floor(pctMeta)}%</b>}
      </div>
      {faixas.length > 0 && (
        <div className="m-regua" aria-hidden="true">
          <div className="m-trilho" />
          <div className="m-cheio" style={{ width: `${escala.cheio}%` }} />
          {escala.marcos.map((m, i) => (
            <div key={m.ordem} className={faixas[i].batida ? 'm-marco ok' : 'm-marco'} style={{ left: `${m.pct}%` }}>
              <span>{m.ordem}ª</span>
            </div>
          ))}
        </div>
      )}
      {semRelatorio && <div className="m-hero-aviso">O relatório deste mês ainda não foi importado.</div>}
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
      <div className="m-valor m-num"><Dinheiro valor={r.total + r.totalBonus} /></div>
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

export function ParHojeRanking({ hoje, qtdHoje, podeVerRanking, ranking }: {
  hoje: number;
  qtdHoje: number;
  podeVerRanking: boolean;
  ranking: PosicaoNoRanking | null;
}) {
  const mostraRanking = podeVerRanking && !!ranking;
  return (
    <div className={mostraRanking ? 'm-dupla' : 'm-dupla m-uma'}>
      <section className="m-cartao">
        <div className="m-rot">Recebido hoje</div>
        <div className="m-v m-num">{formatBRL(hoje)}</div>
        <div className="m-d">{qtdHoje === 1 ? '1 pagamento' : `${qtdHoje} pagamentos`}</div>
      </section>
      {mostraRanking && ranking && (
        <section className="m-cartao">
          <div className="m-rot">Ranking</div>
          <div className="m-v m-num">{ranking.posicao}º <span>de {ranking.de}</span></div>
          <div className="m-d">
            {ranking.faltam === null ? 'Você está em 1º' : `${formatBRL(ranking.faltam)} do ${ranking.posicao - 1}º`}
          </div>
        </section>
      )}
    </div>
  );
}

// ── Pagamentos ──────────────────────────────────────────────────────────────

function corDeFundo(cor: string): string {
  // A cor da forma a ~12% sobre branco: o chip fica claro e a sigla legível.
  return `color-mix(in srgb, ${cor} 14%, white)`;
}

export function ListaPagamentos({ pagamentos, hoje, carregando, limite, onVerTodos }: {
  pagamentos: Pagamento[];
  hoje: string;
  carregando: boolean;
  limite: number | null;
  onVerTodos: (() => void) | null;
}) {
  const visiveis = limite === null ? pagamentos : pagamentos.slice(0, limite);
  return (
    <>
      <div className="m-titulo" id="m-pagamentos">
        <h2>{limite === null ? 'Pagamentos do mês' : 'Últimos pagamentos'}</h2>
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
          return (
            <div key={p.id} className={p.novo ? 'm-pg m-novo' : 'm-pg'}>
              <span
                className={f.curto.length > 4 ? 'm-forma m-forma-longa' : 'm-forma'}
                style={{ background: corDeFundo(f.cor), color: f.cor }} title={f.rotulo}
              >
                {f.curto}
              </span>
              <div className="m-pg-q">
                <div className="m-pg-c">{abreviarCliente(p.cliente)}</div>
                <div className="m-pg-h">{rotuloDoDia(p.data, hoje)} · {f.rotulo}{p.novo && <> · <b>novo</b></>}</div>
              </div>
              <span className="m-num">{formatBRL(p.valor)}</span>
            </div>
          );
        })}
      </section>
    </>
  );
}
