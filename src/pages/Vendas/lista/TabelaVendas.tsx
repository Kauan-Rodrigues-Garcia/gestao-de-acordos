/**
 * TabelaVendas — a lista da aba Vendas, no desenho da tabela de Acordos.
 *
 * ## Por que tabela, e não a pilha de cartões de antes
 *
 * A linha antiga era `NR · cliente (flex-1) · UF · etiqueta · valor`: o nome
 * do cliente esticava até empurrar o resto para a borda, e sobrava uma faixa
 * vazia no meio de toda linha — «muito espaço sobrando até o estado». Numa
 * tabela cada coisa tem a sua coluna, e o espaço que sobrava virou informação:
 * vendedor, as duas datas, forma de pagamento, **quanto vale na meta** e
 * quanto já entrou.
 *
 * ## O dia continua sendo a unidade
 *
 * «O dia 07 tem 5 vendas anotadas, fica salvo nesse dia.» Cada dia abre com
 * uma linha-título — quantas, quantas na meta, quanto — e as vendas dele
 * embaixo. É a pilha de dias de antes, só que alinhada em colunas.
 *
 * ## Clicar na linha abre o detalhe
 *
 * Como em Acordos. É onde mora o que não cabe na coluna (entrada, motivo,
 * quem confirmou) e, para o líder, as decisões: confirmar, assinar, cancelar.
 */
import { Fragment, useState } from 'react';
import { motion } from 'framer-motion';
import {
  CheckCircle2, ChevronDown, Edit, PenTool, Trash2, Undo2, Ban, RotateCcw,
  CalendarDays, Info,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CodigoAcordoCopiavel } from '@/components/CodigoAcordoCopiavel';
import { formatBRL } from '@/lib/money';
import { formatDate, getTodayISO } from '@/lib/index';
import { cn } from '@/lib/utils';
import type { SituacaoVenda } from '@/lib/vendas';
import {
  statusDaLinha, STATUS_DA_LINHA, ORIGEM_DA_LINHA, type StatusDaLinha,
} from '@/lib/vendasLista';
import type { Venda } from '@/services/vendas/vendas.service';

export interface DecisaoDoLider {
  id: string;
  situacao: SituacaoVenda;
  assinado: boolean;
  dataConfirmacao: string | null;
  valorRecebido: number | null;
  motivo: string | null;
}

export interface GrupoDoDia {
  dia: string;
  vendas: Venda[];
}

interface Props {
  grupos: readonly GrupoDoDia[];
  colSpan: number;
  mostrarVendedor: boolean;
  /** Nome da equipe que credita cada venda, quando se sabe. */
  equipeDe: (venda: Venda) => string | null;
  podeEditar: boolean;
  podeExcluir: boolean;
  podeDecidir: boolean;
  /** Linha que está sendo corrigida — a tabela a troca pelo formulário. */
  editandoId: string | null;
  renderEdicao: (venda: Venda) => React.ReactNode;
  onEditar: (venda: Venda) => void;
  onExcluir: (venda: Venda) => void;
  onDecidir: (d: DecisaoDoLider) => Promise<{ ok: boolean; erro: string | null }>;
  /** Primeira linha do corpo: o formulário de venda nova, quando aberto. */
  topo?: React.ReactNode;
  vazio: React.ReactNode;
}

export function StatusPill({ status }: { status: StatusDaLinha }) {
  const d = STATUS_DA_LINHA[status];
  return (
    <span title={d.dica} className={cn(
      'inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-medium',
      d.classe,
    )}>
      <span className={cn('h-1.5 w-1.5 rounded-full', d.ponto)} aria-hidden />
      {d.rotulo}
    </span>
  );
}

function rotuloDoDia(dia: string): string {
  const hoje = getTodayISO();
  const ontem = new Date(`${hoje}T12:00:00`);
  ontem.setDate(ontem.getDate() - 1);
  const ontemIso = ontem.toISOString().slice(0, 10);
  const semana = new Date(`${dia}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long' });
  const prefixo = dia === hoje ? 'Hoje' : dia === ontemIso ? 'Ontem' : semana;
  return `${prefixo.charAt(0).toUpperCase()}${prefixo.slice(1)} · ${formatDate(dia)}`;
}

export function TabelaVendas({
  grupos, colSpan, mostrarVendedor, equipeDe,
  podeEditar, podeExcluir, podeDecidir, editandoId, renderEdicao,
  onEditar, onExcluir, onDecidir, topo, vazio,
}: Props) {
  const [aberta, setAberta] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  async function decidir(venda: Venda, situacao: SituacaoVenda, assinado: boolean, motivo: string | null, msg: string) {
    setOcupado(venda.id);
    const r = await onDecidir({
      id: venda.id, situacao, assinado,
      dataConfirmacao: situacao === 'confirmada'
        ? (venda.data_confirmacao?.slice(0, 10) ?? getTodayISO())
        : null,
      valorRecebido: null,
      motivo,
    });
    setOcupado(null);
    if (!r.ok) { toast.error(r.erro ?? 'Não foi possível salvar a decisão.'); return; }
    toast.success(msg);
  }

  const vazioTotal = grupos.every(g => g.vendas.length === 0);

  return (
    <>
      <thead>
        <tr className="border-b border-border bg-muted/30 text-[11px]">
          <th className="px-3 py-3 text-left font-semibold text-muted-foreground">NR</th>
          <th className="px-3 py-3 text-left font-semibold text-muted-foreground">CLIENTE</th>
          {mostrarVendedor && <th className="px-3 py-3 text-left font-semibold text-muted-foreground">VENDEDOR</th>}
          <th className="px-3 py-3 text-left font-semibold text-muted-foreground">VENDA</th>
          <th className="hidden px-3 py-3 text-left font-semibold text-muted-foreground lg:table-cell">CONFIRMAÇÃO</th>
          <th className="px-3 py-3 text-left font-semibold text-muted-foreground">UF</th>
          <th className="hidden px-3 py-3 text-left font-semibold text-muted-foreground md:table-cell">PAGAMENTO</th>
          <th className="px-3 py-3 text-left font-semibold text-muted-foreground">STATUS</th>
          <th className="px-3 py-3 text-right font-semibold text-muted-foreground">VALOR</th>
          <th className="px-3 py-3 text-right font-semibold text-muted-foreground">NA META</th>
          <th className="hidden px-3 py-3 text-right font-semibold text-muted-foreground xl:table-cell">RECEBIDO</th>
          <th className="px-3 py-3 text-right font-semibold text-muted-foreground">AÇÕES</th>
        </tr>
      </thead>
      <tbody>
        {topo}
        {vazioTotal ? (
          <tr><td colSpan={colSpan} className="px-4 py-14">{vazio}</td></tr>
        ) : grupos.map(({ dia, vendas }) => {
          const naMeta = vendas.filter(v => v.conta_na_meta);
          const valorMeta = naMeta.reduce((s, v) => s + v.valor_na_meta, 0);
          return (
            <Fragment key={dia}>
              <tr className="border-b border-border bg-muted/40">
                <td colSpan={colSpan} className="px-3 py-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                    <span className="flex items-center gap-1.5 font-semibold text-foreground">
                      <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                      {rotuloDoDia(dia)}
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {vendas.length} venda{vendas.length === 1 ? '' : 's'}
                      {' · '}<strong className="text-success">{naMeta.length} na meta</strong>
                      {' · '}<strong className="font-mono text-foreground">{formatBRL(valorMeta)}</strong>
                    </span>
                  </div>
                </td>
              </tr>
              {vendas.map((v, i) => {
                if (editandoId === v.id) return <Fragment key={v.id}>{renderEdicao(v)}</Fragment>;
                const status = statusDaLinha(v);
                const origem = ORIGEM_DA_LINHA[v.origem];
                const detalhe = aberta === v.id;
                const travado = ocupado === v.id;
                const equipe = equipeDe(v);
                const podeCorrigir = podeEditar && v.origem !== 'geral';
                return (
                  <Fragment key={v.id}>
                    <motion.tr
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                      transition={{ delay: Math.min(i * 0.012, 0.2) }}
                      className={cn(
                        'cursor-pointer border-b border-border/50 text-xs transition-colors hover:bg-accent/40',
                        i % 2 === 0 && 'bg-muted/10',
                        status === 'falta_assinatura' && 'bg-warning/5',
                        (status === 'devolvida' || status === 'cancelada') && 'opacity-75',
                        detalhe && 'bg-accent/50',
                      )}
                      onClick={e => {
                        const alvo = e.target as HTMLElement;
                        if (alvo.closest('button') || alvo.closest('a') || alvo.closest('input')) return;
                        setAberta(detalhe ? null : v.id);
                      }}
                    >
                      <td className="px-3 py-2.5"><CodigoAcordoCopiavel codigo={v.nr_documento} label="NR" /></td>
                      <td className="max-w-[240px] px-3 py-2.5">
                        <p className="truncate font-medium text-foreground">
                          {v.cliente || <span className="font-normal text-muted-foreground">sem cliente</span>}
                        </p>
                        <p className="mt-0.5 text-[10px] text-muted-foreground" title={origem.dica}>{origem.rotulo}</p>
                      </td>
                      {mostrarVendedor && (
                        <td className="max-w-[180px] px-3 py-2.5">
                          <p className="truncate text-foreground">{v.perfis?.nome ?? 'Sem nome'}</p>
                          {equipe && <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{equipe}</p>}
                        </td>
                      )}
                      <td className="whitespace-nowrap px-3 py-2.5 font-mono text-muted-foreground">{formatDate(v.data_venda)}</td>
                      <td className="hidden whitespace-nowrap px-3 py-2.5 font-mono text-muted-foreground lg:table-cell">
                        {v.data_confirmacao ? formatDate(v.data_confirmacao) : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-[11px] font-medium text-muted-foreground">{v.uf?.trim() || '—'}</td>
                      <td className="hidden max-w-[150px] truncate px-3 py-2.5 text-[11px] text-muted-foreground md:table-cell">
                        {v.forma_pagamento || '—'}
                      </td>
                      <td className="px-3 py-2.5"><StatusPill status={status} /></td>
                      <td className={cn(
                        'whitespace-nowrap px-3 py-2.5 text-right font-mono font-semibold',
                        status === 'devolvida' || status === 'cancelada' ? 'text-muted-foreground line-through' : 'text-foreground',
                      )}>
                        {formatBRL(v.valor_total)}
                      </td>
                      <td className={cn(
                        'whitespace-nowrap px-3 py-2.5 text-right font-mono',
                        v.conta_na_meta ? 'font-semibold text-success' : 'text-muted-foreground/60',
                      )}>
                        {v.conta_na_meta ? formatBRL(v.valor_na_meta) : '—'}
                      </td>
                      <td className="hidden whitespace-nowrap px-3 py-2.5 text-right font-mono text-muted-foreground xl:table-cell">
                        {v.valor_recebido > 0 ? formatBRL(v.valor_recebido) : '—'}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-end gap-0.5">
                          {podeDecidir && (status === 'aguardando_relatorio' || status === 'em_aberto') && (
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-success hover:bg-success/10"
                              title="Confirmar e assinar — entra na meta" disabled={travado}
                              onClick={() => void decidir(v, 'confirmada', true, null, 'Confirmada e assinada. A venda entrou na meta.')}>
                              <CheckCircle2 className="h-4 w-4" />
                            </Button>
                          )}
                          {podeDecidir && status === 'falta_assinatura' && (
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-warning hover:bg-warning/10"
                              title="Marcar contrato assinado — entra na meta" disabled={travado}
                              onClick={() => void decidir(v, 'confirmada', true, v.motivo, 'Contrato assinado. A venda entrou na meta.')}>
                              <PenTool className="h-4 w-4" />
                            </Button>
                          )}
                          {podeCorrigir && (
                            <Button variant="ghost" size="icon" className="h-8 w-8" title="Corrigir"
                              onClick={() => onEditar(v)}>
                              <Edit className="h-4 w-4" />
                            </Button>
                          )}
                          {podeExcluir && (
                            <>
                              <span className="mx-1 h-5 w-px shrink-0 bg-border" />
                              <Button variant="ghost" size="icon"
                                className="h-8 w-8 text-destructive/60 hover:bg-destructive/10 hover:text-destructive"
                                title="Excluir (vai para a lixeira)" onClick={() => onExcluir(v)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          <ChevronDown className={cn('ml-1 h-3.5 w-3.5 text-muted-foreground transition-transform', detalhe && 'rotate-180')} aria-hidden />
                        </div>
                      </td>
                    </motion.tr>
                    {detalhe && (
                      <DetalheDaVenda
                        venda={v} colSpan={colSpan} status={status} equipe={equipe}
                        podeDecidir={podeDecidir} travado={travado}
                        onDecidir={(s, a, motivo, msg) => void decidir(v, s, a, motivo, msg)}
                      />
                    )}
                  </Fragment>
                );
              })}
            </Fragment>
          );
        })}
      </tbody>
    </>
  );
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{rotulo}</p>
      <div className="mt-0.5 truncate text-xs text-foreground">{children}</div>
    </div>
  );
}

function DetalheDaVenda({
  venda, colSpan, status, equipe, podeDecidir, travado, onDecidir,
}: {
  venda: Venda;
  colSpan: number;
  status: StatusDaLinha;
  equipe: string | null;
  podeDecidir: boolean;
  travado: boolean;
  onDecidir: (situacao: SituacaoVenda, assinado: boolean, motivo: string | null, msg: string) => void;
}) {
  const [motivo, setMotivo] = useState(venda.motivo ?? '');
  const origem = ORIGEM_DA_LINHA[venda.origem];
  const aberta = venda.situacao === 'aberta';

  return (
    <tr className="border-b border-border bg-accent/20">
      <td colSpan={colSpan} className="px-4 py-3">
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4 lg:grid-cols-6">
          <Campo rotulo="Status"><StatusPill status={status} /></Campo>
          <Campo rotulo="Origem"><span title={origem.dica}>{origem.rotulo}</span></Campo>
          <Campo rotulo="Vendedor">{venda.perfis?.nome ?? '—'}{equipe ? <span className="text-muted-foreground"> · {equipe}</span> : null}</Campo>
          <Campo rotulo="Data da venda">{formatDate(venda.data_venda)}</Campo>
          <Campo rotulo="Confirmação">{venda.data_confirmacao ? formatDate(venda.data_confirmacao) : '—'}</Campo>
          <Campo rotulo="Contrato">{venda.contrato_assinado ? 'Assinado' : 'Não assinado'}</Campo>
          <Campo rotulo="Valor total"><span className="font-mono">{formatBRL(venda.valor_total)}</span></Campo>
          <Campo rotulo="Entrada"><span className="font-mono">{venda.valor_entrada != null ? formatBRL(venda.valor_entrada) : '—'}</span></Campo>
          <Campo rotulo="Recebido"><span className="font-mono">{formatBRL(venda.valor_recebido)}</span></Campo>
          <Campo rotulo="Forma">{venda.forma_pagamento || '—'}</Campo>
          <Campo rotulo="Estado">{venda.uf?.trim() || '—'}</Campo>
          <Campo rotulo="Lançada em">{formatDate(venda.criado_em?.slice(0, 10))}</Campo>
          {venda.motivo && (
            <div className="col-span-2 sm:col-span-4 lg:col-span-6">
              <Campo rotulo="Motivo">{venda.motivo}</Campo>
            </div>
          )}
        </div>

        {status === 'aguardando_relatorio' && (
          <p className="mt-3 flex items-start gap-1.5 text-[11px] text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Quando o NR {venda.nr_documento} aparecer no relatório geral importado, esta venda ganha a
            situação e a assinatura de lá, sem ninguém precisar clicar.
          </p>
        )}

        {podeDecidir && (
          <div className="mt-3 space-y-2 border-t border-border/60 pt-3">
            {venda.origem === 'geral' && (
              <p className="flex items-start gap-1.5 text-[11px] text-amber-700 dark:text-amber-400">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Esta venda veio do relatório oficial. A próxima importação do geral sobrescreve o que for decidido aqui.
              </p>
            )}
            <div className="flex flex-wrap items-center gap-1.5">
              {!(venda.situacao === 'confirmada' && venda.contrato_assinado) && (
                <Button size="sm" className="h-7 gap-1 text-[12px]" disabled={travado}
                  onClick={() => onDecidir('confirmada', true, null, 'Confirmada e assinada. A venda entrou na meta.')}>
                  <CheckCircle2 className="h-3.5 w-3.5" /> {aberta ? 'Confirmar e assinar' : 'Marcar assinado'}
                </Button>
              )}
              {aberta && (
                <Button size="sm" variant="outline" className="h-7 text-[12px]" disabled={travado}
                  onClick={() => onDecidir('confirmada', false, null, 'Confirmada. Falta o contrato assinado para entrar na meta.')}>
                  Só confirmar
                </Button>
              )}
              <Input
                value={motivo} onChange={e => setMotivo(e.target.value)} disabled={travado}
                placeholder="Motivo (para cancelar ou devolver)" className="h-7 w-[240px] text-[12px]"
                aria-label="Motivo"
              />
              {venda.situacao !== 'cancelada' && (
                <Button size="sm" variant="ghost" className="h-7 gap-1 text-[12px] text-muted-foreground hover:text-destructive"
                  disabled={travado}
                  onClick={() => onDecidir('cancelada', venda.contrato_assinado, motivo.trim() || null, 'Venda cancelada. Saiu do placar.')}>
                  <Ban className="h-3.5 w-3.5" /> Cancelar
                </Button>
              )}
              {venda.situacao === 'confirmada' && (
                <Button size="sm" variant="ghost" className="h-7 gap-1 text-[12px] text-muted-foreground hover:text-destructive"
                  disabled={travado}
                  onClick={() => onDecidir('devolvida', venda.contrato_assinado, motivo.trim() || null, 'Venda devolvida. Saiu do placar.')}>
                  <Undo2 className="h-3.5 w-3.5" /> Devolver
                </Button>
              )}
              {!aberta && (
                <Button size="sm" variant="ghost" className="h-7 gap-1 text-[12px] text-muted-foreground"
                  disabled={travado}
                  onClick={() => onDecidir('aberta', false, null, 'A venda voltou para em aberto.')}>
                  <RotateCcw className="h-3.5 w-3.5" /> Voltar para aberta
                </Button>
              )}
            </div>
          </div>
        )}
      </td>
    </tr>
  );
}
