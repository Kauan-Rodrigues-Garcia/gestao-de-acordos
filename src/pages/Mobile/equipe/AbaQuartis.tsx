/**
 * Aba Quartis — a tabela de 9 colunas do Painel do Líder virada em lista
 * (spec da liderança §2.2).
 *
 *   • a pizza vira barra de distribuição, e as faixas viram FILTROS (o mesmo
 *     gesto do clique na fatia do site);
 *   • cada operador é uma linha com a régua;
 *   • o toque abre a folha de detalhe — o conteúdo da linha expandida do site,
 *     com as mesmas contas (`detalharOperador`) e o mesmo texto do WhatsApp
 *     (`montarMensagemOperador`).
 */
import { useEffect, useMemo, useState } from 'react';
import { formatBRL } from '@/lib/money';
import { valorCurto, abreviarCliente } from '@/lib/mobile/formato';
import { copiarTexto } from '@/lib/clipboard';
import { detalharOperador } from '@/pages/Dashboard/Analitico/detalheOperador';
import { montarMensagemOperador } from '@/pages/Dashboard/Analitico/mensagemOperador';
import type { LinhaQuartil } from '@/pages/Dashboard/Analitico/linhasQuartil';
import type { EquipeNaTela } from './montarEquipe';
import { EscalaRegua, Linha, Regua, Seta, TabelaFaixas } from './partes';
import { corDoQuartil, marcasDosQuartis } from './regua';

type Ordem = 'maior' | 'menor';

function inteiro(v: number): string {
  return `R$ ${Math.round(v).toLocaleString('pt-BR')}`;
}

export function AbaQuartis({ equipe, mes }: { equipe: EquipeNaTela; mes: string }) {
  const [filtro, setFiltro] = useState<number | null>(null);
  const [ordem, setOrdem] = useState<Ordem>('maior');
  const [aberto, setAberto] = useState<string | null>(null);
  const marcas = useMemo(() => marcasDosQuartis(equipe.quartis), [equipe.quartis]);

  const visiveis = useMemo(() => {
    const l = filtro === null ? equipe.linhas : equipe.linhas.filter(x => x.quartil?.quartil === filtro);
    return ordem === 'maior' ? l : [...l].reverse();
  }, [equipe.linhas, filtro, ordem]);

  const linhaAberta = aberto ? equipe.linhas.find(l => l.op.id === aberto) ?? null : null;
  const { distribuicao } = equipe;

  if (equipe.linhas.length === 0) {
    return (
      <p className="e-vazio">
        <b>Ninguém com meta nesta equipe</b>
        Os quartis comparam o recebido com a meta de cada pessoa. A meta se grava na versão completa.
      </p>
    );
  }

  return (
    <>
      <section className="e-dist" aria-label="Distribuição por quartil">
        <div className="e-dist-barra" aria-hidden="true">
          {distribuicao.fatias.filter(f => f.qtd > 0).map(f => (
            <i key={f.quartil} style={{ flex: f.qtd, background: corDoQuartil(f.quartil) }} />
          ))}
        </div>
        <div className="e-filtros" role="group" aria-label="Filtrar por quartil">
          <button type="button" aria-pressed={filtro === null} onClick={() => setFiltro(null)}>Todos</button>
          {distribuicao.fatias.map(f => (
            <button key={f.quartil} type="button" aria-pressed={filtro === f.quartil}
              aria-label={`${f.quartil}º quartil, ${f.qtd} ${f.qtd === 1 ? 'pessoa' : 'pessoas'}`}
              onClick={() => setFiltro(filtro === f.quartil ? null : f.quartil)}>
              <i style={{ background: corDoQuartil(f.quartil) }} />{f.quartil}º · {f.qtd}
            </button>
          ))}
        </div>
      </section>

      <div className="e-sec">
        <span className="e-olho">Operadores</span>
        <button type="button" className="e-ordem" onClick={() => setOrdem(o => (o === 'maior' ? 'menor' : 'maior'))}>
          {ordem === 'maior' ? 'maior projeção' : 'menor projeção'} <Seta tamanho={13} />
        </button>
      </div>

      <div className="e-grupo">
        {visiveis.map(l => (
          <button key={l.op.id} type="button" className="e-op" onClick={() => setAberto(l.op.id)}
            aria-label={`${l.op.nome}: ${l.projecao ?? '—'}% da projeção. Ver detalhe`}>
            <div className="e-op-l1">
              <i style={{ background: corDoQuartil(l.quartil?.quartil) }} />
              <span className="e-op-nm">{abreviarCliente(l.op.nome)}</span>
              <span className="e-op-pc e-num">{l.projecao !== null ? `${l.projecao}%` : '—'}</span>
            </div>
            <Regua pct={l.projecao} marcas={marcas} cor={corDoQuartil(l.quartil?.quartil)} />
            <div className="e-op-l3">
              <span className="e-tab">{valorCurto(l.recebido)} de {valorCurto(l.meta ?? 0).replace('R$ ', '')}</span>
              {l.diferenca !== null && (
                <span className={`e-tab ${l.diferenca >= 0 ? 'e-pos' : 'e-neg'}`}>
                  {valorCurto(l.diferenca, { sinal: true })}
                </span>
              )}
            </div>
          </button>
        ))}
      </div>
      {visiveis.length === 0 && <p className="e-nota">Ninguém nesta faixa agora.</p>}

      {equipe.semMeta.length > 0 && (
        <p className="e-nota">
          {equipe.semMeta.length} {equipe.semMeta.length === 1 ? 'pessoa sem meta fica' : 'pessoas sem meta ficam'} fora
          dos quartis. A meta se grava na versão completa.
        </p>
      )}

      {linhaAberta && (
        <FolhaOperador
          linha={linhaAberta}
          equipe={equipe}
          mes={mes}
          marcas={marcas}
          onFechar={() => setAberto(null)}
        />
      )}
    </>
  );
}

function FolhaOperador({ linha, equipe, mes, marcas, onFechar }: {
  linha: LinhaQuartil;
  equipe: EquipeNaTela;
  mes: string;
  marcas: number[];
  onFechar: () => void;
}) {
  const d = detalharOperador({
    recebido: linha.recebido,
    meta: linha.meta,
    totalUteis: linha.dias.totalUteis,
    decorridos: linha.dias.decorridos,
    quartis: equipe.quartis,
    pagamentos: linha.pagamentos,
    recebidosDoGrupo: equipe.linhas.map(l => l.recebido),
  });

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onFechar]);

  const mandarResumo = async () => {
    const texto = montarMensagemOperador({
      nome: linha.op.nome ?? 'Operador',
      mes,
      recebido: linha.recebido,
      meta: linha.meta,
      rotuloUnidade: equipe.emHO ? 'H.O.' : null,
      detalhe: d,
    });
    // No celular, o compartilhamento do aparelho abre o WhatsApp direto. Sem
    // ele (ou cancelado por erro), cai na cópia — o mesmo do site.
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ text: texto });
        return;
      } catch (e) {
        if ((e as { name?: string })?.name === 'AbortError') return;
      }
    }
    await copiarTexto(texto, 'Texto copiado — é só colar no WhatsApp.', 'Não foi possível copiar o texto.');
  };

  const q = linha.quartil?.quartil ?? null;
  const titulo = `folha-${linha.op.id}`;

  return (
    <div className="e-veu" onClick={onFechar}>
      <section className="e-folha" role="dialog" aria-modal="true" aria-labelledby={titulo}
        onClick={e => e.stopPropagation()}>
        <button type="button" className="e-alca" aria-label="Fechar" onClick={onFechar} />
        <div className="e-folha-cab">
          <h3 id={titulo}>{linha.op.nome}</h3>
          <span className="e-selo">
            <i style={{ background: corDoQuartil(q) }} />
            {q ? `${q}º quartil` : 'sem faixa'}{linha.projecao !== null ? ` · ${linha.projecao}%` : ''}
          </span>
        </div>

        <div className="e-folha-resumo">
          <div className="e-folha-valor e-num">{formatBRL(linha.recebido)}</div>
          <div className="e-folha-de">
            de {inteiro(linha.meta ?? 0)}
            {linha.hoje !== null && <> · esperado hoje {inteiro(linha.hoje)}</>}
            {linha.diferenca !== null && (
              <> · <span className={linha.diferenca >= 0 ? 'e-pos' : 'e-neg'}>
                {linha.diferenca >= 0 ? '+' : '−'}{inteiro(Math.abs(linha.diferenca))}
              </span></>
            )}
            {equipe.emHO && ' · H.O.'}
          </div>
          <Regua pct={linha.projecao} marcas={marcas} cor={corDoQuartil(q)} />
          <EscalaRegua marcas={marcas} />
        </div>

        {d.degraus.length > 0 && (
          <>
            <div className="e-sec" style={{ marginTop: 16 }}><span className="e-olho">Quanto falta por faixa</span></div>
            <TabelaFaixas degraus={d.degraus} faixaAtual={q} formatar={inteiro} />
          </>
        )}

        <div className="e-sec"><span className="e-olho">No ritmo de hoje</span></div>
        <div className="e-grupo">
          <Linha rotulo="Fecha o mês em">{inteiro(d.projecaoFechamento)}</Linha>
          {d.sobraProjetada !== null && (
            <Linha rotulo={d.sobraProjetada >= 0 ? 'Sobra projetada' : 'Falta projetada'}>
              <span className={d.sobraProjetada >= 0 ? 'e-pos' : 'e-neg'}>{inteiro(Math.abs(d.sobraProjetada))}</span>
            </Linha>
          )}
          <Linha rotulo="Pagamentos · ticket médio">
            {d.pagamentos ?? 0}{d.ticketMedio !== null ? ` · ${inteiro(d.ticketMedio)}` : ''}
          </Linha>
          {d.posicao !== null && (
            <Linha rotulo="Posição na equipe">{d.posicao}º de {d.tamanhoGrupo}</Linha>
          )}
        </div>

        <button type="button" className="e-btn" onClick={() => { void mandarResumo(); }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2}
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.4A8.4 8.4 0 1 1 21 11.5z" />
          </svg>
          Mandar resumo no WhatsApp
        </button>
      </section>
    </div>
  );
}
