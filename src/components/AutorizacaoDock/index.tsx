/**
 * AutorizacaoDock — a etiqueta no canto da tela, em qualquer tela.
 *
 * ## Desde 15/10/2026, só a reserva
 *
 * As autorizações moram no CHAT: a conversa fixa «Autorizações» do setor
 * (`components/Chat/AutorizacoesChat`). O botão no canto atrapalhava a tela e
 * líder não o achava (Cleber). Esta gaveta só aparece para quem pode autorizar
 * e NÃO tem o chat — chat fechado pelo painel ou pela trava `chat_config` —,
 * para ninguém ficar sem onde decidir.
 *
 * ## Por que não é uma página
 *
 * Autorizar é uma interrupção: o operador está parado esperando. Uma rota
 * própria obrigaria o líder a sair do que estava fazendo, decidir e voltar —
 * e é exatamente esse ir-e-voltar que o fluxo antigo (levantar e ir até a
 * máquina do operador) já custava. A gaveta abre por cima, decide e fecha.
 *
 * ## Quem vê
 *
 * Ninguém decide isso aqui: a gaveta mostra o que `autorizacoes_pedidos`
 * devolver, e a policy da tabela já recorta — líder, elite e gerência veem o
 * próprio setor; diretoria, administrador e super_admin veem a empresa.
 * O solicitante vê o próprio pedido, e para ele a gaveta é o acompanhamento.
 *
 * Sem nada para mostrar, o componente não renderiza: uma etiqueta permanente
 * com "0" ocuparia o canto da tela de todo operador para nunca dizer nada.
 *
 * ## Aprovar não tem desfazer
 *
 * Aprovar apaga o acordo de alguém e cria outro no lugar. Por isso o botão de
 * aprovar exige uma segunda confirmação NA PRÓPRIA LINHA, com o nome de quem
 * perde o acordo escrito nela — e não um `confirm()`, que a pessoa fecha no
 * automático sem ler.
 */

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ShieldQuestion, X, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useAutorizacaoPedidos } from '@/hooks/useAutorizacaoPedidos';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { useEstadoLembrado } from '@/hooks/useEstadoLembrado';
import { chaveDeCache } from '@/lib/cacheInstantaneo';
import type { PedidoAutorizacao } from '@/services/autorizacaoPedidos.service';
import { possoUsarOChat } from '@/services/chat/chat.service';
import { CartaoAutorizacao } from '@/components/Autorizacoes/CartaoAutorizacao';

interface PropsDock {
  /**
   * Quanto recuar da esquerda, em pixels, para não invadir o menu lateral.
   *
   * Só o `Layout` sabe a largura do momento — o menu recolhe e expande, e o
   * dock é `fixed`, fora do fluxo. Vale só a partir de `md`: abaixo disso o
   * menu não ocupa espaço.
   */
  recuoEsquerda?: number;
}

export function AutorizacaoDock({ recuoEsquerda = 16 }: PropsDock = {}) {
  const { perfil } = useAuth();
  const { temPermissao } = useCargoPermissoes();
  // Pergunta ao painel, e não ao cargo. `autorizacao_lider.service` confere a
  // MESMA chave com o token de quem digita a senha, e o servidor a confere de
  // novo em `fn_transferir_acordo_nr` — três checagens, uma fonte.
  const souAutorizador = temPermissao('acordos_autorizar_tabulacao');
  // Tornar DIRETO tem chave própria (30/09/2026). A gaveta abre para quem tem
  // qualquer uma das duas; cada cartão pergunta a sua.
  const souAutorizadorTornarDireto = temPermissao('acordos_autorizar_tornar_direto');
  /*
   * Quem tem chat decide pelo chat. `null` = ainda perguntando ao banco: nada
   * aparece até a resposta, para a gaveta não piscar e sumir.
   */
  const temVerChat = temPermissao('ver_chat');
  const [chatDisponivel, setChatDisponivel] = useState<boolean | null>(() => (temVerChat ? null : false));
  useEffect(() => {
    if (!temVerChat) { setChatDisponivel(false); return; }
    let vivo = true;
    void possoUsarOChat().then(ok => { if (vivo) setChatDisponivel(ok); });
    return () => { vivo = false; };
  }, [temVerChat]);
  /**
   * A gaveta é só de quem decide.
   *
   * O operador não vê etiqueta nenhuma: ele solicita, a janela fecha, e a
   * resposta chega por notificação — que é o caminho que já existe e não ocupa
   * o canto da tela dele o dia inteiro. Nada aqui seria acionável para ele.
   *
   * O hook fica desligado, e não apenas escondido: sem isso, todo operador
   * manteria um canal de realtime e uma consulta a cada evento para desenhar
   * uma janela que ele nunca abre.
   */
  const { pedidos, pendentes, recarregar } = useAutorizacaoPedidos(
    (souAutorizador || souAutorizadorTornarDireto) && !!perfil?.id && chatDisponivel === false,
  );
  /*
   * Fechada por padrão, e do jeito que a pessoa deixou.
   *
   * A gaveta abria sozinha a cada montagem: como ela vive no `Layout`, isso
   * significava toda navegação entre telas. Quem tinha acabado de fechá-la para
   * ler a tabela por baixo a via reaparecer no clique seguinte, tela após tela.
   *
   * Agora ela obedece a um clique só — o da pessoa —, e o estado atravessa a
   * navegação por `useEstadoLembrado`. O aviso de que há algo esperando não se
   * perde: continua no contador da etiqueta e no ponto pulsando ao lado dele.
   */
  const [aberta, setAberta] = useEstadoLembrado(
    chaveDeCache('autorizacao-dock', perfil?.id), false,
  );

  /**
   * Pendentes primeiro; dentro de cada grupo, o mais novo no topo.
   *
   * O decidido continua na lista **até a virada do dia** — é o registro de que
   * aquilo já foi resolvido e por quem. Quem apaga é a faxina de 00:00
   * (`fn_autorizacao_faxina`), não esta tela: uma segunda régua de tempo aqui
   * divergiria da do servidor no primeiro ajuste de horário.
   */
  const ordenados = useMemo(() => {
    const peso = (p: PedidoAutorizacao) => (p.status === 'pendente' ? 0 : 1);
    return [...pedidos].sort((a, b) =>
      peso(a) - peso(b)
      || new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime());
  }, [pedidos]);

  // O contador da etiqueta conta só o que ainda EXIGE ação. Somar os decididos
  // faria o número subir a cada decisão, que é o oposto do que ele significa.
  const qtd = pendentes.length;

  /*
   * A gaveta NÃO abre sozinha — retirado a pedido em 02/09/2026.
   *
   * O efeito que morava aqui abria a gaveta sempre que houvesse pendência, e
   * como ele dependia de `qtd` (não de «chegou algo novo»), ele disparava de
   * novo em toda montagem do componente. O componente vive no `Layout`: era uma
   * abertura por navegação, com a gaveta cobrindo o canto da tela de quem tinha
   * acabado de fechá-la.
   *
   * O aviso continua existindo, e sem tapar nada: o contador na etiqueta e o
   * ponto pulsando ao lado dele. Quem decide quando abrir é quem vai decidir.
   */
  // Nada para mostrar, nada na tela. Ver o cabeçalho.
  if (chatDisponivel !== false || ordenados.length === 0) return null;

  return (
    /*
     * Canto ESQUERDO desde 25/08/2026, mas AO LADO do menu, nunca por cima.
     *
     * Era o direito, e passou a dividir a quina com o botão do chat — duas
     * coisas que aparecem sozinhas, uma em cima da outra, e a de baixo some.
     * Autorizar e conversar são interrupções diferentes e merecem cantos
     * diferentes.
     *
     * O recuo vem de fora porque só o `Layout` sabe se o menu está aberto (240
     * px) ou recolhido (64). Abaixo de `md` o menu não existe, e aí o `left-4`
     * da classe vale — por isso o recuo entra como variável usada só no
     * `md:`, e não como `style.left`, que valeria em qualquer largura.
     */
    <div
      className="fixed bottom-4 left-4 md:left-[var(--recuo-dock)] z-50 flex flex-col items-start gap-2 print:hidden transition-[left] duration-300"
      style={{ '--recuo-dock': `${recuoEsquerda}px` } as React.CSSProperties}
    >
      <AnimatePresence>
        {aberta && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="w-[min(92vw,380px)] max-h-[min(70vh,560px)] rounded-2xl border border-border bg-background shadow-2xl overflow-hidden flex flex-col"
          >
            <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-border bg-muted/40">
              <p className="text-xs font-bold flex items-center gap-1.5">
                <ShieldQuestion className="w-4 h-4 text-primary shrink-0" />
                Autorizações
                {qtd > 0 && (
                  <span className="rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                    {qtd}
                  </span>
                )}
              </p>
              <button
                onClick={() => setAberta(false)} aria-label="Fechar autorizações"
                className="p-1 rounded-md hover:bg-muted transition-colors"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5">
              {ordenados.map(p => (
                <CartaoAutorizacao
                  key={p.id} pedido={p}
                  souAutorizador={p.modo === 'tornar_direto' ? souAutorizadorTornarDireto : souAutorizador}
                  meuId={perfil?.id ?? null}
                  onDecidido={recarregar}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* A etiqueta. Fica sempre — é por ela que a gaveta volta depois de fechada. */}
      <button
        onClick={() => setAberta(v => !v)}
        aria-expanded={aberta}
        className={cn(
          'inline-flex items-center gap-2 rounded-full pl-3 pr-3.5 py-2 shadow-lg border transition-colors',
          qtd > 0
            ? 'bg-primary text-primary-foreground border-primary hover:opacity-90'
            : 'bg-background text-muted-foreground border-border hover:bg-muted',
        )}
      >
        {aberta ? <X className="w-4 h-4" /> : <ShieldQuestion className="w-4 h-4" />}
        <span className="text-xs font-semibold">
          {qtd > 0 ? `${qtd} ${qtd > 1 ? 'autorizações' : 'autorização'}` : 'Autorizações'}
        </span>
        {qtd > 0 && !aberta && (
          <span className="w-2 h-2 rounded-full bg-primary-foreground animate-pulse" />
        )}
      </button>
    </div>
  );
}
