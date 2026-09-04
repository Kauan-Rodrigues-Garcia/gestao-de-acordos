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
 * ## Como ler a diferença
 *
 * `mestre − sistema`, e o sinal diz o que aconteceu:
 *
 *   positivo  o mestre tem MAIS. Normal enquanto o setor não importar o 58 do
 *             dia, ou quando o mestre traz a contribuição do receptivo que o
 *             sistema ainda guarda num campo digitado à mão.
 *   negativo  o sistema tem MAIS que o relatório mostra. Este merece olhar: é
 *             dinheiro no banco que o arquivo não repõe.
 *
 * Um grupo sem vínculo aparece com o sistema zerado — não é divergência, é
 * vínculo faltando, e a linha diz isso em vez de mostrar um número assustador.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Scale, AlertTriangle, Link2Off, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatBRL } from '@/lib/money';
import { cn } from '@/lib/utils';
import {
  compararSetores, buscarSetoresSemGrupo,
  type ComparacaoSetor, type SetorSemGrupo,
} from '@/services/mestre/mestre.service';

interface Props { empresaId: string; mes: string }

/** Abaixo disto a diferença é arredondamento, não divergência. */
const TOLERANCIA = 0.01;

export function Mestre59Comparacao({ empresaId, mes }: Props) {
  const [linhas, setLinhas]     = useState<ComparacaoSetor[]>([]);
  const [orfaos, setOrfaos]     = useState<SetorSemGrupo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro]         = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true); setErro(null);
    try {
      const [c, o] = await Promise.all([
        compararSetores(empresaId, mes),
        buscarSetoresSemGrupo(empresaId, mes),
      ]);
      setLinhas(c); setOrfaos(o);
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
      mestreVinc:  vinculados.reduce((s, l) => s + l.mestre_total, 0),
      sistemaVinc: vinculados.reduce((s, l) => s + l.sistema_total, 0),
      semVinculo:  linhas.filter(l => l.estado === 'novo').reduce((s, l) => s + l.mestre_total, 0),
      batem:       vinculados.filter(l => Math.abs(l.diferenca) < TOLERANCIA).length,
      total:       vinculados.length,
      orfaoValor:  orfaos.reduce((s, o) => s + o.sistema_total, 0),
    };
  }, [linhas, orfaos]);

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
            <Tile rotulo="Mestre (grupos vinculados)" valor={formatBRL(soma.mestreVinc)}
              sub={`${soma.total} grupo(s)`} />
            <Tile rotulo="Sistema (mesmos setores)" valor={formatBRL(soma.sistemaVinc)}
              sub="analitico_recebimentos" />
            <Tile rotulo="Diferença" valor={formatBRL(soma.mestreVinc - soma.sistemaVinc)}
              sub={`${soma.batem} de ${soma.total} batem ao centavo`}
              tom={Math.abs(soma.mestreVinc - soma.sistemaVinc) < TOLERANCIA ? 'ok' : 'alerta'} />
            <Tile rotulo="Mestre sem vínculo" valor={formatBRL(soma.semVinculo)}
              sub="fora da comparação" tom={soma.semVinculo > 0 ? 'alerta' : undefined} />
          </div>

          <div className="rounded-2xl border border-border/40 bg-card/95 shadow-sm overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/40">
                  <th className="text-left font-semibold px-5 py-2.5">Grupo do relatório</th>
                  <th className="text-left font-semibold px-3 py-2.5">Setor</th>
                  <th className="text-right font-semibold px-3 py-2.5">Mestre</th>
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
                        {l.mestre_contribuido > 0 && (
                          <span className="block text-[11px] text-muted-foreground mt-0.5">
                            {formatBRL(l.mestre_proprio)} próprio + {formatBRL(l.mestre_contribuido)} do receptivo
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
                        {formatBRL(l.mestre_total)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                        {l.estado === 'vinculado' ? formatBRL(l.sistema_total) : '—'}
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
            <span className="text-warning font-medium">Positivo</span> = o mestre tem mais; normal
            enquanto o setor não importa o 58 do dia, e esperado quando o mestre já traz a
            contribuição do receptivo. <span className="text-destructive font-medium">Negativo</span> =
            o sistema tem mais do que o relatório mostra — esse merece olhar.
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
