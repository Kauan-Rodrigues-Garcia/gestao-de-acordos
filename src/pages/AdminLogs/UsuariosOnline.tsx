/**
 * UsuariosOnline — quantas pessoas estão na planilha AGORA.
 *
 * ## De onde vem o número
 *
 * Do `PresenceProvider`, que já mantém um canal de presença por empresa e é
 * consumido pela barra lateral. Nada é buscado aqui: o componente lê o Context
 * e reage — entrar e sair de gente chega por WebSocket, sem intervalo de
 * atualização e sem uma consulta a cada N segundos.
 *
 * O provider já soma as OUTRAS empresas para quem enxerga mais de uma
 * (`onlineIdsTotal`), então o super_admin vê o total das duas operações.
 *
 * ## Por que o número é animado
 *
 * Pelo mesmo motivo do Desempenho do Dia: sem movimento, um contador que vai de
 * 12 para 13 não é percebido — e este fica ao lado de um botão «Ao vivo», onde a
 * pessoa está justamente esperando ver as coisas mudarem.
 *
 * `ValorAnimado` resolve o movimento por `useMovimentoPreferido`, e não pela
 * media query crua: nas máquinas da operação os "Efeitos de animação" do Windows
 * costumam vir desligados, e obedecer a isso deixaria o contador saltando seco
 * justamente onde ele precisa avisar.
 *
 * ## Presença não é a mesma coisa que uso
 *
 * Este número responde «quem está com a planilha aberta agora». O painel de
 * Monitoramento responde «quem usou, quanto, e em quê» — e o faz sobre
 * `uso_telas`, que mede foco de aba. Um número não confere com o outro, e não
 * deveria: alguém com a aba aberta em segundo plano está online e não está
 * usando.
 */

import { Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOnlineUsers } from '@/providers/PresenceProvider';
import { ValorAnimado } from '@/components/ValorAnimado';

export default function UsuariosOnline({ className }: { className?: string }) {
  const { onlineIds, loading } = useOnlineUsers();
  const total = onlineIds.size;

  return (
    <div
      title={
        loading
          ? 'Conectando ao canal de presença…'
          : 'Pessoas com a planilha aberta neste momento. Atualiza sozinho, por WebSocket.'
      }
      className={cn(
        'inline-flex items-center gap-2 h-8 rounded-lg border border-border bg-card px-2.5',
        className,
      )}
    >
      {/* O ponto pulsa só quando o canal está de pé: um verde parado enquanto
          conecta afirmaria um número que ainda não é confiável. */}
      <span className="relative flex h-2 w-2 shrink-0">
        {!loading && (
          <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-60 animate-ping" />
        )}
        <span className={cn(
          'relative inline-flex h-2 w-2 rounded-full',
          loading ? 'bg-muted-foreground/40' : 'bg-emerald-500',
        )} />
      </span>

      <Users className="w-3.5 h-3.5 text-muted-foreground shrink-0" />

      <ValorAnimado
        valor={total}
        formatar={v => String(Math.round(v))}
        carregando={loading}
        className="text-xs font-bold font-mono leading-none"
        classeSubindo="text-emerald-500"
        classeDescendo="text-amber-500"
        aria-label={`${total} usuário(s) online agora`}
      />

      <span className="text-[11px] text-muted-foreground leading-none">
        {total === 1 ? 'online' : 'online'}
      </span>
    </div>
  );
}
