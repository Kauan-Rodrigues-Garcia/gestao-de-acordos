/**
 * Corpo da tabela de acordos do BookPlay.
 *
 * ## Por dia, como em Vendas (28/09/2026)
 *
 * A lista chega do servidor com os de hoje primeiro e o resto por vencimento.
 * Aqui ela só é cortada em blocos — uma linha-título por dia, com quantos
 * acordos há e quantos estão pendentes, pagos e não pagos — sem mudar a ordem.
 * Ver `agruparAcordosPorDia`.
 *
 * ## Toda linha tem a mesma altura
 *
 * O cartão mudava de tamanho conforme o nome do cliente, o NR, as tags e o
 * WhatsApp: cada informação a mais era uma linha a mais dentro da célula. Agora
 * a tabela é `table-fixed`, as larguras moram no `<colgroup>`, e cada célula
 * tem no máximo duas linhas, cortadas com reticências (o texto inteiro fica no
 * `title`). `ALTURA_LINHA` fecha a conta.
 */
import { Fragment } from 'react';
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
import { agruparAcordosPorDia } from '@/lib/acordosPorDia';
import { AvisoCpfAcordo } from '@/components/AvisoCpfAcordo';
import { CodigoAcordoCopiavel } from '@/components/CodigoAcordoCopiavel';
import { AcordoNovoInline } from '@/components/AcordoNovoInline';
import { AcordoEditInline } from '@/components/AcordoEditInline';
import { AcordoDetalheInline } from '@/components/AcordoDetalheInline';
import { LinhaDoDiaAcordos, SetaDetalhe } from '@/components/AcordosDoDia';
import { VinculoTag } from '@/components/VinculoTag';
import { AcordoTags } from '@/components/AcordoTags';
import { OperadorCell } from '@/components/OperadorCell';
import type { Acordo, AcordoTag } from '@/lib/supabase';
import type { AcordoComVinculo } from '@/lib/deduplicarVinculados';
import { ensureAbsoluteUrl } from './helpers';

/** Mesma altura para toda linha, com duas linhas de texto na célula mais cheia. */
const ALTURA_LINHA = 'h-[52px]';
const CELULA = 'px-3 py-2 align-middle';
const CABECALHO = 'px-3 py-3 font-semibold text-muted-foreground';

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

/**
 * Larguras das colunas. Só o nome do cliente divide o que sobra; o resto é
 * número, data ou etiqueta, de largura conhecida.
 */
function Colunas({ isPP, mostrarColunaOperador }: { isPP: boolean; mostrarColunaOperador: boolean }) {
  return (
    <colgroup>
      <col className="w-[40px]" />
      {isPP ? (
        <>
          <col />
          <col className="w-[140px]" />
          <col className="w-[110px]" />
          <col className="w-[80px]" />
          <col className="w-[130px]" />
          <col className="w-[90px]" />
          <col className="w-[104px]" />
        </>
      ) : (
        <>
          <col className="w-[120px]" />
          <col />
          <col className="w-[100px]" />
          <col className="w-[110px]" />
          <col className="w-[132px]" />
          <col className="w-[80px]" />
          <col className="w-[104px]" />
        </>
      )}
      {mostrarColunaOperador && <col className="w-[170px]" />}
      <col className="w-[176px]" />
    </colgroup>
  );
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
  const grupos = agruparAcordosPorDia<AcordoComVinculo>(acordosParaExibir, acordoTemCpf);
  /** Índice na lista inteira: a entrada escalonada continua uma fila só. */
  let posicao = 0;

  function linha(a: AcordoComVinculo, i: number, noDia: number) {
    const atrasado      = isAtrasado(a.vencimento, a.status);
    const venceHoje     = a.vencimento === hoje;
    const sel           = selecionados.includes(a.id);
    const isEditingThis = editandoInlineId === a.id;
    const isDetailThis  = detalheInlineId === a.id;
    /** Acordo com CPF: vem no topo da lista e fica em vermelho até ser corrigido. */
    const temCpf        = acordoTemCpf(a);
    const rotulo        = a.nome_cliente || a.nr_cliente || a.instituicao || 'acordo';
    const secundaria    = [a.instituicao, a.whatsapp].filter(Boolean).join(' · ');
    const alternarDetalhe = () => setDetalheInlineId(isDetailThis ? null : a.id);
    return (
      <Fragment key={a.id}>
        <motion.tr
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: Math.min(i * 0.015, 0.3) }}
          className={cn(
            ALTURA_LINHA,
            'border-b border-border/50 hover:bg-accent/40 transition-colors cursor-pointer',
            noDia % 2 === 0 && 'bg-muted/10',
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
          {isPP ? (
            <>
              <td className={cn(CELULA, 'overflow-hidden')}>
                <div className="flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap">
                  <p className="min-w-0 truncate font-medium text-foreground" title={a.nome_cliente}>{a.nome_cliente}</p>
                  <AcordoTags tagIds={a.tag_ids} tags={empresaTags} />
                  <VinculoTag acordo={a} />
                </div>
              </td>
              <td className={cn(CELULA, 'overflow-hidden')}>
                <CodigoAcordoCopiavel codigo={a.instituicao} label="Código" className="max-w-full" />
              </td>
              <td className={cn(CELULA, 'text-right font-mono font-semibold text-foreground whitespace-nowrap')}>
                {formatCurrency(a.valor)}
              </td>
              <td className={CELULA}>
                {getEstadoFromAcordo(a) ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                    <MapPin className="w-2.5 h-2.5" />{getEstadoFromAcordo(a)}
                  </span>
                ) : '—'}
              </td>
              <td className={cn(CELULA, 'overflow-hidden')}>
                <span className={cn('inline-flex max-w-full truncate px-2 py-0.5 rounded-full text-[10px] font-medium border', TIPO_COLORS[a.tipo])}>
                  {TIPO_LABELS_PAGUEPLAY[a.tipo] || TIPO_LABELS[a.tipo]}
                </span>
              </td>
              <td className={cn(CELULA, 'overflow-hidden')}>
                {extractLinkAcordo(a.observacoes) ? (
                  <a
                    href={ensureAbsoluteUrl(extractLinkAcordo(a.observacoes)!)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex max-w-full items-center gap-1 text-[11px] text-primary hover:underline"
                    title={extractLinkAcordo(a.observacoes)!}
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
            </>
          ) : (
            <>
              <td className={cn(CELULA, 'overflow-hidden')}>
                <CodigoAcordoCopiavel codigo={a.nr_cliente} label="NR" className="max-w-full" />
              </td>
              <td className={cn(CELULA, 'overflow-hidden')}>
                <div className="flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap">
                  <p className="min-w-0 truncate font-medium text-foreground" title={a.nome_cliente}>{a.nome_cliente}</p>
                  <AcordoTags tagIds={a.tag_ids} tags={empresaTags} />
                  <VinculoTag acordo={a} />
                </div>
                {secundaria && (
                  <p className="mt-0.5 truncate text-[10px] text-muted-foreground/70" title={secundaria}>
                    {a.instituicao}
                    {a.instituicao && a.whatsapp && ' · '}
                    {a.whatsapp && <span className="font-mono">{a.whatsapp}</span>}
                  </p>
                )}
              </td>
              <td className={cn(CELULA, 'whitespace-nowrap')}>
                <span className={cn('font-mono', atrasado && 'text-destructive font-semibold', venceHoje && 'text-warning font-semibold')}>
                  {formatDate(a.vencimento)}
                </span>
              </td>
              <td className={cn(CELULA, 'text-right font-mono font-semibold text-foreground whitespace-nowrap')}>
                {formatCurrency(a.valor)}
              </td>
              <td className={cn(CELULA, 'overflow-hidden')}>
                <span className={cn('inline-flex max-w-full truncate px-2 py-0.5 rounded-full text-[10px] font-medium border', TIPO_COLORS[a.tipo])}>
                  {TIPO_LABELS[a.tipo]}
                </span>
              </td>
              <td className={cn(CELULA, 'text-center font-mono text-muted-foreground')}>
                {['boleto', 'cartao_recorrente', 'pix_automatico'].includes(a.tipo) ? a.parcelas : '—'}
              </td>
              <td className={CELULA}>
                <span className={cn('inline-flex whitespace-nowrap px-2 py-0.5 rounded-full text-[10px] font-medium border', STATUS_COLORS[a.status])}>
                  {STATUS_LABELS[a.status]}
                </span>
              </td>
            </>
          )}
          {/* Mesma célula da PaguePlay: nome COMPLETO e, quando há
              vínculo, o segundo operador na linha de baixo. Até
              16/08/2026 aqui só saía o primeiro nome, o que tornava
              indistinguíveis dois operadores homônimos. */}
          {mostrarColunaOperador && (
            <td className={cn(CELULA, 'overflow-hidden truncate text-muted-foreground text-[11px]')}>
              <OperadorCell acordo={a} operadoresMap={operadoresMap} />
            </td>
          )}
          <td className={CELULA}>
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
              <SetaDetalhe aberto={isDetailThis && !isEditingThis} disabled={isEditingThis} rotulo={rotulo} onClick={alternarDetalhe} />
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
      </Fragment>
    );
  }

  return (
    <>
      <Colunas isPP={isPP} mostrarColunaOperador={mostrarColunaOperador} />
      <thead>
        <tr className="border-b border-border bg-muted/30">
          <th className={CABECALHO}>
            <input
              type="checkbox"
              className="rounded border-border"
              checked={selecionados.length === acordosCount && acordosCount > 0}
              onChange={selecionarTodos}
            />
          </th>
          {isPP ? (
            <>
              <th className={cn(CABECALHO, 'text-left')}>NOME</th>
              <th className={cn(CABECALHO, 'text-left')}>INSCRIÇÃO</th>
              <th className={cn(CABECALHO, 'text-right')}>VALOR</th>
              <th className={cn(CABECALHO, 'text-left')}>ESTADO</th>
              <th className={cn(CABECALHO, 'text-left')}>PAGAMENTO</th>
              <th className={cn(CABECALHO, 'text-left')}>LINK</th>
              <th className={cn(CABECALHO, 'text-left')}>STATUS</th>
            </>
          ) : (
            <>
              <th className={cn(CABECALHO, 'text-left')}>NR</th>
              <th className={cn(CABECALHO, 'text-left')}>CLIENTE</th>
              <th className={cn(CABECALHO, 'text-left')}>VENCIMENTO</th>
              <th className={cn(CABECALHO, 'text-right')}>VALOR</th>
              <th className={cn(CABECALHO, 'text-left')}>TIPO</th>
              <th className={cn(CABECALHO, 'text-center')}>PARCELAS</th>
              <th className={cn(CABECALHO, 'text-left')}>STATUS</th>
            </>
          )}
          {mostrarColunaOperador && <th className={cn(CABECALHO, 'text-left')}>OPERADOR</th>}
          <th className={cn(CABECALHO, 'text-right')}>AÇÕES</th>
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
        ) : grupos.map(g => (
          <Fragment key={g.chave}>
            <LinhaDoDiaAcordos dia={g.dia} acordos={g.acordos} colSpan={colSpanFull} hoje={hoje} />
            {g.acordos.map((a, noDia) => linha(a, posicao++, noDia))}
          </Fragment>
        ))}
      </tbody>
    </>
  );
}
