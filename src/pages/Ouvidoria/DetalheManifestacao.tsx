/**
 * DetalheManifestacao — a janela de uma manifestação, no meio da tela.
 *
 *   Topo        código, status, selos, o nome do profissional e o resumo
 *               (canal, data, há quanto tempo aberta, quem registrou);
 *               Editar e Excluir.
 *   Barra       as ações do acompanhamento: status, retorno, agendar, concluir.
 *   Esquerda    o caso: os dados em cartões, o relato, a providência, as
 *               observações e a linha do tempo com as notas.
 *   Direita     o que pede ação: retorno agendado, responsáveis, ticket,
 *               grupo e outras manifestações do mesmo cliente.
 *
 * No celular vira uma coluna só, na ordem: ações, o caso, o resto.
 * Manifestação só de histórico não tem fila: a barra de ações some.
 */
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlarmClock, CalendarCheck2, CheckCheck, CheckCircle2, ClipboardList, FileText, History, Layers, Loader2,
  MessageSquarePlus, MessageSquareReply, NotebookPen, Paperclip, Pencil, StickyNote, Ticket, Trash2, Undo2, UserRound,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { contemCpf } from '@/lib/cpf';
import { getTodayISO } from '@/lib/index';
import { cn } from '@/lib/utils';
import {
  anotar, excluirManifestacao, listarAndamentos, retornoDado, salvarManifestacao, type DadosManifestacao,
} from '@/services/ouvidoriaCofen.service';
import { AgendarRetorno } from './AgendarRetorno';
import {
  BlocoGrupo, BlocoMesmoCliente, BlocoResponsaveis, BlocoRetornoAgendado, BlocoTicket,
} from './BlocosDetalhe';
import { CartaoAnexos } from './Anexos';
import { CampoLista } from './campos';
import { useOuvidoria } from './contexto';
import {
  DIAS_ALERTA, STATUS, dataBr, estaAberta, etiquetasUsadas, rotuloAssunto, rotuloCanal,
  rotuloConselho, rotuloSituacao, rotuloStatus, temRetornoAgendado,
  type Andamento, type Manifestacao, type Status, type TipoAndamento,
} from './ouvidoria';
import { COR_FAIXA_STATUS } from './estilo';
import { diasUteisEntre } from './diasUteis';
import { AnosColoridos, IconeCanal, LegendaEtiquetas, SeloRetorno, SeloStatus } from './visual';

interface Props {
  manifestacao: Manifestacao | null;
  aoFechar: () => void;
  aoEditar: (m: Manifestacao) => void;
  aoAbrirGrupo: (id: string) => void;
}

/** O formulário inteiro de volta, para as ações rápidas que mudam um campo só. */
function dadosDe(m: Manifestacao): DadosManifestacao {
  return {
    data_manifestacao: m.data_manifestacao, canal: m.canal, nome_profissional: m.nome_profissional,
    codigo_cliente: m.codigo_cliente, conselho_uf: m.conselho_uf, assunto: m.assunto, descricao: m.descricao,
    anuidades: m.anuidades, situacao_financeira: m.situacao_financeira, providencia: m.providencia,
    responsavel_id: m.responsavel_id, data_resposta: m.data_resposta, status: m.status,
    acompanhar: m.acompanhar, observacoes: m.observacoes,
  };
}

const ICONE_ANDAMENTO: Record<TipoAndamento, LucideIcon> = {
  criada: MessageSquarePlus,
  status: History,
  retorno: CalendarCheck2,
  responsavel: UserRound,
  acompanhamento: History,
  edicao: Pencil,
  nota: StickyNote,
  agendamento: AlarmClock,
  ciencia: CheckCheck,
  resposta: MessageSquareReply,
  ticket: Ticket,
  grupo: Layers,
  anexo: Paperclip,
  lixeira: Undo2,
};

function textoDoAndamento(a: Andamento): string {
  if (a.tipo === 'status') return `${rotuloStatus(a.status_de)} → ${rotuloStatus(a.status_para)}`;
  return a.texto ?? '';
}

/** `2026-11-06T14:02:00Z` → `06/11 às 11:02` (horário de Brasília). */
function quando(iso: string): string {
  const d = new Date(iso);
  const dia = d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' });
  const hora = d.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
  return `${dia} às ${hora}`;
}

/** Um cartão da coluna do caso. */
function Cartao({ titulo, icone: Icone, children, acao, className }: {
  titulo: string; icone: LucideIcon; children: React.ReactNode; acao?: React.ReactNode; className?: string;
}) {
  return (
    <section className={cn('rounded-xl border bg-card p-4 space-y-3', className)}>
      <div className="flex items-center gap-2 min-h-7">
        <span className="h-6 w-6 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <Icone className="h-3.5 w-3.5" />
        </span>
        <h3 className="text-sm font-semibold flex-1">{titulo}</h3>
        {acao}
      </div>
      {children}
    </section>
  );
}

/** Um dado do caso: rótulo pequeno em cima, valor embaixo. */
function Dado({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg bg-muted/40 px-3 py-2">
      <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{rotulo}</dt>
      <dd className={cn('text-sm mt-0.5 font-medium break-words', !children && 'text-muted-foreground font-normal')}>
        {children || '—'}
      </dd>
    </div>
  );
}

/** Texto longo (relato, providência, observações) ou o «ainda não» discreto. */
function TextoLongo({ texto, vazio }: { texto: string | null; vazio: string }) {
  return texto?.trim()
    ? <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{texto}</p>
    : <p className="text-sm text-muted-foreground italic">{vazio}</p>;
}

export function DetalheManifestacao({ manifestacao: m, aoFechar, aoEditar, aoAbrirGrupo }: Props) {
  const qc = useQueryClient();
  const { setor, etiquetas, grupos, recarregar, v2 } = useOuvidoria();
  const hoje = getTodayISO();
  const [nota, setNota] = useState('');
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);

  const andamentos = useQuery({
    queryKey: ['ouvidoria-andamentos', m?.id, m?.atualizado_em],
    enabled: !!m,
    queryFn: () => listarAndamentos(m!.id),
  });

  async function atualizar(rotulo: string, mudanca: Partial<DadosManifestacao>) {
    if (!m) return;
    setOcupado(rotulo);
    try {
      await salvarManifestacao(m.setor_id, m.id, { ...dadosDe(m), ...mudanca });
      recarregar();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setOcupado(null);
    }
  }

  /** Com a parte 2 no banco, o retorno também tira o agendamento. */
  async function darRetorno() {
    if (!m) return;
    setOcupado('retorno');
    try {
      await retornoDado(m.id, null);
      recarregar();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setOcupado(null);
    }
  }

  async function enviarNota() {
    if (!m || !nota.trim()) return;
    if (contemCpf(nota)) { toast.error('A nota tem um CPF. CPF não pode ser gravado no sistema.'); return; }
    setOcupado('nota');
    try {
      await anotar(m.id, nota.trim());
      setNota('');
      await qc.invalidateQueries({ queryKey: ['ouvidoria-andamentos', m.id] });
      recarregar();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setOcupado(null);
    }
  }

  async function excluir() {
    if (!m) return;
    setOcupado('excluir');
    try {
      await excluirManifestacao(m.id);
      toast.success(`${m.codigo} foi para a lixeira da Ouvidoria.`);
      setConfirmarExclusao(false);
      aoFechar();
      recarregar();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setOcupado(null);
    }
  }

  const diasAberta = m && m.acompanhar && estaAberta(m) ? diasUteisEntre(m.data_manifestacao, hoje) : null;
  const grupo = m ? grupos.find(g => g.id === m.grupo_id) ?? null : null;
  const linhaDoTempo = [...(andamentos.data ?? [])].reverse();

  return (
    <Dialog open={!!m} onOpenChange={o => { if (!o) aoFechar(); }}>
      <DialogContent className="max-w-6xl w-[calc(100vw-1rem)] sm:w-[calc(100vw-3rem)] h-[calc(100dvh-1rem)] sm:h-[min(92vh,920px)] p-0 gap-0 flex flex-col overflow-hidden rounded-2xl sm:rounded-2xl">
        {m && (
          <>
            {/* ── Topo ─────────────────────────────────────────────────── */}
            <header className="px-5 sm:px-6 pt-5 pb-4 border-b bg-background">
              <div className="flex items-center gap-2 flex-wrap pr-8">
                <span className="font-mono text-xs font-semibold rounded-md bg-muted px-2 py-0.5">{m.codigo}</span>
                {m.acompanhar ? (
                  <>
                    <SeloStatus status={m.status} />
                    <span className="text-[11px] rounded-full bg-primary/10 text-primary px-2 py-0.5 font-medium">Acompanhamento</span>
                  </>
                ) : (
                  <span className="text-[11px] rounded-full bg-muted text-muted-foreground px-2 py-0.5 font-medium">Só histórico</span>
                )}
                {grupo && (
                  <button type="button" onClick={() => aoAbrirGrupo(grupo.id)}
                          className="text-[11px] rounded-full bg-violet-500/10 text-violet-700 dark:text-violet-300 px-2 py-0.5 font-medium inline-flex items-center gap-1 hover:bg-violet-500/20">
                    <Layers className="h-3 w-3" /> {grupo.codigo} · {grupo.titulo}
                  </button>
                )}
                {m.ticket_status === 'pendente' && (
                  <span className="text-[11px] rounded-full bg-orange-500/15 text-orange-700 dark:text-orange-300 px-2 py-0.5 font-medium inline-flex items-center gap-1">
                    <Ticket className="h-3 w-3" /> Ticket pendente
                  </span>
                )}
              </div>
              <div className="mt-3 flex flex-wrap items-end gap-x-6 gap-y-3">
                <div className="min-w-0 flex-1">
                  <DialogTitle className="text-xl sm:text-2xl font-bold leading-tight break-words">{m.nome_profissional}</DialogTitle>
                  <DialogDescription className="mt-1 flex items-center gap-x-2 gap-y-1 flex-wrap text-xs">
                    <span className="inline-flex items-center gap-1"><IconeCanal canal={m.canal} /> {rotuloCanal(m.canal)}</span>
                    <span aria-hidden>·</span>
                    <span>Manifestação em {dataBr(m.data_manifestacao)}</span>
                    {diasAberta !== null && (
                      <>
                        <span aria-hidden>·</span>
                        <span className={cn('font-medium', diasAberta >= DIAS_ALERTA ? 'text-destructive' : 'text-foreground')}>
                          {diasAberta === 0 ? 'aberta hoje' : `aberta há ${diasAberta} ${diasAberta === 1 ? 'dia útil' : 'dias úteis'}`}
                        </span>
                      </>
                    )}
                    <span aria-hidden>·</span>
                    <span>registrada por {m.criado_por_nome ?? '—'}</span>
                  </DialogDescription>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => aoEditar(m)}>
                    <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                  </Button>
                  {setor.pode_gerir && (
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => setConfirmarExclusao(true)} aria-label="Excluir">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            </header>

            {/* ── Barra de ações do acompanhamento ─────────────────────── */}
            <div className="px-5 sm:px-6 py-3 border-b bg-muted/30">
              {m.acompanhar ? (
                <div className="flex flex-wrap items-center gap-2">
                  <CampoLista
                    compacto
                    rotulo="Status"
                    valor={m.status}
                    desligado={!!ocupado}
                    className="h-9 min-w-[190px] bg-background"
                    aoMudar={v => void atualizar('status', { status: v as Status })}
                    opcoes={STATUS.map(s => ({
                      valor: s.valor, rotulo: s.rotulo,
                      marca: <span className={cn('h-2 w-2 rounded-full shrink-0', COR_FAIXA_STATUS[s.valor])} />,
                    }))}
                  />
                  {m.data_resposta ? (
                    <span className="h-9 inline-flex items-center rounded-lg border bg-background px-3">
                      <SeloRetorno data={m.data_resposta} />
                    </span>
                  ) : (
                    <Button size="sm" variant="outline" className="h-9 text-xs bg-background" disabled={!!ocupado}
                            onClick={() => void (v2 ? darRetorno() : atualizar('retorno', { data_resposta: hoje }))}>
                      {ocupado === 'retorno'
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                        : <CalendarCheck2 className="h-3.5 w-3.5 mr-1" />}
                      Teve retorno hoje
                    </Button>
                  )}
                  {v2 && estaAberta(m) && !temRetornoAgendado(m) && (
                    <AgendarRetorno m={m} aoMudar={recarregar}>
                      <Button size="sm" variant="outline" className="h-9 text-xs bg-background">
                        <AlarmClock className="h-3.5 w-3.5 mr-1" /> Agendar retorno
                      </Button>
                    </AgendarRetorno>
                  )}
                  <div className="flex-1" />
                  {estaAberta(m) && (
                    <Button size="sm" className="h-9 text-xs bg-success text-success-foreground hover:bg-success/90"
                            disabled={!!ocupado}
                            onClick={() => void atualizar('concluir', {
                              status: 'concluido', data_resposta: m.data_resposta ?? hoje,
                            })}>
                      {ocupado === 'concluir'
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                        : <CheckCircle2 className="h-3.5 w-3.5 mr-1" />}
                      Concluir manifestação
                    </Button>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Só histórico, fora da fila. Para acompanhar, clique em Editar e ligue «Acompanhar esta manifestação».
                </p>
              )}
            </div>

            {/* ── Corpo ────────────────────────────────────────────────── */}
            <div className="flex-1 overflow-y-auto bg-muted/20">
              <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)] items-start">
                {/* Coluna do caso */}
                <div className="space-y-4 min-w-0 order-2 lg:order-1">
                  <Cartao titulo="O caso" icone={ClipboardList}>
                    <dl className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      <Dado rotulo="Assunto">{rotuloAssunto(m.assunto)}</Dado>
                      <Dado rotulo="Código do cliente">{m.codigo_cliente && <span className="font-mono">{m.codigo_cliente}</span>}</Dado>
                      <Dado rotulo="Conselho">{m.conselho_uf ? rotuloConselho(m.conselho_uf) : null}</Dado>
                      <Dado rotulo="Situação financeira">{m.situacao_financeira ? rotuloSituacao(m.situacao_financeira) : null}</Dado>
                      <Dado rotulo="Retorno ao profissional">{m.data_resposta ? dataBr(m.data_resposta) : null}</Dado>
                      <Dado rotulo="Atualizada por">{m.atualizado_por_nome}</Dado>
                    </dl>
                    {m.anuidades.length > 0 && (
                      <div className="rounded-lg border border-dashed px-3 py-2.5 space-y-2">
                        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          Anuidade{m.anuidades.length > 1 ? 's' : ''} envolvida{m.anuidades.length > 1 ? 's' : ''}
                        </p>
                        <AnosColoridos m={m} etiquetas={etiquetas} className="gap-1.5" />
                        <LegendaEtiquetas etiquetas={etiquetasUsadas([m], etiquetas)} />
                      </div>
                    )}
                  </Cartao>

                  <Cartao titulo="Relato do profissional" icone={FileText}>
                    <TextoLongo texto={m.descricao} vazio="Sem relato." />
                  </Cartao>

                  <div className="grid gap-4 md:grid-cols-2">
                    <Cartao titulo="Providência adotada" icone={CheckCircle2}>
                      <TextoLongo texto={m.providencia} vazio="Nenhuma providência registrada ainda." />
                    </Cartao>
                    <Cartao titulo="Observações" icone={NotebookPen}>
                      <TextoLongo texto={m.observacoes} vazio="Sem observações." />
                    </Cartao>
                  </div>

                  <CartaoAnexos m={m} />

                  <Cartao titulo="Linha do tempo" icone={History}
                          acao={<span className="text-[11px] text-muted-foreground tabular-nums">{linhaDoTempo.length} registros</span>}>
                    <div className="flex gap-2">
                      <Textarea rows={2} value={nota} onChange={ev => setNota(ev.target.value)}
                                placeholder="Registrar um andamento (ligação, e-mail, combinado…)" className="text-sm rounded-lg" />
                      <Button size="sm" className="self-end" disabled={!nota.trim() || !!ocupado} onClick={() => void enviarNota()}>
                        {ocupado === 'nota' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Anotar'}
                      </Button>
                    </div>

                    {andamentos.isLoading ? (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground py-4">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando…
                      </div>
                    ) : (
                      <ol className="relative border-l border-border ml-2.5 space-y-3.5 pt-1">
                        {linhaDoTempo.map(a => {
                          const Icone = ICONE_ANDAMENTO[a.tipo] ?? History;
                          const escrito = a.tipo === 'nota' || a.tipo === 'resposta';
                          return (
                            <li key={a.id} className="ml-5">
                              <span className={cn(
                                'absolute -left-[11px] flex h-[22px] w-[22px] items-center justify-center rounded-full border bg-background',
                                a.tipo === 'nota' && 'border-primary/40 text-primary',
                                (a.tipo === 'retorno' || a.tipo === 'resposta') && 'border-success/40 text-success',
                                a.tipo === 'agendamento' && 'border-info/40 text-info',
                                a.tipo === 'ticket' && 'border-orange-500/40 text-orange-600',
                                a.tipo === 'grupo' && 'border-violet-500/40 text-violet-600',
                              )}>
                                <Icone className="h-3 w-3" />
                              </span>
                              {a.tipo === 'resposta' && (
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-success">Resposta do encaminhamento</p>
                              )}
                              <p className={cn(
                                'text-sm',
                                escrito ? 'whitespace-pre-wrap rounded-lg px-3 py-2 mt-0.5' : 'text-muted-foreground',
                                a.tipo === 'nota' && 'bg-primary/5 border border-primary/15',
                                a.tipo === 'resposta' && 'bg-success/5 border border-success/20',
                              )}>
                                {textoDoAndamento(a)}
                              </p>
                              <p className="text-[11px] text-muted-foreground/80 mt-0.5">
                                {a.autor_nome ?? '—'} · {quando(a.criado_em)}
                              </p>
                            </li>
                          );
                        })}
                      </ol>
                    )}
                  </Cartao>
                </div>

                {/* Coluna do que pede ação */}
                <aside className="space-y-3 min-w-0 order-1 lg:order-2 lg:sticky lg:top-0">
                  <BlocoRetornoAgendado m={m} />
                  <BlocoResponsaveis m={m} />
                  <BlocoTicket m={m} />
                  <BlocoGrupo m={m} aoAbrirGrupo={aoAbrirGrupo} />
                  <BlocoMesmoCliente m={m} />
                </aside>
              </div>
            </div>

            <AlertDialog open={confirmarExclusao} onOpenChange={setConfirmarExclusao}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Excluir {m.codigo}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    A manifestação de {m.nome_profissional} sai da lista e vai para a lixeira da Ouvidoria.
                    Quem gerencia pode restaurar de lá, com a linha do tempo e os anexos.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={ocupado === 'excluir'}>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    disabled={ocupado === 'excluir'}
                    onClick={ev => { ev.preventDefault(); void excluir(); }}
                  >
                    Mandar para a lixeira
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
