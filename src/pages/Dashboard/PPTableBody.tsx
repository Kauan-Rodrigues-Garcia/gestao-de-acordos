import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import {
  CalendarClock, CheckCircle, Edit, FileX, Link2, MapPin, Plus, Trash2, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  formatCurrency, formatDate, STATUS_COLORS, STATUS_LABELS,
  STATUS_LABELS_PAGUEPLAY, TIPO_COLORS, TIPO_LABELS, TIPO_LABELS_PAGUEPLAY,
  getEstadoFromAcordo, extractLinkAcordo, isAtrasado,
} from '@/lib/index';
import { acordoTemCpf } from '@/lib/cpf';
import { AvisoCpfAcordo } from '@/components/AvisoCpfAcordo';
import { CodigoAcordoCopiavel } from '@/components/CodigoAcordoCopiavel';
import { VinculoTag } from '@/components/VinculoTag';
import { AcordoTags } from '@/components/AcordoTags';
import { OperadorCell } from '@/components/OperadorCell';
import { AcordoEditInline } from '@/components/AcordoEditInline';
import { AcordoDetalheInline } from '@/components/AcordoDetalheInline';
import { AcordoNovoInline } from '@/components/AcordoNovoInline';
import type { Acordo } from '@/lib/supabase';
import type { AcordoComVinculo } from '@/lib/deduplicarVinculados';
import { ensureAbsoluteUrl, TIPOS_PARCELADOS_PP } from './helpers';

interface Tag { id: string; nome: string; cor: string; }

interface PPTableBodyProps {
  acordos: AcordoComVinculo[];
  acordosOrdenados: AcordoComVinculo[];
  novoInlineAbertoTabela: boolean;
  setNovoInlineAbertoTabela: (v: boolean) => void;
  isPP: boolean;
  visaoAmpla: boolean;
  podeEditar: boolean;
  podeExcluir: boolean;
  addAcordo: (a: Acordo) => void;
  patchAcordo: (id: string, data: Partial<Acordo>) => void;
  editandoInlineIdTabela: string | null;
  setEditandoInlineIdTabela: (id: string | null) => void;
  detalheInlineIdTabela: string | null;
  setDetalheInlineIdTabela: (id: string | null) => void;
  highlightedId: string | null;
  hoje: string;
  selecionados: string[];
  toggleSelecionado: (id: string) => void;
  atualizandoStatus: string | null;
  marcarComoPago: (a: AcordoComVinculo) => void;
  gruposJaReagendados: Set<string>;
  setReagendarAcordo: (a: AcordoComVinculo | null) => void;
  excluindoId: string | null;
  setConfirmandoExclusao: (a: Acordo | null) => void;
  empresaTags: Tag[];
  operadoresMap: Record<string, string>;
  temFiltros: boolean;
  limparFiltros: () => void;
}

export function PPTableBody({
  acordos, acordosOrdenados,
  novoInlineAbertoTabela, setNovoInlineAbertoTabela,
  isPP, visaoAmpla,
  podeEditar, podeExcluir,
  addAcordo, patchAcordo,
  editandoInlineIdTabela, setEditandoInlineIdTabela,
  detalheInlineIdTabela, setDetalheInlineIdTabela,
  highlightedId, hoje,
  selecionados, toggleSelecionado,
  atualizandoStatus, marcarComoPago,
  gruposJaReagendados, setReagendarAcordo,
  excluindoId, setConfirmandoExclusao,
  empresaTags, operadoresMap,
  temFiltros, limparFiltros,
}: PPTableBodyProps) {
  const colSpan = visaoAmpla ? 11 : 10;

  return (
    <tbody>
      {novoInlineAbertoTabela && (
        <AcordoNovoInline
          isPaguePlay={isPP}
          colSpan={colSpan}
          onSaved={(inserido) => {
            setNovoInlineAbertoTabela(false);
            addAcordo(inserido);
          }}
          onCancel={() => setNovoInlineAbertoTabela(false)}
        />
      )}
      {acordos.length === 0 ? (
        <tr>
          <td colSpan={colSpan} className="px-4 py-14 text-center">
            <div className="flex flex-col items-center gap-3 text-muted-foreground">
              <div className="w-12 h-12 rounded-2xl bg-muted/60 flex items-center justify-center">
                <FileX className="w-6 h-6 opacity-40" />
              </div>
              <div>
                <p className="font-medium text-sm text-foreground/70">Nenhum acordo encontrado</p>
                <p className="text-xs text-muted-foreground/60 mt-0.5">
                  {temFiltros ? 'Tente ajustar os filtros aplicados' : 'Comece cadastrando um novo acordo'}
                </p>
              </div>
              {temFiltros ? (
                <Button size="sm" variant="ghost" className="h-8 text-xs gap-1.5 mt-1" onClick={limparFiltros}>
                  <X className="w-3.5 h-3.5" /> Limpar filtros
                </Button>
              ) : (
                <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 mt-1" onClick={() => setNovoInlineAbertoTabela(true)}>
                  <Plus className="w-3.5 h-3.5" /> Novo Acordo
                </Button>
              )}
            </div>
          </td>
        </tr>
      ) : acordosOrdenados.map((a, i) => {
        const atrasado = isAtrasado(a.vencimento, a.status);
        const venceHoje = a.vencimento === hoje;
        const sel = selecionados.includes(a.id);
        const isEditingThis = editandoInlineIdTabela === a.id;
        const isDetailThis = detalheInlineIdTabela === a.id;
        /** Acordo com CPF: vem no topo da lista e fica em vermelho até ser corrigido. */
        const temCpf = acordoTemCpf(a);
        return (
          <>
            <motion.tr
              key={a.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: Math.min(i * 0.015, 0.3) }}
              className={cn(
                'border-b border-border/50 hover:bg-accent/40 transition-colors cursor-pointer',
                i % 2 === 0 && 'bg-muted/10',
                atrasado && 'bg-destructive/5',
                venceHoje && a.status !== 'pago' && 'bg-warning/10 border-l-2 border-l-warning',
                sel && 'bg-primary/5 border-primary/20',
                isEditingThis && 'bg-primary/5',
                isDetailThis && 'bg-accent/50',
                highlightedId === a.id && 'bg-primary/20 border-l-4 border-l-primary',
                // Por último: vence os demais estados. Um acordo com CPF em
                // atraso continua vermelho de CPF, que é o que urge resolver.
                temCpf && 'bg-destructive/15 border-l-4 border-l-destructive hover:bg-destructive/20',
              )}
              onClick={(e) => {
                const t = e.target as HTMLElement;
                if (t.closest('button') || t.closest('a') || t.closest('input')) return;
                if (!isEditingThis) setDetalheInlineIdTabela(detalheInlineIdTabela === a.id ? null : a.id);
              }}
            >
              <td className="px-3 py-2.5">
                <input
                  type="checkbox"
                  className="rounded border-border"
                  checked={sel}
                  onChange={() => toggleSelecionado(a.id)}
                />
              </td>
              <td className="px-3 py-2.5">
                <div>
                  <CodigoAcordoCopiavel codigo={a.instituicao} label="Código" />
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    <p className="font-medium text-foreground leading-none text-[10px] text-muted-foreground font-mono">{a.nome_cliente}</p>
                    <AcordoTags tagIds={a.tag_ids} tags={empresaTags} />
                    <VinculoTag acordo={a} />
                  </div>
                </div>
              </td>
              <td className="px-3 py-2.5">
                {getEstadoFromAcordo(a) ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                    <MapPin className="w-2.5 h-2.5" />{getEstadoFromAcordo(a)}
                  </span>
                ) : '—'}
              </td>
              <td className="px-3 py-2.5">
                <span className={cn('font-mono text-[11px]', atrasado && 'text-destructive font-semibold', venceHoje && a.status !== 'pago' && 'text-warning font-semibold')}>
                  {formatDate(a.vencimento)}
                </span>
              </td>
              <td className="px-3 py-2.5 text-right font-mono font-semibold text-foreground">
                {formatCurrency(a.valor)}
              </td>
              <td className="px-3 py-2.5">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={cn('inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium border', TIPO_COLORS[a.tipo])}>
                    {TIPO_LABELS_PAGUEPLAY[a.tipo] || TIPO_LABELS[a.tipo]}
                  </span>
                  {(a.parcelas ?? 1) > 1 && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-primary/10 text-primary border border-primary/20 tabular-nums tracking-tight">
                      {a.numero_parcela ?? 1}/{a.parcelas}
                    </span>
                  )}
                </div>
              </td>
              <td className="px-3 py-2.5 max-w-[120px]">
                {extractLinkAcordo(a.observacoes) ? (
                  <a
                    href={ensureAbsoluteUrl(extractLinkAcordo(a.observacoes)!)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline truncate max-w-[100px]"
                    title={extractLinkAcordo(a.observacoes)!}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Link2 className="w-2.5 h-2.5 flex-shrink-0" />
                    <span className="truncate">ver link</span>
                  </a>
                ) : '—'}
              </td>
              <td className="px-3 py-2.5">
                <span className={cn('inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium border', STATUS_COLORS[a.status])}>
                  {STATUS_LABELS_PAGUEPLAY[a.status] || STATUS_LABELS[a.status]}
                </span>
              </td>
              {visaoAmpla && (
                <td className="px-3 py-2.5 text-xs text-muted-foreground truncate max-w-[140px]">
                  <OperadorCell acordo={a} operadoresMap={operadoresMap} />
                </td>
              )}
              <td className="px-3 py-2.5">
                <div className="flex items-center justify-end gap-0.5">
                  {a.status !== 'pago' && (
                    <Button
                      variant="ghost" size="icon" className="w-8 h-8 text-success hover:bg-success/10"
                      title="Marcar como Pago"
                      aria-label={`Marcar acordo de ${a.nome_cliente || a.instituicao || a.nr_cliente} como Pago`}
                      disabled={atualizandoStatus === a.id}
                      onClick={() => marcarComoPago(a)}
                    >
                      <CheckCircle className="w-4 h-4" />
                    </Button>
                  )}
                  {a.status === 'pago' && (a.parcelas ?? 1) > 1 && (a.numero_parcela ?? 1) < (a.parcelas ?? 1) && TIPOS_PARCELADOS_PP.includes(a.tipo) && !gruposJaReagendados.has(a.acordo_grupo_id ?? '') && (
                    <Button
                      variant="ghost" size="icon" className="w-8 h-8 text-primary hover:bg-primary/10"
                      title={`Reagendar parcela ${(a.numero_parcela ?? 1) + 1}/${a.parcelas}`}
                      aria-label={`Reagendar próxima parcela do acordo ${a.nome_cliente || a.instituicao}`}
                      onClick={() => setReagendarAcordo(a)}
                    >
                      <CalendarClock className="w-4 h-4" />
                    </Button>
                  )}
                  {podeEditar && (
                  <Button
                    variant="ghost" size="icon"
                    className={cn('w-8 h-8', isEditingThis && 'bg-primary/10 text-primary')}
                    title={isEditingThis ? 'Fechar editor' : 'Editar'}
                    aria-label={isEditingThis ? 'Fechar editor inline' : `Editar acordo de ${a.nome_cliente || a.instituicao}`}
                    onClick={() => setEditandoInlineIdTabela(isEditingThis ? null : a.id)}
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  )}
                  {podeExcluir && (
                  <>
                  <span className="w-px h-5 bg-border mx-1 shrink-0" aria-hidden="true" />
                  <Button
                    variant="ghost" size="icon"
                    className="w-8 h-8 text-destructive/60 hover:text-destructive hover:bg-destructive/10"
                    title="Excluir acordo"
                    aria-label={`Excluir acordo de ${a.nome_cliente || a.instituicao}`}
                    disabled={excluindoId === a.id}
                    onClick={() => setConfirmandoExclusao(a)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                  </>
                  )}
                </div>
              </td>
            </motion.tr>
            {temCpf && <AvisoCpfAcordo key={`cpf-${a.id}`} acordo={a} colSpan={colSpan} />}
            {isEditingThis && (
              <AcordoEditInline
                key={`inline-${a.id}`}
                acordo={a}
                isPaguePlay={isPP}
                onSaved={(atualizado) => {
                  setEditandoInlineIdTabela(null);
                  patchAcordo(atualizado.id, atualizado);
                }}
                onCancel={() => setEditandoInlineIdTabela(null)}
              />
            )}
            {isDetailThis && !isEditingThis && (
              <AcordoDetalheInline
                key={`detalhe-${a.id}`}
                acordo={a}
                isPaguePlay={isPP}
                colSpan={colSpan}
                onClose={() => setDetalheInlineIdTabela(null)}
                onSaved={(atualizado) => patchAcordo(atualizado.id, atualizado)}
              />
            )}
          </>
        );
      })}
    </tbody>
  );
}
