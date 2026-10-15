/**
 * AutorizacoesChat.tsx — a conversa fixa «Autorizações» do chat.
 *
 * Pedido do Cleber, 15/10/2026: o botão de autorizações no canto da tela
 * atrapalhava e líder não o achava. Os pedidos passam a chegar no chat, numa
 * conversa própria do setor — não na conversa com o operador:
 *
 *   • aparece para quem decide (líder, elite e gerência do setor; diretoria,
 *     administração e super_admin veem a empresa) — a policy do banco recorta;
 *   • não se apaga e não tem menu: é a fila do setor, não uma conversa;
 *   • sobe para o topo enquanto houver pedido esperando, com o aviso aceso até
 *     alguém decidir, mesmo depois de vista;
 *   • quem decidir primeiro decide por todos — o banco trava, e a lista de
 *     todos se atualiza pelo sinal `autorizacoes`;
 *   • o setor é o do perfil HOJE: o líder transferido do Play 3 para o Play 2
 *     passa a ver só o Play 2, porque a regra é calculada na hora no banco.
 *
 * As regras da lista (posição, prévia, pedido novo) estão em
 * `components/Autorizacoes/resumoChat.ts`; o cartão de cada pedido, com aprovar
 * e recusar, em `components/Autorizacoes/CartaoAutorizacao.tsx`.
 */
import { useMemo } from 'react';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CartaoAutorizacao } from '@/components/Autorizacoes/CartaoAutorizacao';
import { EscudoAutorizacoes as Escudo } from '@/components/Autorizacoes/EscudoAutorizacoes';
import { estaPendente, type ResumoAutorizacoes } from '@/components/Autorizacoes/resumoChat';
import type { PedidoAutorizacao } from '@/services/autorizacaoPedidos.service';
import { horaCurta, rotuloDoDia } from './formatos';

export interface AutorizacoesNoChat {
  titulo:     string;
  resumo:     ResumoAutorizacoes;
  selecionada: boolean;
  onAbrir:    () => void;
}

/** A linha na lista de conversas. Sem menu: não se apaga nem se desafixa. */
export function LinhaAutorizacoes({ titulo, resumo, selecionada, onAbrir }: AutorizacoesNoChat) {
  const pendente = resumo.pendentes > 0;
  return (
    <button type="button" onClick={onAbrir}
      className={cn(
        'w-full grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 px-3 py-2.5 text-left transition-colors',
        selecionada ? 'bg-muted' : pendente ? 'bg-amber-500/[0.07] hover:bg-amber-500/[0.12]' : 'hover:bg-muted/50',
      )}>
      <Escudo tamanho={40} alerta={pendente} />
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{titulo}</p>
        <p className={cn('truncate text-xs', pendente ? 'font-medium text-amber-700 dark:text-amber-400' : 'text-muted-foreground')}>
          {resumo.previa}
        </p>
      </div>
      <span className="flex min-w-[30px] shrink-0 flex-col items-end gap-0.5 self-stretch justify-center">
        <span className="text-[10px] text-muted-foreground">{horaCurta(resumo.ultimaEm)}</span>
        {pendente && (
          <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white"
            aria-label={`${resumo.pendentes} ${resumo.pendentes === 1 ? 'autorização pendente' : 'autorizações pendentes'}`}>
            {resumo.pendentes > 99 ? '99+' : resumo.pendentes}
          </span>
        )}
      </span>
    </button>
  );
}

interface PainelProps {
  titulo:   string;
  pedidos:  PedidoAutorizacao[];
  meuId:    string | null;
  /** Quem olha pode decidir este pedido? (`tornar_direto` tem chave própria.) */
  podeDecidir: (p: PedidoAutorizacao) => boolean;
  onDecidido:  () => void;
  expandido:   boolean;
  onVoltar:    () => void;
}

/** A conversa aberta: os pedidos esperando em cima, o histórico embaixo. */
export function PainelAutorizacoes({
  titulo, pedidos, meuId, podeDecidir, onDecidido, expandido, onVoltar,
}: PainelProps) {
  const agora = Date.now();
  const pendentes = useMemo(
    () => pedidos.filter((p) => estaPendente(p, agora)).sort((a, b) => a.criado_em.localeCompare(b.criado_em)),
    [pedidos, agora],
  );
  // O histórico por dia, do mais novo para o mais antigo.
  const historico = useMemo(() => {
    const dias = new Map<string, PedidoAutorizacao[]>();
    const decididos = pedidos
      .filter((p) => !estaPendente(p, agora))
      .sort((a, b) => (b.decidido_em ?? b.criado_em).localeCompare(a.decidido_em ?? a.criado_em));
    for (const p of decididos) {
      const dia = rotuloDoDia(p.decidido_em ?? p.criado_em);
      dias.set(dia, [...(dias.get(dia) ?? []), p]);
    }
    return [...dias.entries()];
  }, [pedidos, agora]);

  const cartao = (p: PedidoAutorizacao) => (
    <CartaoAutorizacao key={p.id} pedido={p} souAutorizador={podeDecidir(p)} meuId={meuId} onDecidido={onDecidido} />
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center gap-2.5 border-b border-border px-3 py-2.5">
        {!expandido && (
          <button onClick={onVoltar} aria-label="Voltar para a lista"
            className="-ml-1 rounded p-1 transition-colors hover:bg-muted pointer-coarse:-ml-2 pointer-coarse:p-2">
            <ArrowLeft className="h-4 w-4 pointer-coarse:h-5 pointer-coarse:w-5" />
          </button>
        )}
        <Escudo tamanho={34} alerta={pendentes.length > 0} />
        <p className="min-w-0 truncate text-sm font-semibold">{titulo}</p>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-muted/20 p-3">
        {pendentes.length > 0 && (
          <section className="space-y-2" aria-label="Aguardando decisão">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400">
              <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
              {pendentes.length === 1 ? '1 aguardando decisão' : `${pendentes.length} aguardando decisão`}
            </p>
            {pendentes.map(cartao)}
          </section>
        )}

        {historico.map(([dia, lista]) => (
          <section key={dia} className="space-y-2" aria-label={`Decididas · ${dia}`}>
            <p className="text-center">
              <span className="rounded-full bg-background px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground shadow-sm">{dia}</span>
            </p>
            {lista.map(cartao)}
          </section>
        ))}

        {pedidos.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <Escudo tamanho={48} alerta={false} />
            <p className="text-sm font-medium">Nenhum pedido de autorização</p>
            <p className="text-xs text-muted-foreground">
              Quando alguém do setor pedir para registrar um acordo de outra pessoa, o pedido chega aqui e você é avisado.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
