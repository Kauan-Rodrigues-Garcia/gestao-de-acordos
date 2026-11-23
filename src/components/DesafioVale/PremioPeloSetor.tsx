/**
 * As faixas do vale e onde o setor está agora (23/11/2026). Na gaveta do
 * operador fala do vale DELE; na do líder (`paraLider`), do vale do time.
 */
import { Info, Ticket } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DesafioVale, SetorNoVale } from '@/services/desafioVale/desafioVale.service';
import {
  faixaDoSetor, faixaPiso, faixasOrdenadas, faltaParaOPct, pctCortado, proximaFaixa, reais, textoDaFaixa,
} from '@/services/desafioVale/regras';
import { brl, medias } from '@/services/desafioCobranca/regras';

export function PremioPeloSetor({ d, setor, bateu, paraLider = false }: {
  d: DesafioVale; setor: SetorNoVale | null; bateu: boolean;
  /** Visão do líder (23/11/2026): ele não faz as médias — o texto fala do time. */
  paraLider?: boolean;
}) {
  const ord = faixasOrdenadas(d.faixas);
  const pct = setor?.pct ?? null;
  const atual = faixaDoSetor(pct, d.faixas);
  const proxima = proximaFaixa(pct, d.faixas);
  const falta = proxima && setor ? faltaParaOPct(setor.recebido, setor.meta, proxima.pct) : null;
  const final = !!d.fechado_em;
  const topo = Math.max(110, ...ord.map(f => f.pct + 10));
  return (
    <section className="dc-cartao dv-faixas dc-sobe" style={{ ['--d' as string]: 1 }} aria-label="Quanto vale o vale">
      <div className="dc-hoje-linha">
        <p className="dc-rotulo"><Ticket size={14} aria-hidden /> {paraLider ? `Quanto vale o ${d.premio_nome} do seu time` : `Quanto vale o seu ${d.premio_nome}`}</p>
        <span className="dc-niveis-prazo">{final ? 'fechamento oficial' : 'depende do setor'}</span>
      </div>
      <p className="dv-faixas-texto">
        {paraLider
          ? <>Quem do time bater as {medias(d.medias)} leva o vale; o valor sai do <strong>fechamento do mês do setor</strong>:</>
          : <>Bateu as {medias(d.medias)}? O valor sai do <strong>fechamento do mês do seu setor</strong>:</>}
      </p>
      <ul className="dv-faixas-lista">
        {ord.map((f) => {
          const aqui = atual === f;
          return (
            <li key={f.pct} className={cn('dv-faixa', aqui && 'aqui')}>
              <span className="dv-faixa-valor">{reais(f.valor)}</span>
              <span className="dv-faixa-regra">setor {textoDaFaixa(f, d.faixas)}</span>
              {aqui && <span className="dv-faixa-selo">{final ? 'fechou aqui' : paraLider ? 'o setor hoje' : 'seu setor hoje'}</span>}
            </li>
          );
        })}
      </ul>
      {setor ? (
        pct === null ? (
          <p className="dv-setor-nota"><Info size={14} aria-hidden /> O % do {setor.nome} entra no fechamento do mês. Batendo as médias, o mínimo é {reais(faixaPiso(d.faixas)?.valor ?? 0)}.</p>
        ) : (
          <>
            <div className="dv-setor-linha">
              <span>{setor.nome}</span>
              <strong>{pctCortado(pct)}% {setor.origem === 'projecao' ? 'na projeção do mês' : setor.origem === 'manual' ? 'no fechamento oficial' : 'da meta'}</strong>
            </div>
            {setor.origem === 'projecao' && setor.pct_realizado != null && (
              <p className="dv-setor-realizado">
                Realizado até hoje: {pctCortado(setor.pct_realizado)}% · a projeção é onde o setor fecha o mês no ritmo de agora.
              </p>
            )}
            <div className="dv-setor-regua" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, pctCortado(pct))}
              aria-label={`${setor.nome}: ${pctCortado(pct)}% da meta do mês`}>
              <div className="dv-setor-cheia" style={{ width: `${Math.min((pct / topo) * 100, 100)}%` }} />
              {ord.filter(f => f.pct > 0).map(f => (
                <span key={f.pct} className="dv-setor-marca" style={{ left: `${(f.pct / topo) * 100}%` }}><em>{f.pct}%</em></span>
              ))}
            </div>
            {/* 23/11/2026: era uma frase só num `flex`, e cada pedaço virou uma
                coluna. Agora são duas linhas: o vale de hoje e o próximo degrau. */}
            <div className="dv-agora">
              <p className="dv-agora-linha">
                <span>{final ? (bateu && !paraLider ? 'Seu vale ficou em' : 'O vale do setor ficou em') : 'Hoje o vale está em'}</span>
                <strong className="dv-agora-valor">{reais(atual?.valor ?? 0)}</strong>
              </p>
              {!final && (
                <p className="dv-agora-proximo">
                  {proxima
                    ? <>Se o setor fechar em <b>{proxima.pct}%</b>, o vale sobe para <b>{reais(proxima.valor)}</b>.
                      {falta !== null ? <> Para fechar lá, faltam <b>{brl(falta)}</b> de recebimento do setor até o fim do mês.</> : null} Puxe o time!</>
                    : <>O setor já está na faixa mais alta. Segura até o fim do mês!</>}
                </p>
              )}
            </div>
          </>
        )
      ) : (
        <p className="dv-setor-nota"><Info size={14} aria-hidden /> {paraLider ? 'Escolha um setor.' : 'Seu cadastro não tem setor; o valor do vale vem do setor de cada operador.'}</p>
      )}
    </section>
  );
}

