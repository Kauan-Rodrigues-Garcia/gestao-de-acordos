/**
 * Aba Hoje — quem da equipe recebeu hoje e os últimos pagamentos
 * (spec da liderança §2.4).
 *
 * O recebido de hoje e «quem recebeu» vêm das mesmas linhas do gráfico
 * (agregados — todo líder enxerga). A lista um a um depende de a pessoa ler o
 * analítico dos outros (RLS `analitico_select`); sem isso, a aba fica só com
 * os agregados.
 */
import { useEffect, useMemo, useState } from 'react';
import { formatBRL } from '@/lib/money';
import { abreviarCliente, formaDoPagamento, nomeDoCliente, valorCurto } from '@/lib/mobile/formato';
import { DinheiroAnimado } from '../comum/partesComuns';
import { linhaNoEscopo } from '@/services/analitico/escopoAnalitico';
import type { LinhaRecebidaDia } from '@/services/analitico/analitico.service';
import type { EquipeNaTela } from './montarEquipe';
import type { PagamentoEquipe } from './useTelaEquipe';

const CHAVE_VISTO = 'mobile:equipe-visto-ate';
function lerVisto(): string | null {
  try { return localStorage.getItem(CHAVE_VISTO); } catch { return null; }
}
function gravarVisto(v: string): void {
  try { localStorage.setItem(CHAVE_VISTO, v); } catch { /* só nesta visita */ }
}

const LIMITE = 8;

export function AbaHoje({ equipe, hojeISO, linhas, carregando, pagamentos, carregandoPagamentos, isPaguePlay }: {
  equipe: EquipeNaTela;
  hojeISO: string;
  linhas: LinhaRecebidaDia[] | undefined;
  carregando: boolean;
  pagamentos: PagamentoEquipe[] | undefined;
  carregandoPagamentos: boolean;
  isPaguePlay: boolean;
}) {
  const [verTodos, setVerTodos] = useState(false);

  const hoje = useMemo(() => {
    const escopo = { tipo: 'equipe' as const, operadores: new Set(equipe.operadorIds) };
    const porOperador = new Map<string, number>();
    let total = 0;
    for (const l of linhas ?? []) {
      if (l.data_pagamento !== hojeISO || !l.operador_id) continue;
      if (!linhaNoEscopo({ operador_id: l.operador_id, setor_id: l.setor_id, contribuicao: l.contribuicao,
        contribuicao_de_setor_id: l.contribuicao_de_setor_id }, escopo)) continue;
      const v = Number(l.valor_recebido) || 0;
      total += v;
      porOperador.set(l.operador_id, (porOperador.get(l.operador_id) ?? 0) + v);
    }
    const lista = [...porOperador.entries()]
      .filter(([, v]) => v > 0)
      .map(([id, valor]) => ({ id, nome: equipe.nomes[id] ?? 'Operador', valor }))
      .sort((a, b) => b.valor - a.valor);
    return { total, lista };
  }, [linhas, hojeISO, equipe.operadorIds, equipe.nomes]);

  // «Novo» é do aparelho: a marca antiga vale a visita inteira.
  const [vistoAte] = useState<string | null>(() => lerVisto());
  useEffect(() => {
    if (!pagamentos?.length) return;
    const recente = pagamentos.reduce((m, p) => (p.importadoEm > m ? p.importadoEm : m), '');
    if (recente && (!vistoAte || recente > vistoAte)) gravarVisto(recente);
  }, [pagamentos, vistoAte]);

  if (carregando) {
    return <div className="e-esq" style={{ margin: '0 16px', height: 280 }} aria-busy="true" aria-label="Carregando" />;
  }

  const totalPessoas = equipe.detalhe.totalOperadores;
  const maior = hoje.lista[0]?.valor ?? 0;
  const semPagamento = Math.max(0, totalPessoas - hoje.lista.length);
  const listaPg = pagamentos ?? [];
  const visiveis = verTodos ? listaPg : listaPg.slice(0, LIMITE);

  return (
    <>
      <section className="e-leitura">
        <div className="e-olho">Recebido hoje</div>
        <div className="e-leitura-valor e-num"><DinheiroAnimado valor={hoje.total} /></div>
        <div className="e-leitura-de">
          {hoje.lista.length} de {totalPessoas} {totalPessoas === 1 ? 'operador recebeu' : 'operadores receberam'}
          {isPaguePlay && ' · valores brutos'}
        </div>
      </section>

      {hoje.lista.length > 0 ? (
        <>
          <div className="e-sec">
            <span className="e-olho">Quem recebeu</span>
            {semPagamento > 0 && <span className="e-sec-dir">{semPagamento} sem pagamento</span>}
          </div>
          <div className="e-grupo">
            {hoje.lista.map(p => (
              <div key={p.id} className="e-quem-rec">
                <span className="e-op-nm">{abreviarCliente(p.nome)}</span>
                <span className="e-v e-num">{valorCurto(p.valor)}</span>
                <i style={{ width: `${maior > 0 ? (p.valor / maior) * 100 : 0}%` }} />
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="e-nota">Ninguém da equipe recebeu hoje ainda. O relatório entra ao longo do dia.</p>
      )}

      <div className="e-sec">
        <span className="e-olho">Últimos pagamentos</span>
        {listaPg.length > LIMITE && (
          <button type="button" className="e-sec-dir" onClick={() => setVerTodos(v => !v)}>
            {verTodos ? 'Ver menos' : 'Ver todos'}
          </button>
        )}
      </div>
      {carregandoPagamentos ? (
        <div className="e-esq" style={{ margin: '0 16px', height: 160 }} aria-busy="true" aria-label="Carregando" />
      ) : listaPg.length === 0 ? (
        <p className="e-nota">
          Os pagamentos um a um aparecem para quem vê o analítico da equipe. Os totais acima valem para todos.
        </p>
      ) : (
        <div className="e-grupo">
          {visiveis.map(p => {
            const forma = formaDoPagamento(p.forma === 'cartao' ? 'cartao' : 'boleto_pix', p.detalhe);
            const novo = !!vistoAte && p.importadoEm > vistoAte;
            const [, m, dd] = p.data.split('-');
            const nr = (p.codigo ?? '').trim();
            return (
              <div key={p.id} className="e-pg">
                <div className="e-pg-q">
                  <div className="e-pg-c">{nomeDoCliente(p.cliente, nr)}</div>
                  <div className="e-pg-h">
                    {nr && <>NR <b>{nr}</b> · </>}
                    {abreviarCliente(equipe.nomes[p.operadorId ?? ''] ?? '')} · {p.data === hojeISO ? 'Hoje' : `${dd}/${m}`}
                    {novo && <> · <em>novo</em></>}
                  </div>
                </div>
                <div className="e-pg-dir">
                  <span className="e-pg-v e-num">{formatBRL(p.valor)}</span>
                  <span className="e-pg-f"><i style={{ background: forma.cor }} />{forma.rotulo}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
