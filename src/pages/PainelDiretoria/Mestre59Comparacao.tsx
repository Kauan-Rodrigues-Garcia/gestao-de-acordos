/**
 * Mestre59Comparacao — o mestre contra o que o sistema tem hoje.
 *
 * É a tela que responde «dá para trocar de fonte?» ANTES de trocar. Sem ela a
 * divergência aparece semanas depois, num card de meta, sem forma de saber de
 * onde veio.
 *
 * Os dois lados são só LEITURA. `analitico_recebimentos` é lido e nunca escrito;
 * o mestre também não muda. Rodar isto não altera número nenhum.
 *
 * ## A conta, na horizontal
 *
 *     Mestre − Integral = Comparável   e   Comparável − Sistema = Diferença
 *
 * A coluna do meio existia na resposta do banco e a tela não mostrava. Quem
 * lia via «R$ 126.699,77 no mestre, R$ 0,00 no sistema, +R$ 99.571,88 de
 * diferença» e concluía, com razão, que a conta estava errada. Não estava: os
 * R$ 27.127,89 que faltam são o Integral que outra carteira cobrou para cá.
 *
 * Ele sai da comparação porque conta no 59 dos DOIS lados (rateio) e o
 * analítico só tem a perna de quem cobrou. Compará-lo acusaria uma divergência
 * do tamanho exato da contribuição, todo mês, para sempre.
 *
 * ## Duas tabelas, e não uma
 *
 * Carteira sem setor tem sistema zero por definição — não há setor de onde ler
 * o analítico. Misturada com as vinculadas ela entra na leitura como se fosse
 * divergência. Aqui ela mora numa seção própria, dita pelo nome.
 *
 * ## O sinal da diferença
 *
 *   positivo  o mestre tem MAIS. Normal enquanto o setor não importa o 58 do
 *             dia.
 *   negativo  o sistema tem MAIS que o relatório mostra. Este merece olhar: é
 *             dinheiro no banco que o arquivo não repõe.
 *
 * Clicar na diferença abre `Mestre59Diferenca`, que diz onde está cada centavo.
 */

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import {
  RefreshCw, Scale, AlertTriangle, Link2Off, ArrowRight, ArrowLeftRight, ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatBRL } from '@/lib/money';
import { cn } from '@/lib/utils';
import { Mestre59Diferenca } from './Mestre59Diferenca';
import {
  compararSetores, buscarSetoresSemGrupo, buscarResumoSetores,
  type ComparacaoSetor, type SetorSemGrupo, type SetorDoMestre,
} from '@/services/mestre/mestre.service';

interface Props { empresaId: string; mes: string }

/** Abaixo disto a diferença é arredondamento, não divergência. */
const TOLERANCIA = 0.01;

export function Mestre59Comparacao({ empresaId, mes }: Props) {
  const [linhas, setLinhas]     = useState<ComparacaoSetor[]>([]);
  const [orfaos, setOrfaos]     = useState<SetorSemGrupo[]>([]);
  const [porSetor, setPorSetor] = useState<SetorDoMestre[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro]         = useState<string | null>(null);
  /* Um detalhe aberto por vez: dois painéis longos abertos juntos empurram
     para fora da tela a tabela que dá o contexto. */
  const [aberto, setAberto]     = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true); setErro(null);
    try {
      const [c, o, s] = await Promise.all([
        compararSetores(empresaId, mes),
        buscarSetoresSemGrupo(empresaId, mes),
        buscarResumoSetores(empresaId, mes),
      ]);
      setLinhas(c); setOrfaos(o); setPorSetor(s);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Falha ao comparar.');
    } finally {
      setCarregando(false);
    }
  }, [empresaId, mes]);

  useEffect(() => { void carregar(); }, [carregar]);

  const vinculadas = useMemo(() => linhas.filter(l => l.estado === 'vinculado'), [linhas]);
  const semSetor   = useMemo(() => linhas.filter(l => l.estado !== 'vinculado'), [linhas]);

  const soma = useMemo(() => ({
    mestreVinc:  vinculadas.reduce((s, l) => s + l.mestre_total, 0),
    integral:    vinculadas.reduce((s, l) => s + l.mestre_contribuido, 0),
    comparavel:  vinculadas.reduce((s, l) => s + l.mestre_comparavel, 0),
    sistemaVinc: vinculadas.reduce((s, l) => s + l.sistema_total, 0),
    ajustes:     vinculadas.reduce((s, l) => s + l.sistema_ajustes, 0),
    diferenca:   vinculadas.reduce((s, l) => s + l.diferenca, 0),
    semVinculo:  semSetor.reduce((s, l) => s + l.mestre_total, 0),
    batem:       vinculadas.filter(l => Math.abs(l.diferenca) < TOLERANCIA).length,
    total:       vinculadas.length,
    orfaoValor:  orfaos.reduce((s, o) => s + o.sistema_total, 0),
  }), [vinculadas, semSetor, orfaos]);

  return (
    <div className="space-y-4">

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-primary/10 border border-primary/20">
            <Scale className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">Mestre × sistema, em {mes}</h3>
            <p className="text-[11px] text-muted-foreground">
              Os dois lados só de leitura. Nada é gravado ao comparar.
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="rounded-xl h-9"
          onClick={() => void carregar()} disabled={carregando}>
          <RefreshCw className={cn('w-3.5 h-3.5 mr-1.5', carregando && 'animate-spin')} />
          Recomparar
        </Button>
      </div>

      {erro && (
        <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-sm text-destructive">
          {erro}
        </div>
      )}

      {carregando ? (
        <div className="space-y-2">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>
      ) : linhas.length === 0 ? (
        <div className="rounded-2xl border border-border/40 bg-card/95 px-5 py-10 text-center text-sm text-muted-foreground">
          Nenhuma carga do 59 em {mes}. Importe o relatório na aba de vínculos.
        </div>
      ) : (
        <>
          {/* Os quatro números na MESMA ordem das colunas da tabela. Ler o topo
              e ler uma linha tem de ser o mesmo gesto. */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Tile rotulo="Mestre (vinculados)" valor={formatBRL(soma.mestreVinc)}
              sub={`${soma.total} carteira(s) com setor`} />
            <Tile rotulo="Comparável" valor={formatBRL(soma.comparavel)}
              sub={soma.integral > 0
                ? `sem ${formatBRL(soma.integral)} de Integral`
                : 'sem Integral a descontar'} />
            <Tile rotulo="Sistema" valor={formatBRL(soma.sistemaVinc)}
              sub={soma.ajustes !== 0
                ? `analítico + ${formatBRL(soma.ajustes)} de ajuste`
                : 'analitico_recebimentos'} />
            <Tile rotulo="Diferença" valor={formatBRL(soma.diferenca)}
              sub={`${soma.batem} de ${soma.total} batem ao centavo`}
              tom={Math.abs(soma.diferenca) < TOLERANCIA ? 'ok' : 'alerta'} />
          </div>

          {/* ── Total por SETOR ──────────────────────────────────────────────
              Ele existe porque o total de um setor deixou de ser a soma dos
              grupos ligados a ele: uma equipe movida sai de um e entra em
              outro, e o destino pode ser um setor sem grupo nenhum. Sem esta
              tabela, o dinheiro movido não teria onde aparecer. */}
          {porSetor.some(s => s.recebido_movido !== 0) && (
            <div className="rounded-2xl border border-chart-4/30 bg-chart-4/5 overflow-hidden">
              <div className="px-5 py-3 border-b border-chart-4/20">
                <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <ArrowLeftRight className="w-4 h-4 text-chart-4" />
                  Total por setor, com as equipes movidas
                </h4>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Equipe movida sai do grupo de origem e entra aqui. As linhas não mudaram
                  de lugar no relatório — mudou onde elas contam.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-chart-4/20">
                      <th className="text-left font-semibold px-5 py-2">Setor</th>
                      <th className="text-right font-semibold px-3 py-2">Dos grupos</th>
                      <th className="text-right font-semibold px-3 py-2">Movido para cá</th>
                      <th className="text-right font-semibold px-3 py-2">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {porSetor.map(s => (
                      <tr key={s.setor_id} className="border-b border-chart-4/10 last:border-0">
                        <td className="px-5 py-2 font-medium text-foreground">
                          {s.setor_nome}
                          {s.grupos === 0 && (
                            <span className="text-[11px] text-muted-foreground ml-1.5">
                              (sem grupo no relatório)
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                          {formatBRL(s.dos_grupos)}
                        </td>
                        <td className={cn('px-3 py-2 text-right tabular-nums',
                          s.recebido_movido > 0 ? 'text-chart-4 font-medium' : 'text-muted-foreground/50')}>
                          {s.recebido_movido > 0 ? `+${formatBRL(s.recebido_movido)}` : '—'}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold text-foreground">
                          {formatBRL(s.total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── As carteiras com setor ──────────────────────────────────────── */}
          <div className="rounded-2xl border border-border/40 bg-card/95 shadow-sm overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/40">
                  <th className="text-left font-semibold px-5 py-2.5">Grupo do relatório</th>
                  <th className="text-left font-semibold px-3 py-2.5">Setor</th>
                  <th className="text-right font-semibold px-3 py-2.5">Mestre</th>
                  <th className="text-right font-semibold px-3 py-2.5">− Integral</th>
                  <th className="text-right font-semibold px-3 py-2.5">Comparável</th>
                  <th className="text-right font-semibold px-3 py-2.5">Sistema</th>
                  <th className="text-right font-semibold px-3 py-2.5">Diferença</th>
                </tr>
              </thead>
              <tbody>
                {vinculadas.map(l => {
                  const bate = Math.abs(l.diferenca) < TOLERANCIA;
                  const abertoAqui = aberto !== null && aberto === l.setor_id;
                  return (
                    <Fragment key={l.cod_grupo_filtro}>
                      <tr className={cn('border-b border-border/25', abertoAqui && 'bg-muted/30')}>
                        <td className="px-5 py-2.5">
                          <span className="inline-flex items-center gap-2">
                            <span className="font-mono text-[11px] font-bold px-1.5 py-0.5 rounded bg-primary/10 text-primary tabular-nums">
                              {l.cod_grupo_filtro}
                            </span>
                            <span className="font-medium text-foreground">{l.rotulo || '—'}</span>
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="text-foreground text-xs">{l.setor_nome}</span>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                          {formatBRL(l.mestre_total)}
                        </td>
                        {/* A coluna que faltava. Sem ela a subtração não fecha
                            na horizontal e a tabela parece quebrada. */}
                        <td className={cn('px-3 py-2.5 text-right tabular-nums',
                          l.mestre_contribuido > 0 ? 'text-chart-4' : 'text-muted-foreground/40')}>
                          {l.mestre_contribuido > 0 ? `−${formatBRL(l.mestre_contribuido)}` : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-foreground">
                          {formatBRL(l.mestre_comparavel)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                          {formatBRL(l.sistema_total)}
                          {l.sistema_ajustes !== 0 && (
                            <span className="block text-[10px] text-muted-foreground/70">
                              inclui {formatBRL(l.sistema_ajustes)} de ajuste
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => setAberto(abertoAqui ? null : l.setor_id)}
                            title="Ver onde está cada centavo"
                            className={cn(
                              'inline-flex items-center gap-1 rounded px-1.5 py-0.5 tabular-nums font-semibold transition-colors hover:bg-muted/60',
                              bate ? 'text-success' : l.diferenca < 0 ? 'text-destructive' : 'text-warning')}
                          >
                            {bate ? 'R$ 0,00' : `${l.diferenca > 0 ? '+' : ''}${formatBRL(l.diferenca)}`}
                            <ChevronDown className={cn('w-3 h-3 transition-transform', abertoAqui && 'rotate-180')} />
                          </button>
                        </td>
                      </tr>
                      {abertoAqui && l.setor_id && (
                        <tr>
                          <td colSpan={7} className="p-0">
                            <Mestre59Diferenca empresaId={empresaId} mes={mes} setorId={l.setor_id} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="text-[11px] text-muted-foreground">
            <span className="font-medium text-foreground">Mestre − Integral = Comparável</span>, e a
            diferença é <span className="font-medium text-foreground">Comparável − Sistema</span>. O
            Integral sai porque conta no 59 dos dois lados por rateio, e o analítico só tem a perna
            de quem cobrou. <span className="text-warning font-medium">Positivo</span> = o mestre tem
            mais; normal enquanto o setor não importa o 58 do dia.{' '}
            <span className="text-destructive font-medium">Negativo</span> = o sistema tem mais do que
            o relatório mostra — esse merece olhar. Clique na diferença para ver onde está cada centavo.
          </p>

          {/* ── As carteiras sem setor ─────────────────────────────────────── */}
          {semSetor.length > 0 && (
            <div className="rounded-2xl border border-warning/30 bg-card/95 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-warning/20 flex items-start gap-2">
                <Link2Off className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-bold text-foreground">
                    {formatBRL(soma.semVinculo)} em carteira sem setor
                  </h4>
                  <p className="text-[11px] text-muted-foreground">
                    Aqui o sistema é zero por definição: não há setor de onde ler o analítico. Não é
                    divergência, é vínculo faltando — dê o código do setor na aba <em>Códigos</em>.
                    Fora da comparação de propósito.
                  </p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <tbody>
                    {semSetor.map(l => (
                      <tr key={l.cod_grupo_filtro} className="border-b border-warning/10 last:border-0">
                        <td className="px-5 py-2">
                          <span className="inline-flex items-center gap-2">
                            <span className="font-mono text-[11px] font-bold px-1.5 py-0.5 rounded bg-warning/10 text-warning tabular-nums">
                              {l.cod_grupo_filtro}
                            </span>
                            <span className="text-xs text-foreground">{l.rotulo || '—'}</span>
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          {l.estado === 'ignorado' ? (
                            <Badge variant="outline" className="text-[10px] text-muted-foreground">ignorado</Badge>
                          ) : (
                            <span className="text-[11px] text-warning">sem vínculo</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold text-foreground">
                          {formatBRL(l.mestre_total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {orfaos.length > 0 && (
            <div className="rounded-2xl border border-warning/30 bg-warning/5 overflow-hidden">
              <div className="px-5 py-3 border-b border-warning/20 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-warning shrink-0" />
                <div>
                  <h4 className="text-sm font-bold text-foreground">
                    {formatBRL(soma.orfaoValor)} no sistema sem grupo do 59 apontando
                  </h4>
                  <p className="text-[11px] text-muted-foreground">
                    Setor com dinheiro em {mes} que nenhum grupo vinculado cobre. Ou falta vínculo,
                    ou o relatório não traz esse setor.
                  </p>
                </div>
              </div>
              <ul className="divide-y divide-warning/15">
                {orfaos.map(o => (
                  <li key={o.setor_id} className="px-5 py-2 flex items-center gap-3 text-xs">
                    <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
                    <span className="font-medium text-foreground">{o.setor_nome}</span>
                    <span className="text-muted-foreground tabular-nums">
                      {o.sistema_linhas.toLocaleString('pt-BR')} linhas
                    </span>
                    <span className="ml-auto tabular-nums font-semibold text-foreground">
                      {formatBRL(o.sistema_total)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Tile({ rotulo, valor, sub, tom }: {
  rotulo: string; valor: string; sub: string; tom?: 'ok' | 'alerta';
}) {
  return (
    <div className={cn('rounded-xl border px-3.5 py-2.5',
      tom === 'alerta' ? 'border-warning/40 bg-warning/5'
        : tom === 'ok' ? 'border-success/30 bg-success/5'
        : 'border-border/40 bg-background/50')}>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{rotulo}</p>
      <p className={cn('text-base font-bold tabular-nums mt-0.5',
        tom === 'alerta' ? 'text-warning' : tom === 'ok' ? 'text-success' : 'text-foreground')}>
        {valor}
      </p>
      <p className="text-[11px] text-muted-foreground">{sub}</p>
    </div>
  );
}

export default Mestre59Comparacao;
