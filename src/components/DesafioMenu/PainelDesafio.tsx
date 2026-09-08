/**
 * Painel lateral da campanha: usa o mesmo cálculo e o mesmo ranking da aba.
 * A mídia fica apenas no menu; o cabeçalho apresenta nome, período e critério.
 */
import { useRef } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { CalendarDays, Gift, TrendingUp, Users, X } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useResultadoDesafio } from '@/hooks/useDesafios';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { formatBRL } from '@/lib/money';
import { ClassificacaoDesafio } from '@/pages/Analitico/Desafios/ClassificacaoDesafio';
import { RankingEquipes } from '@/pages/Analitico/Desafios/RankingEquipes';
import { dataBR, estiloDaCampanha, hojeISO, percentualCheio } from '@/pages/Analitico/Desafios/tema';
import { diasRestantes, ehCorridaDeProjecao, type ResultadoDesafio } from '@/services/desafios/calcularDesafio';
import { rotuloCriterio } from '@/services/desafios/tiposDesafio';
import type { Desafio } from '@/services/desafios/types';

export interface PainelDesafioProps {
  desafio: Desafio | null;
  aberto: boolean;
  onClose: () => void;
}

interface VisualProps extends Omit<PainelDesafioProps, 'desafio'> {
  desafio: Desafio;
  resultado: ResultadoDesafio | null;
  carregando: boolean;
  erro: string | null;
  operadorId: string | null;
}

export function PainelDesafio({ desafio, aberto, onClose }: PainelDesafioProps) {
  const { perfil } = useAuth();
  const { resultado, carregando, erro } = useResultadoDesafio(
    aberto ? desafio : null,
    { operadorId: perfil?.id ?? null, setorDeCadastro: perfil?.setor_id ?? null },
  );
  if (!desafio) return null;
  return <PainelDesafioVisual desafio={desafio} aberto={aberto} onClose={onClose} resultado={resultado} carregando={carregando} erro={erro} operadorId={perfil?.id ?? null} />;
}

/** Apresentação isolada da consulta: permite conferir a gaveta sem acessar produção. */
export function PainelDesafioVisual({ desafio, aberto, onClose, resultado, carregando, erro, operadorId }: VisualProps) {
  const focoAnterior = useRef<HTMLElement | null>(null);
  const tema = estiloDaCampanha(desafio.visual);
  const { Icone } = tema;
  const projecao = ehCorridaDeProjecao(desafio.regra);
  const individual = desafio.regra.modo.includes('individual');
  const lista = resultado?.individual ?? [];
  const eu = individual ? lista.find(p => p.pessoa.id === operadorId) : null;
  const destaque = individual ? (eu ?? lista[0]) : resultado?.equipes[0];
  const acima = eu ? lista.find(p => p.posicao === eu.posicao - 1) : null;
  const distancia = eu?.meta && acima?.meta ? Math.max(0, acima.progresso - eu.progresso) : null;
  const restam = diasRestantes(desafio.dataFim, hojeISO());
  const encerrado = desafio.status === 'encerrado' || desafio.dataFim < hojeISO();
  const periodo = encerrado ? 'Encerrado' : restam > 0 ? `${restam} ${restam === 1 ? 'dia restante' : 'dias restantes'}` : 'Último dia';
  const carregandoInicial = carregando && (!resultado || !resultado.totalParticipantes);
  const semParticipantes = !resultado || resultado.totalParticipantes === 0;

  return (
    <Dialog.Root open={aberto} onOpenChange={v => { if (!v) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="veu-desfocado fixed inset-0 z-50 bg-black/30 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 motion-reduce:animate-none" />
        <Dialog.Content
          aria-label={`Andamento do desafio ${desafio.nome}`}
          onOpenAutoFocus={() => { focoAnterior.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; }}
          onCloseAutoFocus={e => { e.preventDefault(); focoAnterior.current?.focus(); }}
          className="fixed inset-y-0 right-0 z-50 flex w-[680px] max-w-[calc(100vw-2rem)] flex-col border-l border-border bg-background shadow-2xl outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right data-[state=open]:duration-300 data-[state=closed]:duration-200 motion-reduce:animate-none"
        >
          <header className="shrink-0 border-b border-border bg-card px-6 py-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <span className={cn('inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em]', tema.destaque)}>
                <Icone className="h-4 w-4" aria-hidden="true" /> Desafios
              </span>
              <Dialog.Close aria-label="Fechar desafios" className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <X className="h-4 w-4" aria-hidden="true" />
              </Dialog.Close>
            </div>
            <Dialog.Title className="text-xl font-semibold tracking-tight text-foreground">{desafio.nome}</Dialog.Title>
            <Dialog.Description className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              {projecao ? 'Classificação pelo percentual da projeção' : rotuloCriterio(desafio.regra.criterioRanking)}
            </Dialog.Description>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />{dataBR(desafio.dataInicio)} — {dataBR(desafio.dataFim)}</span>
              <span className={cn('rounded-full border px-2.5 py-1 font-medium', encerrado ? 'border-border' : tema.selo)}>{periodo}</span>
            </div>
          </header>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-5">
            {erro ? (
              <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">Não foi possível carregar o desafio. Feche e abra o painel para tentar novamente.</p>
            ) : carregandoInicial ? (
              <div role="status" aria-label="Carregando desafio" className="space-y-4">
                <Skeleton className="h-20 rounded-xl" /><Skeleton className="h-72 rounded-2xl" /><Skeleton className="h-40 rounded-2xl" />
              </div>
            ) : (
              <>
                <dl className="grid grid-cols-3 divide-x divide-border rounded-xl border border-border bg-card py-4">
                  <div className="px-4">
                    <dt className="text-[10px] font-medium text-muted-foreground">Participantes</dt>
                    <dd className="mt-1 flex items-center gap-2 text-lg font-semibold tabular-nums text-foreground"><Users className="h-4 w-4 text-muted-foreground" aria-hidden="true" />{resultado?.totalParticipantes ?? 0}</dd>
                  </div>
                  <div className="px-4">
                    <dt className="text-[10px] font-medium text-muted-foreground">{individual ? 'Sua posição' : 'Equipes'}</dt>
                    <dd className="mt-1 text-lg font-semibold tabular-nums text-foreground">{individual ? (eu ? `${eu.posicao}º` : '—') : resultado?.totalEquipes ?? 0}</dd>
                  </div>
                  <div className="px-4">
                    <dt className="text-[10px] font-medium text-muted-foreground">{projecao ? (eu ? 'Sua projeção' : 'Maior projeção') : 'Total recebido'}</dt>
                    <dd className={cn('mt-1 break-words font-semibold tabular-nums', projecao ? 'text-lg' : 'text-sm', tema.destaque)}>
                      {projecao ? (destaque?.meta ? percentualCheio(destaque.progresso) : '—') : formatBRL(resultado?.totalRecebido ?? 0)}
                    </dd>
                  </div>
                </dl>

                {eu && (
                  <div className={cn('flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-xs', tema.selo)}>
                    <TrendingUp className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <div className="leading-relaxed">
                      <p className="font-semibold">{eu.posicao === 1 ? 'Você está na liderança' : `Você está em ${eu.posicao}º lugar`}</p>
                      {projecao ? (
                        !eu.meta ? <p>Sua equipe ainda não tem meta para calcular a projeção.</p>
                          : distancia !== null && distancia > 0 && <p>{percentualCheio(distancia).replace('%', '')} p.p. para alcançar o {acima!.posicao}º lugar.</p>
                      ) : eu.paraUltrapassar !== null && eu.paraUltrapassar > 0 ? (
                        <p>{formatBRL(eu.paraUltrapassar)} para alcançar o {eu.posicao - 1}º lugar.</p>
                      ) : null}
                    </div>
                  </div>
                )}

                {desafio.descricao && <p className="text-xs leading-relaxed text-muted-foreground">{desafio.descricao}</p>}
                {!desafio.regra.premios.length && desafio.premio && (
                  <p className="flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-400/5 p-3 text-xs text-foreground"><Gift className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />{desafio.premio}</p>
                )}

                {semParticipantes ? (
                  <p className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">Nenhum participante neste recorte do desafio.</p>
                ) : (
                  <>
                    {individual && <ClassificacaoDesafio
                      lista={lista} premios={desafio.regra.premios} tema={tema}
                      mostrarFotos={desafio.visual.mostrarFotos} animar={desafio.visual.animarUltrapassagem}
                      voceId={operadorId} corridaDeProjecao={projecao} compacto
                    />}
                    {desafio.regra.modo.includes('equipe') && !!resultado?.equipes.length && (
                      <section aria-label="Disputa entre equipes" className="space-y-3">
                        <h3 className="text-sm font-semibold text-foreground">Disputa entre equipes</h3>
                        <RankingEquipes equipes={resultado.equipes} tema={tema} mostrarFotos={desafio.visual.mostrarFotos} animar={desafio.visual.animarUltrapassagem} voceId={operadorId} corridaDeProjecao={projecao} />
                      </section>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
