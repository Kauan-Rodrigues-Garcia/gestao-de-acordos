/**
 * PainelTickets — a aba «Tickets pendentes»: as manifestações marcadas
 * «precisa abrir ticket» que ainda não foram abertas no sistema Mundial.
 *
 * Cada uma traz o texto padrão pronto (`textoTicket`) para copiar e colar, e o
 * «Abri o ticket» (com o número) tira da lista. Embaixo, os abertos nos
 * últimos 30 dias, para conferir o número depois.
 */
import { useState } from 'react';
import { ChevronDown, CheckCircle2, Copy, Layers, Ticket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AbrirTicket, TextoTicket } from './BlocosDetalhe';
import { useOuvidoria } from './contexto';
import { copiarTexto } from './copiar';
import { dataBr, rotuloAssunto, textoTicket, textoTicketGrupo, type Manifestacao } from './ouvidoria';

export function PainelTickets({ pendentes }: { pendentes: readonly Manifestacao[] }) {
  const { todas, etiquetas, setor, grupos, abrirManifestacao } = useOuvidoria();
  const [verAbertos, setVerAbertos] = useState(false);
  const limite = Date.now() - 30 * 86_400_000;
  const abertos = todas
    .filter(m => m.ticket_status === 'aberto' && m.ticket_aberto_em && Date.parse(m.ticket_aberto_em) >= limite)
    .sort((a, b) => (b.ticket_aberto_em ?? '').localeCompare(a.ticket_aberto_em ?? ''));

  // Grupo com mais de um pendente: dá para abrir um ticket só para todos.
  const porGrupo = new Map<string, Manifestacao[]>();
  for (const m of pendentes) if (m.grupo_id) porGrupo.set(m.grupo_id, [...(porGrupo.get(m.grupo_id) ?? []), m]);
  const gruposJuntos = [...porGrupo.entries()].filter(([, l]) => l.length > 1);

  return (
    <div className="p-3 space-y-3">
      {pendentes.length === 0 ? (
        <div className="py-12 text-center space-y-2">
          <CheckCircle2 className="h-8 w-8 mx-auto text-success/60" />
          <p className="text-sm font-medium">Nenhum ticket pendente.</p>
          <p className="text-xs text-muted-foreground">Marque «Precisa abrir ticket» na manifestação para ela aparecer aqui com o texto pronto.</p>
        </div>
      ) : (
        <>
          <p className="text-xs text-muted-foreground px-1">
            Copie o texto, abra o ticket no Mundial e clique em «Abri o ticket» com o número. O texto segue um modelo
            padrão: assunto, profissional, anuidades, relato, providência e o que pedir.
          </p>

          {gruposJuntos.map(([gid, membros]) => {
            const g = grupos.find(x => x.id === gid);
            if (!g) return null;
            return (
              <div key={gid} className="rounded-xl border border-violet-500/40 bg-violet-500/5 p-3 flex flex-wrap items-center gap-3">
                <Layers className="h-4 w-4 text-violet-600 dark:text-violet-400 shrink-0" />
                <p className="text-sm flex-1 min-w-0">
                  <strong>{membros.length} pendentes do grupo {g.codigo}</strong> · {g.titulo}. Dá para abrir um ticket só para todos.
                </p>
                <Button size="sm" variant="outline" className="h-8 text-xs"
                        onClick={() => void copiarTexto(textoTicketGrupo(g, membros, { etiquetas, setorNome: setor.setor_nome }))}>
                  <Copy className="h-3.5 w-3.5 mr-1" /> Copiar ticket do grupo
                </Button>
              </div>
            );
          })}

          <ul className="space-y-3">
            {pendentes.map(m => {
              const grupo = grupos.find(g => g.id === m.grupo_id) ?? null;
              return (
                <li key={m.id} className="rounded-xl border bg-card overflow-hidden">
                  <div className="flex flex-wrap items-center gap-2 px-3.5 py-2.5 border-b bg-orange-500/5">
                    <Ticket className="h-4 w-4 text-orange-600 shrink-0" />
                    <button type="button" onClick={() => abrirManifestacao(m.id)} className="min-w-0 flex-1 text-left hover:underline">
                      <span className="font-mono text-xs font-semibold">{m.codigo}</span>
                      <span className="text-sm font-medium"> · {m.nome_profissional}</span>
                      <span className="text-xs text-muted-foreground"> · {rotuloAssunto(m.assunto)} · {dataBr(m.data_manifestacao)}</span>
                    </button>
                    {grupo && <span className="text-[10px] rounded-md bg-violet-500/10 text-violet-700 dark:text-violet-300 px-1.5 py-px font-semibold">{grupo.codigo}</span>}
                  </div>
                  <div className="p-3.5 space-y-2.5">
                    <TextoTicket texto={textoTicket(m, { etiquetas, setorNome: setor.setor_nome, grupo })} />
                    <div className="flex flex-wrap items-center gap-2">
                      <Button size="sm" variant="outline" className="h-8 text-xs"
                              onClick={() => void copiarTexto(textoTicket(m, { etiquetas, setorNome: setor.setor_nome, grupo }))}>
                        <Copy className="h-3.5 w-3.5 mr-1" /> Copiar texto
                      </Button>
                      <div className="flex-1" />
                      <AbrirTicket m={m} />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {abertos.length > 0 && (
        <div className="rounded-xl border">
          <button type="button" onClick={() => setVerAbertos(v => !v)}
                  className="w-full flex items-center gap-2 px-3.5 py-2.5 text-sm font-medium text-left">
            <CheckCircle2 className="h-4 w-4 text-success" />
            <span className="flex-1">Abertos nos últimos 30 dias ({abertos.length})</span>
            <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', verAbertos && 'rotate-180')} />
          </button>
          {verAbertos && (
            <ul className="divide-y border-t">
              {abertos.map(m => (
                <li key={m.id}>
                  <button type="button" onClick={() => abrirManifestacao(m.id)}
                          className="w-full flex flex-wrap items-center gap-2 px-3.5 py-2 text-left hover:bg-muted/40">
                    <span className="font-mono text-xs font-semibold">{m.codigo}</span>
                    <span className="text-sm truncate flex-1 min-w-0">{m.nome_profissional}</span>
                    <span className="text-xs font-mono">{m.ticket_numero ? `nº ${m.ticket_numero}` : 'sem número'}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {m.ticket_aberto_em ? new Date(m.ticket_aberto_em).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : ''}{m.ticket_aberto_por_nome ? ` · ${m.ticket_aberto_por_nome}` : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
