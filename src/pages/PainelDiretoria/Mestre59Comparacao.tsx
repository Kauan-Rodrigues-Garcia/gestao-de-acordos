/**
 * Mestre59Comparacao — o mestre contra o que o sistema tem hoje.
 *
 * É a tela que responde «dá para trocar de fonte?» ANTES de trocar. Hoje ela
 * não existe: a divergência aparece semanas depois, num card de meta, sem forma
 * de saber de onde veio.
 *
 * Os dois lados são só LEITURA. `analitico_recebimentos` é lido e nunca escrito;
 * o mestre também não muda. Rodar isto não altera número nenhum.
 *
 * ## Os dois lados usam a mesma régua
 *
 * A conferência de agosto/2026 mostrou que a divergência inteira dos quatro
 * setores vinculados — R$ 190.791,11 — não era erro de importação: eram três
 * recortes diferentes sendo somados como se fossem o mesmo número. Desde então:
 *
 *   colchão fora da meta   sai dos DOIS. O 58 guarda essas linhas em
 *                          `analitico_colchao_fora_meta` e não as soma em meta
 *                          nenhuma; o 59 agora faz igual.
 *   integral do receptivo  sai da conta principal e ganha coluna própria. No
 *                          sistema ele não vem de importação — é digitado no
 *                          card Contribuição Receptivo. Comparado junto, um
 *                          erro de digitação virava buraco de importação.
 *   ajuste manual          entra do lado do SISTEMA. É por onde o recebimento
 *                          de quem trocou de carteira no meio do mês volta ao
 *                          setor certo; o 59 já acerta isso sozinho, pelo grupo
 *                          que cobrou a linha.
 *
 * ## Como ler a diferença
 *
 * `mestre comparável − sistema`, e o sinal diz o que aconteceu:
 *
 *   positivo  o mestre tem MAIS. Normal enquanto o setor não importar o 58 do
 *             dia. Depois do mês fechado, merece olhar.
 *   negativo  o sistema tem MAIS que o relatório mostra. Este merece olhar
 *             sempre: é dinheiro no banco que o arquivo não repõe.
 *
 * Um grupo sem vínculo aparece com o sistema zerado — não é divergência, é
 * vínculo faltando, e a linha diz isso em vez de mostrar um número assustador.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  RefreshCw, Scale, AlertTriangle, Link2Off, ArrowRight, ArrowLeftRight, Calculator, Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatBRL } from '@/lib/money';
import { cn } from '@/lib/utils';
import {
  compararSetores, buscarSetoresSemGrupo, buscarResumoSetores, buscarEmprestados,
  type ComparacaoSetor, type SetorSemGrupo, type SetorDoMestre, type OperadorEmprestado,
} from '@/services/mestre/mestre.service';

interface Props { empresaId: string; mes: string }

/** Abaixo disto a diferença é arredondamento, não divergência. */
const TOLERANCIA = 0.01;

export function Mestre59Comparacao({ empresaId, mes }: Props) {
  const [linhas, setLinhas]     = useState<ComparacaoSetor[]>([]);
  const [orfaos, setOrfaos]     = useState<SetorSemGrupo[]>([]);
  const [porSetor, setPorSetor] = useState<SetorDoMestre[]>([]);
  const [emprestados, setEmprestados] = useState<OperadorEmprestado[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro]         = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true); setErro(null);
    try {
      const [c, o, s, e] = await Promise.all([
        compararSetores(empresaId, mes),
        buscarSetoresSemGrupo(empresaId, mes),
        buscarResumoSetores(empresaId, mes),
        buscarEmprestados(empresaId, mes),
      ]);
      setLinhas(c); setOrfaos(o); setPorSetor(s); setEmprestados(e);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Falha ao comparar.');
    } finally {
      setCarregando(false);
    }
  }, [empresaId, mes]);

  useEffect(() => { void carregar(); }, [carregar]);

  const soma = useMemo(() => {
    const vinculados = linhas.filter(l => l.estado === 'vinculado');
    return {
      mestreTudo:  linhas.reduce((s, l) => s + l.mestre_total, 0),
      // O comparável, não o total: o integral do receptivo tem conta separada.
      mestreVinc:  vinculados.reduce((s, l) => s + l.mestre_comparavel, 0),
      sistemaVinc: vinculados.reduce((s, l) => s + l.sistema_total, 0),
      ajustes:     vinculados.reduce((s, l) => s + l.sistema_ajustes, 0),
      colchaoFora: vinculados.reduce((s, l) => s + l.mestre_colchao_fora, 0),
      integral59:  vinculados.reduce((s, l) => s + l.mestre_contribuido, 0),
      integralSis: vinculados.reduce((s, l) => s + l.sistema_contrib_receptivo, 0),
      semVinculo:  linhas.filter(l => l.estado === 'novo').reduce((s, l) => s + l.mestre_comparavel, 0),
      batem:       vinculados.filter(l => Math.abs(l.diferenca) < TOLERANCIA).length,
      total:       vinculados.length,
      orfaoValor:  orfaos.reduce((s, o) => s + o.sistema_total, 0),
    };
  }, [linhas, orfaos]);

  /** Grupos onde o 59 e o card Contribuição Receptivo não dizem o mesmo. */
  const integralDivergente = useMemo(
    () => linhas.filter(l =>
      l.estado === 'vinculado'
      && (l.mestre_contribuido > 0 || l.sistema_contrib_receptivo > 0)
      && Math.abs(l.mestre_contribuido - l.sistema_contrib_receptivo) >= TOLERANCIA),
    [linhas],
  );

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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Tile rotulo="Mestre comparável" valor={formatBRL(soma.mestreVinc)}
              sub={soma.colchaoFora > 0
                ? `${soma.total} grupo(s) · sem ${formatBRL(soma.colchaoFora)} de colchão`
                : `${soma.total} grupo(s)`} />
            <Tile rotulo="Sistema (mesmos setores)" valor={formatBRL(soma.sistemaVinc)}
              sub={soma.ajustes !== 0
                ? `analítico + ${formatBRL(soma.ajustes)} de ajuste manual`
                : 'analitico_recebimentos'} />
            <Tile rotulo="Diferença" valor={formatBRL(soma.mestreVinc - soma.sistemaVinc)}
              sub={`${soma.batem} de ${soma.total} batem ao centavo`}
              tom={Math.abs(soma.mestreVinc - soma.sistemaVinc) < TOLERANCIA ? 'ok' : 'alerta'} />
            <Tile rotulo="Mestre sem vínculo" valor={formatBRL(soma.semVinculo)}
              sub="fora da comparação" tom={soma.semVinculo > 0 ? 'alerta' : undefined} />
          </div>

          {/* ── O integral do receptivo, na sua própria conta ─────────────────
              Ele não entra na comparação de cima porque no sistema não vem de
              importação: alguém digita no card Contribuição Receptivo. Aqui as
              duas fontes ficam lado a lado, que é o único jeito de descobrir um
              erro de digitação sem confundi-lo com falha de importação. */}
          {(soma.integral59 > 0 || soma.integralSis > 0) && (
            <div className={cn('rounded-2xl border overflow-hidden',
              integralDivergente.length > 0
                ? 'border-warning/30 bg-warning/5' : 'border-success/25 bg-success/5')}>
              <div className="px-5 py-3 border-b border-border/20">
                <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Calculator className="w-4 h-4 text-muted-foreground" />
                  Integral do receptivo: o que o 59 calcula × o que foi digitado
                </h4>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Fora da comparação principal de propósito — no sistema esse valor é
                  lançado à mão no card Contribuição Receptivo, e a diferença aqui é erro
                  de digitação, não de importação.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/20">
                      <th className="text-left font-semibold px-5 py-2">Setor</th>
                      <th className="text-right font-semibold px-3 py-2">O 59 calcula</th>
                      <th className="text-right font-semibold px-3 py-2">Card do sistema</th>
                      <th className="text-right font-semibold px-3 py-2">Diferença</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linhas
                      .filter(l => l.estado === 'vinculado'
                        && (l.mestre_contribuido > 0 || l.sistema_contrib_receptivo > 0))
                      .map(l => {
                        const d = l.mestre_contribuido - l.sistema_contrib_receptivo;
                        return (
                          <tr key={l.cod_grupo_filtro} className="border-b border-border/10 last:border-0">
                            <td className="px-5 py-2 font-medium text-foreground">{l.setor_nome}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-foreground">
                              {formatBRL(l.mestre_contribuido)}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                              {l.sistema_contrib_receptivo > 0
                                ? formatBRL(l.sistema_contrib_receptivo)
                                : <span className="text-warning">não lançado</span>}
                            </td>
                            <td className={cn('px-3 py-2 text-right tabular-nums font-semibold',
                              Math.abs(d) < TOLERANCIA ? 'text-success' : 'text-warning')}>
                              {Math.abs(d) < TOLERANCIA ? 'R$ 0,00' : `${d > 0 ? '+' : ''}${formatBRL(d)}`}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Quem cobrou carteira de outro setor ───────────────────────────
              A lista que o processo manual não tinha. Em agosto/2026 seis das
              sete pessoas do caso Play Mix → Play 5 foram lançadas à mão em
              31/08; a sétima só apareceu porque alguém foi conferir. Aqui o 59
              acha todas, e diz qual ainda não tem ajuste no destino. */}
          {emprestados.length > 0 && (
            <div className="rounded-2xl border border-border/40 bg-card/95 overflow-hidden">
              <div className="px-5 py-3 border-b border-border/30">
                <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Users className="w-4 h-4 text-muted-foreground" />
                  Cobraram carteira de outro setor
                </h4>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  O <span className="font-medium">NomeGrupoFiltro</span> do 59 é a carteira, não a
                  equipe de quem cobrou. O dinheiro conta para o setor da pessoa — o 59 já faz isso
                  sozinho; no sistema depende de alguém lançar o ajuste manual.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/30">
                      <th className="text-left font-semibold px-5 py-2">Pessoa</th>
                      <th className="text-left font-semibold px-3 py-2">Carteira</th>
                      <th className="text-left font-semibold px-3 py-2">Conta para</th>
                      <th className="text-right font-semibold px-3 py-2">Valor</th>
                      <th className="text-right font-semibold px-3 py-2">Ajuste no sistema</th>
                    </tr>
                  </thead>
                  <tbody>
                    {emprestados.map(e => {
                      const semAjuste = e.ajuste_valor === null;
                      return (
                        <tr key={`${e.cobradora}-${e.de_cod}`} className="border-b border-border/20 last:border-0">
                          <td className="px-5 py-2">
                            <span className="font-medium text-foreground">
                              {e.operador_nome ?? e.cobradora}
                            </span>
                            <span className="font-mono text-[10px] ml-1.5 px-1 rounded bg-muted text-muted-foreground">
                              {e.cobradora}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">{e.de_carteira}</td>
                          <td className="px-3 py-2 text-xs text-foreground">{e.para_setor ?? '—'}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-semibold text-foreground">
                            {formatBRL(e.valor)}
                          </td>
                          <td className={cn('px-3 py-2 text-right tabular-nums text-xs',
                            semAjuste ? 'text-warning font-semibold' : 'text-success')}>
                            {semAjuste ? 'não lançado' : formatBRL(e.ajuste_valor ?? 0)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {emprestados.some(e => e.ajuste_valor === null) && (
                <p className="px-5 py-2.5 text-[11px] text-warning border-t border-border/20">
                  {formatBRL(emprestados.filter(e => e.ajuste_valor === null)
                    .reduce((s, e) => s + e.valor, 0))} sem ajuste no sistema.
                  O 59 já conta no setor certo; o Painel Líder só vai contar quando o ajuste for lançado.
                </p>
              )}
            </div>
          )}

          {/* ── Total por SETOR ──────────────────────────────────────────────
              Ele existe porque o total de um setor deixou de ser a soma dos
              grupos ligados a ele: uma equipe movida sai de um e entra em
              outro, e o destino pode ser um setor sem grupo nenhum. Sem esta
              tabela, o dinheiro movido não teria onde aparecer. */}
          {porSetor.some(s => s.recebido_movido !== 0 || s.recebido_emprestado !== 0) && (
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
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-chart-4/20">
                      <th className="text-left font-semibold px-5 py-2">Setor</th>
                      <th className="text-right font-semibold px-3 py-2">Dos grupos</th>
                      <th className="text-right font-semibold px-3 py-2">Movido para cá</th>
                      <th className="text-right font-semibold px-3 py-2">Gente daqui cobrando fora</th>
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
                        <td className={cn('px-3 py-2 text-right tabular-nums',
                          s.recebido_emprestado > 0 ? 'text-chart-4 font-medium' : 'text-muted-foreground/50')}>
                          {s.recebido_emprestado > 0 ? `+${formatBRL(s.recebido_emprestado)}` : '—'}
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

          <div className="rounded-2xl border border-border/40 bg-card/95 shadow-sm overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/40">
                  <th className="text-left font-semibold px-5 py-2.5">Grupo do relatório</th>
                  <th className="text-left font-semibold px-3 py-2.5">Setor</th>
                  <th className="text-right font-semibold px-3 py-2.5">Mestre comparável</th>
                  <th className="text-right font-semibold px-3 py-2.5">Sistema</th>
                  <th className="text-right font-semibold px-3 py-2.5">Diferença</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map(l => {
                  const bate = l.estado === 'vinculado' && Math.abs(l.diferenca) < TOLERANCIA;
                  return (
                    <tr key={l.cod_grupo_filtro} className="border-b border-border/25">
                      <td className="px-5 py-2.5">
                        <span className="inline-flex items-center gap-2">
                          <span className="font-mono text-[11px] font-bold px-1.5 py-0.5 rounded bg-primary/10 text-primary tabular-nums">
                            {l.cod_grupo_filtro}
                          </span>
                          <span className="font-medium text-foreground">{l.rotulo || '—'}</span>
                        </span>
                        {/* O que foi posto de lado para os dois lados baterem.
                            Sem esta linha, quem somar o relatório bruto acha
                            que o número da tela está errado. */}
                        {(l.mestre_contribuido > 0 || l.mestre_colchao_fora > 0) && (
                          <span className="block text-[11px] text-muted-foreground mt-0.5">
                            fora daqui:
                            {l.mestre_contribuido > 0 &&
                              ` ${formatBRL(l.mestre_contribuido)} de integral do receptivo`}
                            {l.mestre_contribuido > 0 && l.mestre_colchao_fora > 0 && ' ·'}
                            {l.mestre_colchao_fora > 0 &&
                              ` ${formatBRL(l.mestre_colchao_fora)} de colchão fora da meta`}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        {l.estado === 'vinculado' ? (
                          <span className="text-foreground text-xs">{l.setor_nome}</span>
                        ) : l.estado === 'ignorado' ? (
                          <Badge variant="outline" className="text-[10px] text-muted-foreground">ignorado</Badge>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] text-warning">
                            <Link2Off className="w-3 h-3" /> sem vínculo
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-foreground">
                        {formatBRL(l.mestre_comparavel)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                        {l.estado === 'vinculado' ? (
                          <>
                            {formatBRL(l.sistema_total)}
                            {l.sistema_ajustes !== 0 && (
                              <span className="block text-[10px] text-chart-4">
                                {formatBRL(l.sistema_analitico)} {l.sistema_ajustes > 0 ? '+' : '−'}{' '}
                                {formatBRL(Math.abs(l.sistema_ajustes))} de ajuste
                              </span>
                            )}
                          </>
                        ) : '—'}
                      </td>
                      <td className={cn('px-3 py-2.5 text-right tabular-nums font-semibold',
                        l.estado !== 'vinculado' ? 'text-muted-foreground'
                          : bate ? 'text-success'
                          : l.diferenca < 0 ? 'text-destructive' : 'text-warning')}>
                        {l.estado !== 'vinculado' ? '—'
                          : bate ? 'R$ 0,00'
                          : `${l.diferenca > 0 ? '+' : ''}${formatBRL(l.diferenca)}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="text-[11px] text-muted-foreground">
            Os dois lados usam a mesma régua: sem o colchão fora da meta (que o 58 guarda em
            tabela separada), sem o integral do receptivo (que tem a conta acima) e com os
            ajustes manuais somados do lado do sistema.{' '}
            <span className="text-warning font-medium">Positivo</span> = o mestre tem mais; normal
            enquanto o setor não importa o 58 do dia.{' '}
            <span className="text-destructive font-medium">Negativo</span> = o sistema tem mais do
            que o relatório mostra — esse merece olhar sempre.
          </p>

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
