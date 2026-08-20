import { motion } from 'framer-motion';
import {
  CheckCircle, MessageSquare, Edit, Trash2,
  MapPin, Link2, FileX, Plus, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  STATUS_LABELS, STATUS_COLORS, TIPO_LABELS, TIPO_COLORS,
  formatCurrency, formatDate, isAtrasado,
  STATUS_LABELS_PAGUEPLAY, TIPO_LABELS_PAGUEPLAY,
  getEstadoFromAcordo, extractLinkAcordo,
} from '@/lib/index';
import { cn } from '@/lib/utils';
import { acordoTemCpf } from '@/lib/cpf';
import { AvisoCpfAcordo } from '@/components/AvisoCpfAcordo';
import { CodigoAcordoCopiavel } from '@/components/CodigoAcordoCopiavel';
import { AcordoNovoInline } from '@/components/AcordoNovoInline';
import { AcordoEditInline } from '@/components/AcordoEditInline';
import { AcordoDetalheInline } from '@/components/AcordoDetalheInline';
import { VinculoTag } from '@/components/VinculoTag';
import { AcordoTags } from '@/components/AcordoTags';
import { OperadorCell } from '@/components/OperadorCell';
import type { Acordo, AcordoTag } from '@/lib/supabase';
import type { AcordoComVinculo } from '@/lib/deduplicarVinculados';
import { ensureAbsoluteUrl } from './helpers';

export interface AcordosTableBodyProps {
  acordosParaExibir: AcordoComVinculo[];
  acordosCount: number;
  isPP: boolean;
  colSpanFull: number;
  mostrarColunaOperador: boolean;
  podeEditar: boolean;
  podeExcluir: boolean;
  novoInlineAberto: boolean;
  hoje: string;
  highlightedId: string | null;
  selecionados: string[];
  editandoInlineId: string | null;
  detalheInlineId: string | null;
  atualizandoStatus: string | null;
  excluindoId: string | null;
  operadoresMap: Record<string, string>;
  /** Definições de tag da empresa; `tag_ids` do acordo só guarda o id. */
  empresaTags: AcordoTag[];
  temFiltros: boolean;
  selecionarTodos: () => void;
  toggleSelecionado: (id: string) => void;
  setNovoInlineAberto: React.Dispatch<React.SetStateAction<boolean>>;
  addAcordo: (a: Acordo) => void;
  removeAcordo: (id: string) => void;
  patchAcordo: (id: string, data: Partial<Acordo>) => void;
  setEditandoInlineId: (id: string | null) => void;
  setDetalheInlineId: (id: string | null) => void;
  marcarComoPago: (a: Acordo) => void;
  enviarUmWhatsapp: (a: Acordo) => void;
  setConfirmandoExclusao: (a: Acordo | null) => void;
  limparFiltros: () => void;
}

export function AcordosTableBody({
  acordosParaExibir, acordosCount, isPP, colSpanFull, mostrarColunaOperador, podeEditar, podeExcluir, novoInlineAberto,
  hoje, highlightedId, selecionados, editandoInlineId, detalheInlineId,
  atualizandoStatus, excluindoId, operadoresMap, empresaTags, temFiltros,
  selecionarTodos, toggleSelecionado, setNovoInlineAberto,
  addAcordo, removeAcordo, patchAcordo,
  setEditandoInlineId, setDetalheInlineId,
  marcarComoPago, enviarUmWhatsapp, setConfirmandoExclusao,
  limparFiltros,
}: AcordosTableBodyProps) {
  return (
    <>
      <thead>
        <tr className="border-b border-border bg-muted/30">
          <th className="px-3 py-3 w-8">
            <input
              type="checkbox"
              className="rounded border-border"
              checked={selecionados.length === acordosCount && acordosCount > 0}
              onChange={selecionarTodos}
            />
          </th>
          {isPP ? (
            <>
              <th className="text-left px-3 py-3 font-semibold text-muted-foreground">NOME</th>
              <th className="text-left px-3 py-3 font-semibold text-muted-foreground">INSCRIÇÃO</th>
              <th className="text-right px-3 py-3 font-semibold text-muted-foreground">VALOR</th>
              <th className="text-left px-3 py-3 font-semibold text-muted-foreground">ESTADO</th>
              <th className="text-left px-3 py-3 font-semibold text-muted-foreground">PAGAMENTO</th>
              <th className="text-left px-3 py-3 font-semibold text-muted-foreground">LINK</th>
              <th className="text-left px-3 py-3 font-semibold text-muted-foreground">STATUS</th>
              {mostrarColunaOperador && <th className="text-left px-3 py-3 font-semibold text-muted-foreground">OPERADOR</th>}
            </>
          ) : (
            <>
              <th className="text-left px-3 py-3 font-semibold text-muted-foreground">NR</th>
              <th className="text-left px-3 py-3 font-semibold text-muted-foreground">CLIENTE</th>
              <th className="text-left px-3 py-3 font-semibold text-muted-foreground">VENCIMENTO</th>
              <th className="text-right px-3 py-3 font-semibold text-muted-foreground">VALOR</th>
              <th className="text-left px-3 py-3 font-semibold text-muted-foreground">TIPO</th>
              <th className="text-center px-3 py-3 font-semibold text-muted-foreground">PARCELAS</th>
              <th className="text-left px-3 py-3 font-semibold text-muted-foreground">STATUS</th>
              {mostrarColunaOperador && <th className="text-left px-3 py-3 font-semibold text-muted-foreground">OPERADOR</th>}
            </>
          )}
          <th className="text-right px-3 py-3 font-semibold text-muted-foreground">AÇÕES</th>
        </tr>
      </thead>
      <tbody>
        {novoInlineAberto && (
          <AcordoNovoInline
            isPaguePlay={isPP}
            colSpan={colSpanFull}
            onSaved={(inserido) => { setNovoInlineAberto(false); addAcordo(inserido); }}
            onCancel={() => setNovoInlineAberto(false)}
            onAcordoRemovido={(id) => removeAcordo(id)}
          />
        )}
        {acordosParaExibir.length === 0 ? (
          <tr>
            <td colSpan={colSpanFull} className="px-4 py-14 text-center">
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
                  <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 mt-1" onClick={() => setNovoInlineAberto(true)}>
                    <Plus className="w-3.5 h-3.5" /> Novo Acordo
                  </Button>
                )}
              </div>
            </td>
          </tr>
        ) : acordosParaExibir.map((a, i) => {
          const atrasado      = isAtrasado(a.vencimento, a.status);
          const venceHoje     = a.vencimento === hoje;
          const sel           = selecionados.includes(a.id);
          const isEditingThis = editandoInlineId === a.id;
          const isDetailThis  = detalheInlineId === a.id;
          /** Acordo com CPF: vem no topo da lista e fica em vermelho até ser corrigido. */
          const temCpf        = acordoTemCpf(a);
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
                  atrasado  && 'bg-destructive/5',
                  venceHoje && a.status !== 'pago' && 'bg-warning/5',
                  sel && 'bg-primary/5 border-primary/20',
                  isEditingThis && 'bg-primary/5',
                  isDetailThis  && 'bg-accent/50',
                  highlightedId === a.id && 'bg-primary/20 border-l-4 border-l-primary',
                  // Por último: vence os demais estados. Um acordo com CPF em
                  // atraso continua vermelho de CPF, que é o que urge resolver.
                  temCpf && 'bg-destructive/15 border-l-4 border-l-destructive hover:bg-destructive/20',
                )}
                onClick={(e) => {
                  const target = e.target as HTMLElement;
                  if (target.closest('button') || target.closest('a') || target.closest('input')) return;
                  if (!isEditingThis) setDetalheInlineId(detalheInlineId === a.id ? null : a.id);
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
                {isPP ? (
                  <>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="font-medium text-foreground leading-none">{a.nome_cliente}</p>
                        <AcordoTags tagIds={a.tag_ids} tags={empresaTags} />
                        <VinculoTag acordo={a} />
                      </div>
                    </td>
                    <td className="px-3 py-2.5 max-w-[140px]">
                      <CodigoAcordoCopiavel codigo={a.instituicao} label="Código" />
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-semibold text-foreground">
                      {formatCurrency(a.valor)}
                    </td>
                    <td className="px-3 py-2.5">
                      {getEstadoFromAcordo(a) ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                          <MapPin className="w-2.5 h-2.5" />{getEstadoFromAcordo(a)}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={cn('inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium border', TIPO_COLORS[a.tipo])}>
                        {TIPO_LABELS_PAGUEPLAY[a.tipo] || TIPO_LABELS[a.tipo]}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 max-w-[120px]">
                      {extractLinkAcordo(a.observacoes) ? (
                        <a
                          href={ensureAbsoluteUrl(extractLinkAcordo(a.observacoes)!)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline truncate max-w-[100px]"
                          title={extractLinkAcordo(a.observacoes)!}
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
                    {mostrarColunaOperador && (
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">
                        <OperadorCell acordo={a} operadoresMap={operadoresMap} />
                      </td>
                    )}
                  </>
                ) : (
                  <>
                    <td className="px-3 py-2.5">
                      <CodigoAcordoCopiavel codigo={a.nr_cliente} label="NR" />
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="font-medium text-foreground leading-none">{a.nome_cliente}</p>
                        <AcordoTags tagIds={a.tag_ids} tags={empresaTags} />
                        <VinculoTag acordo={a} />
                      </div>
                      {a.instituicao && (
                        <p className="text-[11px] text-muted-foreground/70 mt-0.5">{a.instituicao}</p>
                      )}
                      {a.whatsapp && (
                        <p className="font-mono text-muted-foreground/70 text-[10px] mt-0.5">{a.whatsapp}</p>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={cn('font-mono', atrasado && 'text-destructive font-semibold', venceHoje && 'text-warning font-semibold')}>
                        {formatDate(a.vencimento)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-semibold text-foreground">
                      {formatCurrency(a.valor)}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={cn('inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium border', TIPO_COLORS[a.tipo])}>
                        {TIPO_LABELS[a.tipo]}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center font-mono text-muted-foreground">
                      {['boleto', 'cartao_recorrente', 'pix_automatico'].includes(a.tipo) ? a.parcelas : '—'}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={cn('inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium border', STATUS_COLORS[a.status])}>
                        {STATUS_LABELS[a.status]}
                      </span>
                    </td>
                    {/* Mesma célula da PaguePlay: nome COMPLETO e, quando há
                        vínculo, o segundo operador na linha de baixo. Até
                        16/08/2026 aqui só saía o primeiro nome, o que tornava
                        indistinguíveis dois operadores homônimos. */}
                    {mostrarColunaOperador && (
                      <td className="px-3 py-2.5 text-muted-foreground text-[11px]">
                        <OperadorCell acordo={a} operadoresMap={operadoresMap} />
                      </td>
                    )}
                  </>
                )}
                <td className="px-3 py-2.5">
                  <div className="flex items-center justify-end gap-0.5">
                    {a.status !== 'pago' && (
                      <Button
                        variant="ghost" size="icon" className="w-8 h-8 text-success hover:bg-success/10"
                        title="Marcar como Pago"
                        disabled={atualizandoStatus === a.id}
                        onClick={() => marcarComoPago(a)}
                      >
                        <CheckCircle className="w-4 h-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost" size="icon"
                      className={cn(
                        'w-8 h-8',
                        a.whatsapp ? 'text-success hover:bg-success/10' : 'text-muted-foreground/30',
                        isPP && 'hidden',
                      )}
                      title={a.whatsapp ? 'Enviar WhatsApp' : 'Sem WhatsApp'}
                      onClick={() => enviarUmWhatsapp(a)}
                    >
                      <MessageSquare className="w-4 h-4" />
                    </Button>
                    {podeEditar && (
                    <Button
                      variant="ghost" size="icon"
                      className={cn('w-8 h-8', isEditingThis && 'bg-primary/10 text-primary')}
                      title={isEditingThis ? 'Fechar editor' : 'Editar'}
                      onClick={() => setEditandoInlineId(isEditingThis ? null : a.id)}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    )}
                    {podeExcluir && (
                    <>
                    <span className="w-px h-5 bg-border mx-1 shrink-0" />
                    <Button
                      variant="ghost" size="icon"
                      className="w-8 h-8 text-destructive/60 hover:text-destructive hover:bg-destructive/10"
                      title="Excluir acordo"
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
              {temCpf && <AvisoCpfAcordo key={`cpf-${a.id}`} acordo={a} colSpan={colSpanFull} />}
              {isEditingThis && (
                <AcordoEditInline
                  key={`inline-${a.id}`}
                  acordo={a}
                  isPaguePlay={isPP}
                  onSaved={(atualizado) => {
                    setEditandoInlineId(null);
                    patchAcordo(atualizado.id, atualizado);
                  }}
                  // Parcelas gravadas pelo modal: atualiza a lista sem fechar
                  // a edição, que continua aberta com o resto dos campos.
                  onParcelasAtualizadas={(linhas) => {
                    linhas.forEach(l => patchAcordo(l.id, l));
                  }}
                  onCancel={() => setEditandoInlineId(null)}
                />
              )}
              {isDetailThis && !isEditingThis && (
                <AcordoDetalheInline
                  key={`detalhe-${a.id}`}
                  acordo={a}
                  isPaguePlay={isPP}
                  colSpan={colSpanFull}
                  onClose={() => setDetalheInlineId(null)}
                  onSaved={(atualizado) => { patchAcordo(atualizado.id, atualizado); }}
                />
              )}
            </>
          );
        })}
      </tbody>
    </>
  );
}
