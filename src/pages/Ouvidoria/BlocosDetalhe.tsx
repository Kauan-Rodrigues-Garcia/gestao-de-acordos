/**
 * BlocosDetalhe — os blocos de ação da gaveta de uma manifestação:
 *
 *   BlocoRetornoAgendado  o retorno marcado: quando, quanto falta, feito/cancelar.
 *   BlocoResponsaveis     primário (quem registrou) → encaminhado (quem analisa),
 *                         com ciência, resposta e «vi a resposta».
 *   BlocoTicket           precisa de ticket? o texto pronto, copiar, «abri».
 *   BlocoGrupo            em qual grupo está; mover para um ou tirar.
 *   BlocoMesmoCliente     outras manifestações com o mesmo código do cliente.
 */
import { useState } from 'react';
import {
  AlarmClock, ArrowRight, CheckCheck, CheckCircle2, Copy, Eye, Layers, Loader2, Ticket, UsersRound, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { AvatarChat } from '@/components/Chat/comum';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useAgora } from '@/hooks/useAgora';
import { contemCpf } from '@/lib/cpf';
import { cn } from '@/lib/utils';
import {
  acaoTicket, agendarRetorno, encaminhamento, moverParaGrupo, retornoDado,
} from '@/services/ouvidoriaCofen.service';
import { AgendarRetorno } from './AgendarRetorno';
import { CampoLista } from './campos';
import { useOuvidoria } from './contexto';
import { copiarTexto } from './copiar';
import {
  ANTECEDENCIA_MINUTOS, dataBr, faltaBr, quandoBr, rotuloAssunto, situacaoEncaminhamento, temRetornoAgendado,
  textoTicket, urgenciaRetorno, type Manifestacao,
} from './ouvidoria';
import { SeloEncaminhamento, SeloStatus } from './visual';

/** `2026-11-06T14:02:00Z` → `06/11 às 11:02` (Brasília). */
function quando(iso: string): string {
  const d = new Date(iso);
  const dia = d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' });
  const hora = d.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
  return `${dia} às ${hora}`;
}

function Bloco({ titulo, icone: Icone, children, className, acao }: {
  titulo: string; icone: typeof AlarmClock; children: React.ReactNode; className?: string; acao?: React.ReactNode;
}) {
  return (
    <section className={cn('px-5 py-3.5 border-b space-y-2.5', className)}>
      <div className="flex items-center gap-2">
        <Icone className="h-3.5 w-3.5 text-muted-foreground" />
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex-1">{titulo}</h3>
        {acao}
      </div>
      {children}
    </section>
  );
}

/** Roda uma ação do banco com «ocupado», toast e releitura. */
function useAcao() {
  const { recarregar } = useOuvidoria();
  const [ocupado, setOcupado] = useState<string | null>(null);
  async function rodar(chave: string, fn: () => Promise<unknown>, ok?: string): Promise<boolean> {
    setOcupado(chave);
    try {
      await fn();
      if (ok) toast.success(ok);
      recarregar();
      return true;
    } catch (err) {
      toast.error((err as Error).message);
      return false;
    } finally {
      setOcupado(null);
    }
  }
  return { ocupado, rodar };
}

// ── Retorno agendado ─────────────────────────────────────────────────────────

export function BlocoRetornoAgendado({ m }: { m: Manifestacao }) {
  const { recarregar } = useOuvidoria();
  const agora = useAgora();
  const { ocupado, rodar } = useAcao();
  if (!temRetornoAgendado(m)) return null;
  const u = urgenciaRetorno(m.retorno_agendado_em, agora);
  const quente = u === 'agora' || u === 'atrasado';

  return (
    <section className={cn('px-5 py-3 border-b', quente ? 'bg-destructive/10' : 'bg-info/5')}>
      <div className="flex flex-wrap items-center gap-3">
        <span className={cn(
          'h-9 w-9 rounded-lg flex items-center justify-center shrink-0',
          quente ? 'bg-destructive text-destructive-foreground animate-ouvidoria-pisca' : 'bg-info/15 text-info',
        )}>
          <AlarmClock className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className={cn('text-sm font-semibold', quente && 'text-destructive')}>
            {u === 'atrasado' ? `Retorno atrasado ${faltaBr(m.retorno_agendado_em, agora)}`
              : `Retorno agendado ${quandoBr(m.retorno_agendado_em, agora)}`}
            {u === 'agora' && ` · ${faltaBr(m.retorno_agendado_em, agora)}`}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {[m.retorno_agendado_nota, m.retorno_agendado_por_nome ? `agendado por ${m.retorno_agendado_por_nome}` : null,
              u === 'hoje' || u === 'depois' ? `aviso ${ANTECEDENCIA_MINUTOS} min antes` : null].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button size="sm" className="h-8 text-xs" disabled={!!ocupado}
                  onClick={() => void rodar('feito', () => retornoDado(m.id, null), 'Retorno registrado.')}>
            {ocupado === 'feito' ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1" />}
            Retorno feito
          </Button>
          <AgendarRetorno m={m} aoMudar={recarregar}>
            <Button size="sm" variant="outline" className="h-8 text-xs">Reagendar</Button>
          </AgendarRetorno>
          <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Cancelar o agendamento" disabled={!!ocupado}
                  onClick={() => void rodar('cancelar', () => agendarRetorno(m.id, null, null), 'Agendamento cancelado.')}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </section>
  );
}

// ── Responsáveis ─────────────────────────────────────────────────────────────

export function BlocoResponsaveis({ m }: { m: Manifestacao }) {
  const { meuId, pessoas, v2 } = useOuvidoria();
  const { ocupado, rodar } = useAcao();
  const [resposta, setResposta] = useState('');
  const s = situacaoEncaminhamento(m);
  const souEncaminhado = !!meuId && m.responsavel_id === meuId && s !== 'sem';
  const souPrimario = !!meuId && m.criado_por === meuId;
  const foto = (id: string | null) => pessoas.find(p => p.perfil_id === id)?.foto_url ?? null;

  async function responder() {
    if (!resposta.trim()) return;
    if (contemCpf(resposta)) { toast.error('A resposta tem um CPF. CPF não pode ser gravado no sistema.'); return; }
    if (await rodar('responder', () => encaminhamento(m.id, 'responder', resposta.trim()), 'Resposta enviada.')) setResposta('');
  }

  return (
    <Bloco titulo="Responsáveis" icone={ArrowRight}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="inline-flex items-center gap-1.5 min-w-0">
          <AvatarChat nome={m.criado_por_nome ?? '?'} foto={foto(m.criado_por)} tamanho={22} />
          <span className="min-w-0">
            <span className="font-medium">{m.criado_por_nome ?? '—'}</span>
            <span className="block text-[10px] text-muted-foreground leading-tight">primário · registrou</span>
          </span>
        </span>
        {s !== 'sem' && (
          <>
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="inline-flex items-center gap-1.5 min-w-0">
              <AvatarChat nome={m.responsavel_nome ?? '?'} foto={foto(m.responsavel_id)} tamanho={22} />
              <span className="min-w-0">
                <span className="font-medium">{m.responsavel_nome}</span>
                <span className="block text-[10px] text-muted-foreground leading-tight">análise · encaminhado</span>
              </span>
            </span>
            <SeloEncaminhamento m={m} className="ml-auto" />
          </>
        )}
      </div>
      {s !== 'sem' && v2 && (
        <p className="text-[11px] text-muted-foreground">
          {[
            m.responsavel_encaminhado_em ? `Encaminhada ${quando(m.responsavel_encaminhado_em)}` : null,
            m.responsavel_ciente_em ? `ciente ${quando(m.responsavel_ciente_em)}` : 'ainda sem ciência',
            m.responsavel_respondeu_em ? `respondeu ${quando(m.responsavel_respondeu_em)}` : null,
          ].filter(Boolean).join(' · ')}
        </p>
      )}
      {s === 'sem' && (
        <p className="text-[11px] text-muted-foreground">Não foi encaminhada. Para passar para alguém acima, use Editar › Encaminhar para.</p>
      )}

      {v2 && souEncaminhado && s === 'aguardando' && (
        <Button size="sm" className="h-8 text-xs animate-ouvidoria-pisca-ambar" disabled={!!ocupado}
                onClick={() => void rodar('ciente', () => encaminhamento(m.id, 'ciente'), 'Ciência registrada.')}>
          {ocupado === 'ciente' ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <CheckCheck className="h-3.5 w-3.5 mr-1" />}
          Estou ciente
        </Button>
      )}
      {v2 && souEncaminhado && (
        <div className="flex gap-2">
          <Textarea rows={2} value={resposta} onChange={ev => setResposta(ev.target.value)} className="text-sm"
                    placeholder={`Responder para ${m.criado_por_nome ?? 'quem encaminhou'} (a análise, o que fazer)`} />
          <Button size="sm" className="self-end" disabled={!resposta.trim() || !!ocupado} onClick={() => void responder()}>
            {ocupado === 'responder' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Responder'}
          </Button>
        </div>
      )}
      {v2 && souPrimario && s === 'respondida' && !m.responsavel_resposta_vista_em && (
        <div className="flex items-center gap-2 rounded-lg bg-success/10 border border-success/30 px-3 py-2">
          <p className="text-xs flex-1"><strong>{m.responsavel_nome}</strong> respondeu. A resposta está na linha do tempo.</p>
          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!!ocupado}
                  onClick={() => void rodar('visto', () => encaminhamento(m.id, 'visto'))}>
            <Eye className="h-3 w-3 mr-1" /> Ok, vi
          </Button>
        </div>
      )}
    </Bloco>
  );
}

// ── Ticket ───────────────────────────────────────────────────────────────────

/** O texto do ticket com Copiar, para a gaveta e para a aba Tickets pendentes. */
export function TextoTicket({ texto, compacto }: { texto: string; compacto?: boolean }) {
  return (
    <div className="relative">
      <pre className={cn(
        'whitespace-pre-wrap break-words rounded-lg border bg-muted/40 p-3 pr-10 font-mono text-[11px] leading-relaxed overflow-y-auto',
        compacto ? 'max-h-40' : 'max-h-72',
      )}>
        {texto}
      </pre>
      <Button type="button" size="icon" variant="ghost" className="absolute top-1.5 right-1.5 h-7 w-7"
              aria-label="Copiar o texto do ticket" onClick={() => void copiarTexto(texto)}>
        <Copy className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

/** «Abri o ticket»: o número (opcional) e confirmar. */
export function AbrirTicket({ m, aoAbrir }: { m: Manifestacao; aoAbrir?: () => void }) {
  const { ocupado, rodar } = useAcao();
  const [numero, setNumero] = useState('');
  return (
    <div className="flex items-center gap-1.5">
      <Input value={numero} onChange={e => setNumero(e.target.value.slice(0, 60))} placeholder="Nº do ticket"
             className="h-8 w-32 text-xs rounded-lg font-mono"
             onKeyDown={e => { if (e.key === 'Enter') void rodar('abrir', () => acaoTicket(m.id, 'abrir', numero || null), 'Ticket marcado como aberto.').then(ok => ok && aoAbrir?.()); }} />
      <Button size="sm" className="h-8 text-xs" disabled={!!ocupado}
              onClick={() => void rodar('abrir', () => acaoTicket(m.id, 'abrir', numero || null), 'Ticket marcado como aberto.').then(ok => ok && aoAbrir?.())}>
        {ocupado === 'abrir' ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1" />}
        Abri o ticket
      </Button>
    </div>
  );
}

export function BlocoTicket({ m }: { m: Manifestacao }) {
  const { etiquetas, setor, grupos, v2 } = useOuvidoria();
  const { ocupado, rodar } = useAcao();
  if (!v2) return null;
  const grupo = grupos.find(g => g.id === m.grupo_id) ?? null;

  if (!m.ticket_status) {
    return (
      <Bloco titulo="Ticket no Mundial" icone={Ticket}
             acao={
               <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!!ocupado}
                       onClick={() => void rodar('pedir', () => acaoTicket(m.id, 'pedir'), 'Marcada para abrir ticket.')}>
                 {ocupado === 'pedir' && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                 Precisa de ticket
               </Button>
             }>
        <p className="text-[11px] text-muted-foreground">Sem ticket. Marque se precisa pedir algo à TI ou ao setor responsável.</p>
      </Bloco>
    );
  }

  const texto = textoTicket(m, { etiquetas, setorNome: setor.setor_nome, grupo });
  return (
    <Bloco titulo="Ticket no Mundial" icone={Ticket}
           className={m.ticket_status === 'pendente' ? 'bg-orange-500/5' : undefined}
           acao={
             <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" disabled={!!ocupado}
                     onClick={() => void rodar('cancelar', () => acaoTicket(m.id, 'cancelar'), 'Ticket desmarcado.')}>
               Não precisa
             </Button>
           }>
      {m.ticket_status === 'pendente' ? (
        <>
          <p className="text-xs font-semibold text-orange-700 dark:text-orange-300">Pendente: falta abrir o ticket. Copie o texto e cole no Mundial.</p>
          <TextoTicket texto={texto} compacto />
          <AbrirTicket m={m} />
        </>
      ) : (
        <>
          <p className="text-xs">
            <CheckCircle2 className="h-3.5 w-3.5 inline mr-1 text-success" />
            Ticket aberto{m.ticket_numero ? <> nº <strong className="font-mono">{m.ticket_numero}</strong></> : ''}
            {m.ticket_aberto_em ? ` em ${quando(m.ticket_aberto_em)}` : ''}
            {m.ticket_aberto_por_nome ? ` por ${m.ticket_aberto_por_nome}` : ''}.
          </p>
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Ver o texto do ticket</summary>
            <div className="mt-2"><TextoTicket texto={texto} compacto /></div>
          </details>
        </>
      )}
    </Bloco>
  );
}

// ── Grupo ────────────────────────────────────────────────────────────────────

export function BlocoGrupo({ m, aoAbrirGrupo }: { m: Manifestacao; aoAbrirGrupo: (id: string) => void }) {
  const { grupos, v2 } = useOuvidoria();
  const { ocupado, rodar } = useAcao();
  if (!v2) return null;
  const grupo = grupos.find(g => g.id === m.grupo_id) ?? null;
  const abertos = grupos.filter(g => !g.encerrado_em && g.id !== m.grupo_id);

  return (
    <Bloco titulo="Grupo" icone={Layers}>
      {grupo ? (
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => aoAbrirGrupo(grupo.id)}
                  className="min-w-0 flex-1 text-left rounded-lg border border-violet-500/30 bg-violet-500/5 px-3 py-2 hover:bg-violet-500/10">
            <p className="text-sm font-medium truncate">{grupo.codigo} · {grupo.titulo}</p>
            <p className="text-[11px] text-muted-foreground">{rotuloAssunto(grupo.assunto)}{grupo.encerrado_em ? ' · encerrado' : ''}</p>
          </button>
          <Button size="sm" variant="ghost" className="h-8 text-xs" disabled={!!ocupado}
                  onClick={() => void rodar('tirar', () => moverParaGrupo(m.id, null), 'Saiu do grupo.')}>
            Tirar do grupo
          </Button>
        </div>
      ) : abertos.length ? (
        <CampoLista valor="" vazio="Mover para um grupo…" rotulo="Mover para um grupo" desligado={!!ocupado}
                    aoMudar={v => { if (v) void rodar('mover', () => moverParaGrupo(m.id, v), 'Movida para o grupo.'); }}
                    opcoes={abertos.map(g => ({ valor: g.id, rotulo: `${g.codigo} · ${g.titulo}`, marca: <Layers className="h-3.5 w-3.5 text-violet-500" /> }))} />
      ) : (
        <p className="text-[11px] text-muted-foreground">Fora de grupo. Crie um na aba «Grupos» para juntar reclamações iguais.</p>
      )}
    </Bloco>
  );
}

// ── Mesmo cliente ────────────────────────────────────────────────────────────

export function BlocoMesmoCliente({ m }: { m: Manifestacao }) {
  const { todas, abrirManifestacao } = useOuvidoria();
  if (!m.codigo_cliente) return null;
  const outras = todas.filter(x => x.id !== m.id && x.codigo_cliente === m.codigo_cliente)
    .sort((a, b) => b.data_manifestacao.localeCompare(a.data_manifestacao));
  if (!outras.length) return null;
  return (
    <Bloco titulo={`Outras deste cliente (${outras.length})`} icone={UsersRound}>
      <ul className="space-y-1">
        {outras.slice(0, 6).map(o => (
          <li key={o.id}>
            <button type="button" onClick={() => abrirManifestacao(o.id)}
                    className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-muted">
              <span className="font-mono text-[11px] font-semibold">{o.codigo}</span>
              <span className="text-[11px] text-muted-foreground">{dataBr(o.data_manifestacao)}</span>
              <span className="text-xs truncate flex-1">{rotuloAssunto(o.assunto)}</span>
              {o.acompanhar ? <SeloStatus status={o.status} /> : <span className="text-[10px] text-muted-foreground">Histórico</span>}
            </button>
          </li>
        ))}
      </ul>
    </Bloco>
  );
}
