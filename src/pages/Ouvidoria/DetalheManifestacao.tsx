/**
 * DetalheManifestacao — a gaveta de uma manifestação: os dados, as ações
 * rápidas do acompanhamento (mudar status, registrar retorno) e a linha do
 * tempo com as notas de andamento.
 */
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarCheck2, CheckCircle2, History, Loader2, MessageSquarePlus, Pencil, StickyNote, Trash2,
  UserRound, type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { contemCpf } from '@/lib/cpf';
import { getTodayISO } from '@/lib/index';
import { cn } from '@/lib/utils';
import {
  anotar, excluirManifestacao, listarAndamentos, salvarManifestacao, type DadosManifestacao,
} from '@/services/ouvidoriaCofen.service';
import {
  STATUS, dataBr, diasEntre, estaAberta, rotuloAssunto, rotuloCanal, rotuloConselho, rotuloSituacao,
  rotuloStatus, type Andamento, type Manifestacao, type Status, type TipoAndamento,
} from './ouvidoria';
import { CLASSE_SELECT } from './estilo';
import { IconeCanal, SeloRetorno, SeloStatus } from './visual';

interface Props {
  manifestacao: Manifestacao | null;
  podeGerir: boolean;
  aoFechar: () => void;
  aoEditar: (m: Manifestacao) => void;
  aoMudar: () => void;
}

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

function Campo({ rotulo, children, largo }: { rotulo: string; children: React.ReactNode; largo?: boolean }) {
  return (
    <div className={cn('min-w-0', largo && 'col-span-2')}>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{rotulo}</dt>
      <dd className="text-sm mt-0.5 break-words whitespace-pre-wrap">{children || '—'}</dd>
    </div>
  );
}

export function DetalheManifestacao({ manifestacao: m, podeGerir, aoFechar, aoEditar, aoMudar }: Props) {
  const qc = useQueryClient();
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
      aoMudar();
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
      aoMudar();
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
      toast.success(`${m.codigo} excluída.`);
      setConfirmarExclusao(false);
      aoFechar();
      aoMudar();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setOcupado(null);
    }
  }

  const diasAberta = m && estaAberta(m) ? diasEntre(m.data_manifestacao, hoje) : null;

  return (
    <Sheet open={!!m} onOpenChange={o => { if (!o) aoFechar(); }}>
      <SheetContent className="w-full sm:max-w-xl p-0 flex flex-col gap-0">
        {m && (
          <>
            <SheetHeader className="px-5 pt-5 pb-4 border-b space-y-2 text-left">
              <div className="flex items-center gap-2 flex-wrap pr-8">
                <span className="font-mono text-xs font-semibold text-muted-foreground">{m.codigo}</span>
                <SeloStatus status={m.status} />
                {m.acompanhar ? (
                  <span className="text-[11px] rounded-full bg-primary/10 text-primary px-2 py-0.5 font-medium">Acompanhamento</span>
                ) : (
                  <span className="text-[11px] rounded-full bg-muted text-muted-foreground px-2 py-0.5 font-medium">Histórico</span>
                )}
              </div>
              <SheetTitle className="text-lg leading-tight">{m.nome_profissional}</SheetTitle>
              <SheetDescription className="flex items-center gap-2 flex-wrap text-xs">
                <span className="inline-flex items-center gap-1"><IconeCanal canal={m.canal} /> {rotuloCanal(m.canal)}</span>
                <span>·</span>
                <span>{dataBr(m.data_manifestacao)}</span>
                {diasAberta !== null && (
                  <>
                    <span>·</span>
                    <span className={cn(diasAberta >= 5 && 'text-warning font-medium')}>
                      {diasAberta === 0 ? 'aberta hoje' : `aberta há ${diasAberta} ${diasAberta === 1 ? 'dia' : 'dias'}`}
                    </span>
                  </>
                )}
              </SheetDescription>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto">
              {/* Ações rápidas do acompanhamento */}
              <div className="px-5 py-4 border-b bg-muted/30 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    aria-label="Status"
                    className={cn(CLASSE_SELECT, 'h-8 text-xs')}
                    value={m.status}
                    disabled={!!ocupado}
                    onChange={ev => void atualizar('status', { status: ev.target.value as Status })}
                  >
                    {STATUS.map(s => <option key={s.valor} value={s.valor}>{s.rotulo}</option>)}
                  </select>
                  {m.data_resposta ? (
                    <SeloRetorno data={m.data_resposta} className="px-1" />
                  ) : (
                    <Button size="sm" variant="outline" className="h-8 text-xs" disabled={!!ocupado}
                            onClick={() => void atualizar('retorno', { data_resposta: hoje })}>
                      {ocupado === 'retorno'
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                        : <CalendarCheck2 className="h-3.5 w-3.5 mr-1" />}
                      Profissional teve retorno hoje
                    </Button>
                  )}
                  {estaAberta(m) && (
                    <Button size="sm" variant="outline" className="h-8 text-xs text-success border-success/40 hover:bg-success/10"
                            disabled={!!ocupado}
                            onClick={() => void atualizar('concluir', {
                              status: 'concluido', data_resposta: m.data_resposta ?? hoje,
                            })}>
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Concluir
                    </Button>
                  )}
                  <div className="flex-1" />
                  <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => aoEditar(m)}>
                    <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                  </Button>
                  {podeGerir && (
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                            onClick={() => setConfirmarExclusao(true)} aria-label="Excluir">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>

              <dl className="px-5 py-4 grid grid-cols-2 gap-x-4 gap-y-3 border-b">
                <Campo rotulo="Assunto">{rotuloAssunto(m.assunto)}</Campo>
                <Campo rotulo="Conselho Regional">{m.conselho_uf ? rotuloConselho(m.conselho_uf) : null}</Campo>
                <Campo rotulo="Código do cliente">{m.codigo_cliente && <span className="font-mono">{m.codigo_cliente}</span>}</Campo>
                <Campo rotulo="Anuidade">{m.anuidades.length ? m.anuidades.join(', ') : null}</Campo>
                <Campo rotulo="Situação financeira">{m.situacao_financeira ? rotuloSituacao(m.situacao_financeira) : null}</Campo>
                <Campo rotulo="Responsável">{m.responsavel_nome}</Campo>
                <Campo rotulo="Descrição da reclamação" largo>{m.descricao}</Campo>
                <Campo rotulo="Providência adotada" largo>{m.providencia}</Campo>
                <Campo rotulo="Data da resposta">{m.data_resposta ? dataBr(m.data_resposta) : null}</Campo>
                <Campo rotulo="Registrada por">{m.criado_por_nome}</Campo>
                <Campo rotulo="Observações" largo>{m.observacoes}</Campo>
              </dl>

              <div className="px-5 py-4 space-y-3">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <History className="h-3.5 w-3.5" /> Linha do tempo
                </div>

                <div className="flex gap-2">
                  <Textarea rows={2} value={nota} onChange={ev => setNota(ev.target.value)}
                            placeholder="Registrar um andamento (ligação, e-mail, combinado…)" className="text-sm" />
                  <Button size="sm" className="self-end" disabled={!nota.trim() || !!ocupado} onClick={() => void enviarNota()}>
                    {ocupado === 'nota' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Anotar'}
                  </Button>
                </div>

                {andamentos.isLoading ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground py-4">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando…
                  </div>
                ) : (
                  <ol className="relative border-l border-border ml-2 space-y-3 pt-1">
                    {[...(andamentos.data ?? [])].reverse().map(a => {
                      const Icone = ICONE_ANDAMENTO[a.tipo];
                      return (
                        <li key={a.id} className="ml-4">
                          <span className={cn(
                            'absolute -left-[9px] flex h-[18px] w-[18px] items-center justify-center rounded-full border bg-background',
                            a.tipo === 'nota' && 'border-primary/40 text-primary',
                            a.tipo === 'retorno' && 'border-success/40 text-success',
                          )}>
                            <Icone className="h-2.5 w-2.5" />
                          </span>
                          <p className={cn('text-sm', a.tipo === 'nota' ? 'whitespace-pre-wrap' : 'text-muted-foreground')}>
                            {textoDoAndamento(a)}
                          </p>
                          <p className="text-[11px] text-muted-foreground/80">
                            {a.autor_nome ?? '—'} · {quando(a.criado_em)}
                          </p>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </div>
            </div>

            <AlertDialog open={confirmarExclusao} onOpenChange={setConfirmarExclusao}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Excluir {m.codigo}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    A manifestação de {m.nome_profissional} e a linha do tempo dela saem da aba. O registro
                    fica guardado nos logs de auditoria.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={ocupado === 'excluir'}>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    disabled={ocupado === 'excluir'}
                    onClick={ev => { ev.preventDefault(); void excluir(); }}
                  >
                    Excluir
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
