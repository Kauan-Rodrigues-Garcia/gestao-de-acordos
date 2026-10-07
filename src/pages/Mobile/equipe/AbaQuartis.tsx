/**
 * Aba Quartis — a tabela de 9 colunas do Painel do Líder virada em lista
 * (spec da liderança §2.2).
 *
 *   • a pizza vira uma rosca com a legenda ao lado; fatia e legenda são
 *     FILTROS (o mesmo gesto do clique na fatia do site);
 *   • cada operador é uma linha com a régua na cor do seu quartil;
 *   • o toque abre a folha de detalhe (`FolhaInferior`, presa na tela) — o
 *     conteúdo da linha expandida do site, com as mesmas contas
 *     (`detalharOperador`) e o mesmo texto do WhatsApp
 *     (`montarMensagemOperador`).
 */
import { useCallback, useMemo, useState } from 'react';
import { formatBRL } from '@/lib/money';
import { valorCurto, abreviarCliente } from '@/lib/mobile/formato';
import { copiarTexto } from '@/lib/clipboard';
import { detalharOperador } from '@/pages/Dashboard/Analitico/detalheOperador';
import { montarMensagemOperador } from '@/pages/Dashboard/Analitico/mensagemOperador';
import type { LinhaQuartil } from '@/pages/Dashboard/Analitico/linhasQuartil';
import type { EquipeNaTela } from './montarEquipe';
import { FolhaInferior } from './FolhaInferior';
import { EscalaRegua, Linha, Regua, Seta, TabelaFaixas } from './partes';
import { corDoQuartil, marcasDosQuartis } from './regua';

type Ordem = 'maior' | 'menor';

function inteiro(v: number): string {
  return `R$ ${Math.round(v).toLocaleString('pt-BR')}`;
}

export function AbaQuartis({ equipe, mes }: { equipe: EquipeNaTela; mes: string }) {
  const [filtro, setFiltro] = useState<number | null>(null);
  const [ordem, setOrdem] = useState<Ordem>('maior');
  // `aberto` diz se a folha está aberta; `mostrado` segura quem ela mostra
  // durante a animação de saída.
  const [aberto, setAberto] = useState<string | null>(null);
  const [mostrado, setMostrado] = useState<string | null>(null);
  const abrir = (id: string) => { setMostrado(id); setAberto(id); };
  const fechar = useCallback(() => setAberto(null), []);
  const marcas = useMemo(() => marcasDosQuartis(equipe.quartis), [equipe.quartis]);

  const visiveis = useMemo(() => {
    const l = filtro === null ? equipe.linhas : equipe.linhas.filter(x => x.quartil?.quartil === filtro);
    return ordem === 'maior' ? l : [...l].reverse();
  }, [equipe.linhas, filtro, ordem]);

  const linhaAberta = mostrado ? equipe.linhas.find(l => l.op.id === mostrado) ?? null : null;

  if (equipe.linhas.length === 0) {
    return (
      <p className="e-vazio">
        <b>Ninguém com meta nesta equipe</b>
        Os quartis comparam o recebido com a meta de cada pessoa. A meta se grava no site, no computador.
      </p>
    );
  }

  return (
    <>
      <RoscaQuartis equipe={equipe} filtro={filtro} onFiltro={setFiltro} />

      <div className="e-sec">
        <span className="e-olho">Operadores</span>
        <button type="button" className="e-ordem" onClick={() => setOrdem(o => (o === 'maior' ? 'menor' : 'maior'))}>
          {ordem === 'maior' ? 'maior projeção' : 'menor projeção'} <Seta tamanho={13} />
        </button>
      </div>

      <div className="e-grupo">
        {visiveis.map(l => (
          <button key={l.op.id} type="button" className="e-op" onClick={() => abrir(l.op.id)}
            aria-label={`${l.op.nome}: ${l.projecao ?? '—'}% da projeção. Ver detalhe`}>
            <div className="e-op-l1">
              <i style={{ background: corDoQuartil(l.quartil?.quartil) }} />
              <span className="e-op-nm">{abreviarCliente(l.op.nome)}</span>
              <span className="e-op-pc e-num" style={{ color: corDoQuartil(l.quartil?.quartil) }}>{l.projecao !== null ? `${l.projecao}%` : '—'}</span>
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
          dos quartis. A meta se grava no site, no computador.
        </p>
      )}

      {linhaAberta && (
        <FolhaOperador
          aberta={aberto !== null}
          linha={linhaAberta}
          equipe={equipe}
          mes={mes}
          marcas={marcas}
          onFechar={fechar}
        />
      )}
    </>
  );
}

function FolhaOperador({ aberta, linha, equipe, mes, marcas, onFechar }: {
  aberta: boolean;
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
    <FolhaInferior
      aberta={aberta}
      onFechar={onFechar}
      rotuloId={titulo}
      cabecalho={
        <div className="e-folha-cab">
          <h3 id={titulo}>{linha.op.nome}</h3>
          <span className="e-selo">
            <i style={{ background: corDoQuartil(q) }} />
            {q ? `${q}º quartil` : 'sem faixa'}{linha.projecao !== null ? ` · ${linha.projecao}%` : ''}
          </span>
        </div>
      }
    >
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
    </FolhaInferior>
  );
}

/**
 * A distribuição por quartil: uma rosca com a legenda ao lado. Tocar numa fatia
 * ou numa linha da legenda filtra a lista; tocar de novo (ou no miolo) volta a
 * mostrar todos. A legenda é quem fala com o leitor de tela — a rosca é só
 * desenho.
 */
function RoscaQuartis({ equipe, filtro, onFiltro }: {
  equipe: EquipeNaTela;
  filtro: number | null;
  onFiltro: (q: number | null) => void;
}) {
  const { distribuicao, quartis } = equipe;
  const total = distribuicao.total;
  const R = 44;
  const C = 2 * Math.PI * R;
  const fatias = distribuicao.fatias.filter(f => f.qtd > 0);
  const vao = fatias.length > 1 ? 3 : 0;
  let acumulado = 0;
  const arcos = fatias.map(f => {
    const tam = (f.qtd / Math.max(1, total)) * C;
    const arco = { ...f, inicio: acumulado, tam: Math.max(0.5, tam - vao) };
    acumulado += tam;
    return arco;
  });

  const ordenadas = [...quartis].sort((a, b) => a.quartil - b.quartil);
  const faixaDe = (q: number): string => {
    const i = ordenadas.findIndex(x => x.quartil === q);
    const cfg = ordenadas[i];
    if (!cfg) return '';
    if (cfg.min_pct > 0) return `a partir de ${cfg.min_pct}%`;
    const acima = ordenadas[i - 1];
    return acima ? `abaixo de ${acima.min_pct}%` : '';
  };
  const alternar = (q: number) => onFiltro(filtro === q ? null : q);
  const doFiltro = filtro !== null ? distribuicao.fatias.find(f => f.quartil === filtro) : null;

  return (
    <section className="e-dist" aria-label="Distribuição por quartil">
      <div className="e-rosca">
        <svg viewBox="0 0 112 112" aria-hidden="true">
          <circle cx={56} cy={56} r={R} fill="none" stroke="var(--e-trilho)" strokeWidth={12} />
          <g className="e-rosca-g">
            {arcos.map(a => (
              <circle key={a.quartil} cx={56} cy={56} r={R} fill="none"
                className={`e-rosca-seg${filtro === a.quartil ? ' e-rosca-on' : filtro !== null ? ' e-rosca-off' : ''}`}
                stroke={corDoQuartil(a.quartil)}
                strokeDasharray={`${a.tam} ${C - a.tam}`}
                strokeDashoffset={-a.inicio}
                onClick={() => alternar(a.quartil)} />
            ))}
          </g>
        </svg>
        <button type="button" className="e-rosca-miolo" tabIndex={-1} aria-hidden="true" onClick={() => onFiltro(null)}>
          <b className="e-num">{doFiltro ? doFiltro.qtd : total}</b>
          <span>{doFiltro ? `no ${doFiltro.quartil}º` : total === 1 ? 'pessoa' : 'pessoas'}</span>
        </button>
      </div>

      <div className="e-legenda" role="group" aria-label="Filtrar por quartil">
        {distribuicao.fatias.map(f => {
          const pct = total ? Math.round((f.qtd / total) * 100) : 0;
          return (
            <button key={f.quartil} type="button" aria-pressed={filtro === f.quartil}
              className={filtro !== null && filtro !== f.quartil ? 'e-legenda-off' : undefined}
              aria-label={`${f.quartil}º quartil, ${f.qtd} ${f.qtd === 1 ? 'pessoa' : 'pessoas'}`}
              onClick={() => alternar(f.quartil)}>
              <i style={{ background: corDoQuartil(f.quartil) }} />
              <span className="e-legenda-n">
                {f.quartil}º quartil
                <small>{faixaDe(f.quartil)}</small>
              </span>
              <span className="e-legenda-q">
                <b className="e-num">{f.qtd}</b>
                <small>{pct}%</small>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
