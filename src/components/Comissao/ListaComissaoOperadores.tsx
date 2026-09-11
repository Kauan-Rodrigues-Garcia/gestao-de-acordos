/**
 * ListaComissaoOperadores — a consulta da liderança: a comissão de cada operador no mês.
 *
 * Mês → Setor → Equipe → Operador são o navegador de mês e o seletor de setor da
 * tela de Metas, o filtro de equipe daqui e a linha. O clique abre a mesma
 * «Ver comissão» do Dashboard.
 *
 * O clone aparece com selo, sob a equipe em que foi clonado, e é calculado pelo
 * usuário ORIGINAL: configuração do setor e da equipe de origem, meta e recebido
 * dele. É o que `montarEntradaComissao` recebe como origem.
 */
import { useMemo, useState } from 'react';
import { ChevronRight, Layers } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { formatBRL } from '@/lib/money';
import type { ResumoOperadorAnalitico } from '@/services/analitico/analitico.service';
import { calcularComissao, type ConfigComissao, type ResultadoComissao } from '@/services/comissao/comissao';
import { montarEntradaComissao, type MetaLinhaBruta } from '@/services/comissao/entradaDoOperador';
import type { MapaRecebimentoIndireto } from '@/services/metas/recebimentoIndireto.service';
import { formatarPct } from './formato';
import { VerComissao } from './VerComissao';

export interface OperadorComissao {
  id: string;
  nome: string;
  /** Setor de origem — de onde vem a configuração. */
  setorOrigemId: string | null;
  /** Equipe de origem — a exceção que vale. */
  equipeOrigemId: string | null;
  /** A equipe em que a pessoa aparece neste setor (a do clone, quando clone). */
  equipeAquiId: string | null;
  /** Nome do setor de origem quando a pessoa é clone. */
  clonadoDe?: string | null;
}

interface ListaComissaoOperadoresProps {
  operadores: OperadorComissao[];
  equipes: { id: string; nome: string }[];
  metas: MetaLinhaBruta[];
  resumos: ResumoOperadorAnalitico[];
  indiretos: MapaRecebimentoIndireto;
  configs: ConfigComissao[];
  isPaguePlay: boolean;
  /** `yyyy-MM`. */
  mes: string;
  mesFechado: boolean;
  carregando: boolean;
}

function descricao(r: ResultadoComissao, falta: string): string {
  if (r.motivo === 'sem_meta') return 'Sem meta neste mês';
  if (r.motivo === 'sem_config') return 'Sem configuração neste mês';
  const proxima = r.proxima && r.proxima.falta !== null
    ? `${falta.toLowerCase()} ${formatBRL(r.proxima.falta)} p/ ${r.proxima.ordem}ª`
    : null;
  if (!r.atual) return proxima ? `Nenhuma faixa · ${proxima}` : 'Nenhuma faixa';
  return [`${r.atual.ordem}ª Meta · ${formatarPct(r.atual.pctEfetivo)}`, proxima].filter(Boolean).join(' · ');
}

export function ListaComissaoOperadores({
  operadores, equipes, metas, resumos, indiretos, configs, isPaguePlay, mes, mesFechado, carregando,
}: ListaComissaoOperadoresProps) {
  const [equipeFiltro, setEquipeFiltro] = useState('');
  const [aberto, setAberto] = useState<{ nome: string; resultado: ResultadoComissao } | null>(null);
  const falta = mesFechado ? 'Faltou' : 'Faltam';

  const linhas = useMemo(() => {
    const metaDe = new Map(
      metas.filter(m => m.tipo === 'operador' && m.referencia_id).map(m => [m.referencia_id as string, m]),
    );
    const resumoDe = new Map(resumos.map(r => [r.operador_id, r]));

    return operadores
      .map(op => {
        const resumo = resumoDe.get(op.id);
        const resultado = calcularComissao(montarEntradaComissao({
          meta: metaDe.get(op.id) ?? null,
          recebidoBruto: Number(resumo?.total_recebido) || 0,
          recebidoHO: Number(resumo?.total_ho) || 0,
          recebidoIndiretoBruto: indiretos[op.id]?.bruto ?? 0,
          isPaguePlay,
          configs,
          setorOrigemId: op.setorOrigemId,
          equipeOrigemId: op.equipeOrigemId,
        }));
        return { op, resultado };
      })
      .sort((a, b) => b.resultado.total - a.resultado.total
        || a.op.nome.localeCompare(b.op.nome, 'pt-BR'));
  }, [operadores, metas, resumos, indiretos, configs, isPaguePlay]);

  const visiveis = equipeFiltro ? linhas.filter(l => l.op.equipeAquiId === equipeFiltro) : linhas;

  return (
    <div className="space-y-2">
      {equipes.length > 0 && (
        <div className="flex items-center gap-2 border-b border-border pb-2">
          <Layers className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="shrink-0 text-xs text-muted-foreground">Equipe:</span>
          <Select value={equipeFiltro || '__todas__'} onValueChange={v => setEquipeFiltro(v === '__todas__' ? '' : v)}>
            <SelectTrigger className="h-8 w-48 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__todas__">Todas as equipes</SelectItem>
              {equipes.map(e => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      {carregando ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
      ) : visiveis.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          {operadores.length === 0 ? 'Nenhum operador neste setor.' : 'Nenhum operador nesta equipe.'}
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {visiveis.map(({ op, resultado }) => {
            const semFaixas = resultado.motivo === 'sem_meta' || resultado.motivo === 'sem_config';
            return (
              <li key={op.id}>
                <button
                  type="button"
                  disabled={semFaixas}
                  onClick={() => setAberto({ nome: op.nome, resultado })}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:hover:bg-transparent"
                >
                  <span className="flex min-w-0 flex-1 items-center gap-1.5">
                    <span className="truncate text-sm font-medium">{op.nome}</span>
                    {op.clonadoDe && (
                      <Badge variant="outline" className="shrink-0 text-[10px] font-normal">
                        {`clone · ${op.clonadoDe}`}
                      </Badge>
                    )}
                    {resultado.beneficioAtivo && !semFaixas && (
                      <span className="shrink-0 text-[10px] font-bold text-amber-700 dark:text-amber-300" title="Benefício do setor ativo">
                        ✦
                      </span>
                    )}
                  </span>
                  <span className="hidden truncate text-xs text-muted-foreground sm:inline">
                    {descricao(resultado, falta)}
                  </span>
                  <span className="shrink-0 font-mono text-sm font-semibold tabular-nums">
                    {semFaixas ? '—' : formatBRL(resultado.total)}
                  </span>
                  {!semFaixas && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {aberto && (
        <VerComissao
          aberto
          onFechar={() => setAberto(null)}
          nome={aberto.nome}
          mes={mes}
          isPaguePlay={isPaguePlay}
          mesFechado={mesFechado}
          resultado={aberto.resultado}
        />
      )}
    </div>
  );
}
