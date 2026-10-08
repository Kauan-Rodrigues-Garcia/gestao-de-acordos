/**
 * Corpo da tabela de acordos da PaguePlay.
 *
 * Mesmo desenho do BookPlay desde 28/09/2026 (ver `AcordosTableBody`): blocos
 * por dia de vencimento com hoje primeiro, a setinha do detalhe ao lado da
 * lixeira, e toda linha com a mesma altura — as larguras moram em `PPColunas`,
 * e cada célula corta o excesso com reticências.
 */
import { Fragment } from 'react';
import { Button } from '@/components/ui/button';
import {
  CheckCircle, Edit, FileX, Link2, MapPin, Plus, Trash2, Undo2, X,
} from 'lucide-react';
import { horaLimite, pagoDesfazivel, useRelogioDesfazerPago } from '@/lib/desfazerPago';
import { cn } from '@/lib/utils';
import {
  formatCurrency, formatDate, STATUS_COLORS, STATUS_LABELS,
  STATUS_LABELS_PAGUEPLAY, TIPO_COLORS, TIPO_LABELS, TIPO_LABELS_PAGUEPLAY,
  getEstadoFromAcordo, extractLinkAcordo, isAtrasado,
} from '@/lib/index';
import { acordoTemCpf } from '@/lib/cpf';
import { agruparAcordosPorDia, resumirSelecaoDoDia } from '@/lib/acordosPorDia';
import { AvisoCpfAcordo } from '@/components/AvisoCpfAcordo';
import { CodigoAcordoCopiavel } from '@/components/CodigoAcordoCopiavel';
import { VinculoTag } from '@/components/VinculoTag';
import { AcordoTags } from '@/components/AcordoTags';
import { OperadorCell } from '@/components/OperadorCell';
import { AcordoEditInline } from '@/components/AcordoEditInline';
import { AcordoDetalheInline } from '@/components/AcordoDetalheInline';
import { AcordoNovoInline } from '@/components/AcordoNovoInline';
import { LinhaDoDiaAcordos, SetaDetalhe } from '@/components/AcordosDoDia';
import type { Acordo } from '@/lib/supabase';
import type { AcordoComVinculo } from '@/lib/deduplicarVinculados';
import { ensureAbsoluteUrl } from './helpers';
import { podeReagendar } from '@/services/reagendamento/reagendamento';
import { BotaoReagendar } from '@/components/BotaoReagendar';

interface Tag { id: string; nome: string; cor: string; }

const ALTURA_LINHA = 'h-[52px]';
const CELULA = 'px-3 py-2 align-middle';

/** As larguras da tabela. Só o código/nome do cliente divide o que sobra. */
export function PPColunas({ visaoAmpla }: { visaoAmpla: boolean }) {
  return (
    <colgroup>
      <col className="w-[40px]" />
      <col />
      <col className="w-[80px]" />
      <col className="w-[100px]" />
      <col className="w-[110px]" />
      <col className="w-[160px]" />
      <col className="w-[90px]" />
      <col className="w-[104px]" />
      {visaoAmpla && <col className="w-[170px]" />}
      {/* 208: pendente com calendário = 5 botões + separador + setinha. */}
      <col className="w-[208px]" />
    </colgroup>
  );
}

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
  /** Marca/desmarca o dia inteiro pela caixinha da linha-título. */
  alternarDia: (idsDoDia: string[]) => void;
  atualizandoStatus: string | null;
  marcarComoPago: (a: AcordoComVinculo) => void;
  /** Volta o acordo marcado como pago há menos de 5 min (`lib/desfazerPago`). */
  desfazerPago: (a: AcordoComVinculo) => void;
  /** Chaves `grupo#numero` das parcelas que já existem (useParcelasExistentes). */
  parcelasExistentes: ReadonlySet<string>;
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
  selecionados, toggleSelecionado, alternarDia,
  atualizandoStatus, marcarComoPago, desfazerPago,
  parcelasExistentes, setReagendarAcordo,
  excluindoId, setConfirmandoExclusao,
  empresaTags, operadoresMap,
  temFiltros, limparFiltros,
}: PPTableBodyProps) {
  // checkbox, código, estado, vencimento, valor, tipo, link, status, [operador], ações
  const colSpan = visaoAmpla ? 10 : 9;
  // O «Desfazer» do pago some sozinho depois de 5 min: redesenha quando fecha.
  useRelogioDesfazerPago();
  const grupos = agruparAcordosPorDia<AcordoComVinculo>(acordosOrdenados, acordoTemCpf);
  /** Índice na lista inteira: a entrada escalonada continua uma fila só. */
  let posicao = 0;

  function linha(a: AcordoComVinculo, i: number, noDia: number) {
    const atrasado = isAtrasado(a.vencimento, a.status);
    const venceHoje = a.vencimento === hoje;
    const sel = selecionados.includes(a.id);
    const isEditingThis = editandoInlineIdTabela === a.id;
    const isDetailThis = detalheInlineIdTabela === a.id;
    /** Acordo com CPF: vem no topo da lista e fica em vermelho até ser corrigido. */
    const temCpf = acordoTemCpf(a);
    const rotulo = a.nome_cliente || a.instituicao || a.nr_cliente || 'acordo';
    const alternarDetalhe = () => setDetalheInlineIdTabela(isDetailThis ? null : a.id);
    // A regra mora em `services/reagendamento`: só aparece quando a próxima
    // parcela ainda não foi agendada.
    const agendar = podeEditar ? podeReagendar(a, isPP, parcelasExistentes) : null;
    const donoNome = visaoAmpla
      ? ((a.perfis as { nome?: string } | undefined)?.nome ?? operadoresMap[a.operador_id] ?? null)
      : null;
    return (
      <Fragment key={a.id}>
        {/* Linha comum desde 06/10/2026: o fade de entrada por linha (framer-motion)
            custava em máquina fraca e não dizia nada. */}
        <tr
          className={cn(
            ALTURA_LINHA,
            'border-b border-border/50 hover:bg-accent/40 transition-colors cursor-pointer',
            noDia % 2 === 0 && 'bg-muted/10',
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
            if (!isEditingThis) alternarDetalhe();
          }}
        >
          <td className={CELULA}>
            <input
              type="checkbox"
              className="rounded border-border"
              checked={sel}
              onChange={() => toggleSelecionado(a.id)}
            />
          </td>
          <td className={cn(CELULA, 'overflow-hidden')}>
            <CodigoAcordoCopiavel codigo={a.instituicao} label="Código" className="max-w-full" />
            <div className="mt-0.5 flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap">
              <p className="min-w-0 truncate font-mono text-[10px] font-medium text-muted-foreground" title={a.nome_cliente}>{a.nome_cliente}</p>
              <AcordoTags tagIds={a.tag_ids} tags={empresaTags} />
              <VinculoTag acordo={a} />
            </div>
          </td>
          <td className={CELULA}>
            {getEstadoFromAcordo(a) ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                <MapPin className="w-2.5 h-2.5" />{getEstadoFromAcordo(a)}
              </span>
            ) : '—'}
          </td>
          <td className={cn(CELULA, 'whitespace-nowrap')}>
            <span className={cn('font-mono text-[11px]', atrasado && 'text-destructive font-semibold', venceHoje && a.status !== 'pago' && 'text-warning font-semibold')}>
              {formatDate(a.vencimento)}
            </span>
          </td>
          <td className={cn(CELULA, 'text-right font-mono font-semibold text-foreground whitespace-nowrap')}>
            {formatCurrency(a.valor)}
          </td>
          <td className={cn(CELULA, 'overflow-hidden')}>
            <div className="flex items-center gap-1.5 overflow-hidden whitespace-nowrap">
              <span className={cn('inline-flex min-w-0 truncate px-2 py-0.5 rounded-full text-[10px] font-medium border', TIPO_COLORS[a.tipo])}>
                {TIPO_LABELS_PAGUEPLAY[a.tipo] || TIPO_LABELS[a.tipo]}
              </span>
              {(a.parcelas ?? 1) > 1 && (
                <span className="inline-flex shrink-0 items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-primary/10 text-primary border border-primary/20 tabular-nums tracking-tight">
                  {a.numero_parcela ?? 1}/{a.parcelas}
                </span>
              )}
            </div>
          </td>
          <td className={cn(CELULA, 'overflow-hidden')}>
            {extractLinkAcordo(a.observacoes) ? (
              <a
                href={ensureAbsoluteUrl(extractLinkAcordo(a.observacoes)!)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex max-w-full items-center gap-1 text-[11px] text-primary hover:underline"
                title={extractLinkAcordo(a.observacoes)!}
                onClick={(e) => e.stopPropagation()}
              >
                <Link2 className="w-2.5 h-2.5 flex-shrink-0" />
                <span className="truncate">ver link</span>
              </a>
            ) : '—'}
          </td>
          <td className={CELULA}>
            <span className={cn('inline-flex whitespace-nowrap px-2 py-0.5 rounded-full text-[10px] font-medium border', STATUS_COLORS[a.status])}>
              {STATUS_LABELS_PAGUEPLAY[a.status] || STATUS_LABELS[a.status]}
            </span>
          </td>
          {visaoAmpla && (
            <td className={cn(CELULA, 'overflow-hidden truncate text-xs text-muted-foreground')}>
              <OperadorCell acordo={a} operadoresMap={operadoresMap} />
            </td>
          )}
          <td className={CELULA}>
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
              {a.status === 'pago' && (() => {
                const desfazivel = pagoDesfazivel(a.id);
                return desfazivel && (
                  <Button
                    variant="ghost" size="icon" className="w-8 h-8 text-amber-600 hover:bg-amber-500/10 dark:text-amber-400"
                    title={`Desfazer o pagamento (até ${horaLimite(desfazivel)})`}
                    aria-label="Desfazer o pagamento"
                    disabled={atualizandoStatus === a.id}
                    onClick={(e) => { e.stopPropagation(); desfazerPago(a); }}
                  >
                    <Undo2 className="w-4 h-4" />
                  </Button>
                );
              })()}
              {agendar?.pode && (
                <BotaoReagendar decisao={agendar} dono={donoNome} onClick={() => setReagendarAcordo(a)} />
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
              <SetaDetalhe aberto={isDetailThis && !isEditingThis} disabled={isEditingThis} rotulo={rotulo} onClick={alternarDetalhe} />
            </div>
          </td>
        </tr>
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
            // Parcelas gravadas pelo modal: atualiza a lista sem fechar
            // a edição, que continua aberta com o resto dos campos.
            onParcelasAtualizadas={(linhas) => {
              linhas.forEach(l => patchAcordo(l.id, l));
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
      </Fragment>
    );
  }

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
      ) : grupos.map(g => (
        <Fragment key={g.chave}>
          <LinhaDoDiaAcordos
            dia={g.dia} acordos={g.acordos} colSpan={colSpan} hoje={hoje}
            selecao={{
              ...resumirSelecaoDoDia(g.acordos, selecionados),
              onAlternar: () => alternarDia(g.acordos.map(a => a.id)),
            }}
          />
          {g.acordos.map((a, noDia) => linha(a, posicao++, noDia))}
        </Fragment>
      ))}
    </tbody>
  );
}
