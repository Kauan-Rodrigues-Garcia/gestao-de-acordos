/**
 * BolhaChat.tsx — o chat inteiro, no canto inferior direito.
 *
 * ## Duas larguras, e a diferença é só a lista
 *
 * Compacta: ou a lista, ou a conversa — uma de cada vez, com um «voltar».
 * Expandida: a lista à esquerda E a conversa à direita, ao mesmo tempo.
 *
 * É a régua de qualquer chat de janela, e existe por um motivo: no tamanho
 * compacto, mostrar as duas colunas deixaria 140 px para cada uma, e nenhuma
 * das duas seria utilizável.
 *
 * A largura escolhida fica no `localStorage`. Quem trabalha o dia inteiro com o
 * chat aberto não deveria reabrir a janela do jeito certo toda manhã.
 *
 * ## Onde ela mora
 *
 * Monta no `Layout`, fora de qualquer rota: conversar não é uma tela, é uma
 * interrupção que acontece em cima do que a pessoa está fazendo. Sobe acima do
 * `AutorizacaoDock`, que já ocupa o mesmo canto — ver o `bottom` mais alto.
 *
 * ## Quem vê
 *
 * `ver_chat` no painel, e a trava `chat_config` no banco por cima. Enquanto ela
 * estiver fechada só o super_admin passa — inclusive administrador fica de
 * fora. Aqui a tela só pergunta; quem decide é o banco, e a RLS recusaria de
 * qualquer jeito.
 */
import { useCallback, useEffect, useState } from 'react';
import { MessageCircle, Minus, Maximize2, Minimize2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { useChat } from '@/hooks/useChat';
import { useChatPresenca } from '@/hooks/useChatPresenca';
import { apagarConversa, possoUsarOChat } from '@/services/chat/chat.service';
import { IconeChat } from './comum';
import { ListaConversas } from './ListaConversas';
import { Conversa } from './Conversa';
import { DisparoDialog } from './DisparoDialog';
import { NovaConversaDialog } from './NovaConversaDialog';
import { BoasVindasChat } from './BoasVindasChat';
import { useToast } from '@/components/ui/use-toast';

const CHAVE_LARGURA = 'chat-expandido';

export function BolhaChat() {
  const { perfil } = useAuth();
  const { temPermissao, loading: permLoading } = useCargoPermissoes();
  const { toast } = useToast();

  const [aberto, setAberto] = useState(false);
  const [expandido, setExpandido] = useState(() => {
    try { return localStorage.getItem(CHAVE_LARGURA) === 'sim'; } catch { return false; }
  });
  const [novaConversa, setNovaConversa] = useState(false);
  const [novoDisparo, setNovoDisparo] = useState(false);
  /** Mouse ou teclado em cima do botão — acende o brilho e os pontos. */
  const [sobre, setSobre] = useState(false);

  /*
   * As boas-vindas: aparecem uma vez, antes da PRIMEIRA conversa.
   *
   * `pendente` guarda o que a pessoa ia fazer quando o cartão apareceu —
   * abrir uma conversa da lista, ou começar uma nova. Sem isso, ela leria o
   * aviso, clicaria em «Entendi» e voltaria para a lista, tendo que repetir o
   * clique. O cartão é uma pausa, não um cancelamento.
   */
  const [pendente, setPendente] = useState<
    { tipo: 'abrir'; id: string } | { tipo: 'pessoa'; id: string } | null
  >(null);
  const jaLeu = !!perfil?.chat_boas_vindas_em;

  /*
   * DUAS travas, e as duas precisam abrir.
   *
   *   `ver_chat` .......... o painel de permissões liberou este cargo
   *   `fn_chat_pode_usar` . o banco confirma — inclui a trava de lançamento
   *                         (`chat_config`) e o bloqueio por pessoa
   *
   * A segunda existe porque a primeira responde `true` para ADMINISTRADOR por
   * acesso total, e enquanto o chat estiver fechado só o super_admin entra. Sem
   * ela, o administrador abriria a bolha para uma lista vazia.
   *
   * Começa `null` = ainda não sei. Nada aparece até o banco responder: piscar a
   * bolha e sumir com ela é pior que demorar meio segundo.
   */
  const [liberadoNoBanco, setLiberadoNoBanco] = useState<boolean | null>(null);

  useEffect(() => {
    if (permLoading || !temPermissao('ver_chat')) { setLiberadoNoBanco(false); return; }
    let vivo = true;
    void possoUsarOChat().then(ok => { if (vivo) setLiberadoNoBanco(ok); });
    return () => { vivo = false; };
  }, [permLoading, temPermissao]);

  const podeVer = liberadoNoBanco === true;

  /*
   * O chat continua ligado com a janela fechada.
   *
   * É o que faz o contador aparecer sem a pessoa precisar abrir para descobrir
   * que tem mensagem. Custa uma assinatura de realtime, que já é compartilhada
   * com o resto do app.
   */
  const chat = useChat(podeVer);
  const { online, digitando, avisarDigitando } = useChatPresenca(podeVer);

  useEffect(() => {
    try { localStorage.setItem(CHAVE_LARGURA, expandido ? 'sim' : 'nao'); } catch { /* sem storage */ }
  }, [expandido]);

  const conversaAtual = chat.aberta;

  const abrirCom = useCallback(async (pessoaId: string) => {
    const id = await chat.abrirCom(pessoaId);
    if (!id) toast({ title: 'Não foi possível abrir a conversa', variant: 'destructive' });
    else setAberto(true);
  }, [chat, toast]);

  // ── As duas portas para uma conversa, ambas passando pelo cartão ───────────
  const pedirConversa = useCallback((id: string) => {
    if (!jaLeu) { setPendente({ tipo: 'abrir', id }); return; }
    chat.abrir(id);
  }, [jaLeu, chat]);

  const pedirPessoa = useCallback((pessoaId: string) => {
    if (!jaLeu) { setPendente({ tipo: 'pessoa', id: pessoaId }); return; }
    void abrirCom(pessoaId);
  }, [jaLeu, abrirCom]);

  const depoisDeLer = useCallback(() => {
    const p = pendente;
    setPendente(null);
    if (!p) return;
    if (p.tipo === 'abrir') chat.abrir(p.id);
    else void abrirCom(p.id);
  }, [pendente, chat, abrirCom]);

  const apagar = useCallback(async (conversaId: string) => {
    if (!perfil?.id) return;
    await apagarConversa(conversaId, perfil.id);
    if (chat.conversaAberta === conversaId) chat.abrir(null);
    chat.recarregar();
  }, [perfil?.id, chat]);

  if (!podeVer) return null;

  // ── Fechado: só a bolha ────────────────────────────────────────────────────
  if (!aberto) {
    return (
      <button
        onClick={() => setAberto(true)}
        onMouseEnter={() => setSobre(true)}
        onMouseLeave={() => setSobre(false)}
        onFocus={() => setSobre(true)}
        onBlur={() => setSobre(false)}
        className={cn(
          'fixed bottom-6 right-6 z-40 w-14 h-14 group',
          // Quadrado de cantos arredondados. `rounded-2xl` e não `rounded-full`:
          // pedido explícito, e combina com o resto do sistema, que é todo
          // feito de cartões de canto arredondado.
          'rounded-2xl bg-primary text-primary-foreground',
          'shadow-lg transition-all duration-300',
          'hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 active:scale-95',
          'flex items-center justify-center',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        )}
        aria-label={chat.naoLidasTotal ? `Chat, ${chat.naoLidasTotal} não lidas` : 'Abrir o chat'}
      >
        {/* O brilho, atrás. Acende no hover e fica aceso com mensagem nova. */}
        <span
          aria-hidden="true"
          className={cn(
            'absolute inset-0 rounded-2xl blur-lg -z-10 bg-primary/40 transition-opacity duration-500',
            sobre || chat.naoLidasTotal > 0 ? 'opacity-100' : 'opacity-0',
          )}
        />
        <IconeChat ativo={sobre || chat.naoLidasTotal > 0} />

        {chat.naoLidasTotal > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-destructive text-destructive-foreground text-[11px] font-semibold flex items-center justify-center ring-2 ring-background">
            {chat.naoLidasTotal > 99 ? '99+' : chat.naoLidasTotal}
          </span>
        )}
      </button>
    );
  }

  // ── Aberto ─────────────────────────────────────────────────────────────────
  /*
   * A lista só sai de cena quando há uma conversa DE VERDADE para pôr no
   * lugar. Antes bastava `conversaAberta` estar preenchida — e se ela não
   * resolvesse (conversa nova, ainda fora da lista), a janela ficava vazia:
   * lista escondida, conversa nula, nada desenhado.
   */
  const mostraLista = expandido || !conversaAtual;
  const mostraConversa = !!conversaAtual;

  return (
    <>
      <div
        className={cn(
          'fixed bottom-6 right-6 z-40 flex flex-col bg-background border border-border rounded-2xl shadow-2xl overflow-hidden transition-[width,height] duration-200',
          expandido ? 'w-[720px] h-[560px]' : 'w-[360px] h-[520px]',
          'max-w-[calc(100vw-2rem)] max-h-[calc(100vh-3rem)]',
        )}
      >
        <header className="flex items-center gap-1 px-3 py-2 border-b border-border shrink-0">
          <MessageCircle className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold flex-1">Chat</span>
          <button onClick={() => setExpandido(e => !e)}
                  className="p-1.5 rounded hover:bg-muted transition-colors"
                  aria-label={expandido ? 'Diminuir a janela' : 'Aumentar a janela'}>
            {expandido ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
          <button onClick={() => setAberto(false)}
                  className="p-1.5 rounded hover:bg-muted transition-colors" aria-label="Fechar o chat">
            <Minus className="w-3.5 h-3.5" />
          </button>
        </header>

        <div className="flex-1 min-h-0 flex">
          {mostraLista && (
            <div className={cn(
              'min-h-0',
              expandido ? 'w-[260px] border-r border-border shrink-0' : 'flex-1',
            )}>
              <ListaConversas
                conversas={chat.conversas}
                disparos={chat.disparos}
                online={online}
                digitando={digitando}
                selecionada={chat.conversaAberta}
                carregando={chat.carregando}
                meuId={perfil?.id ?? ''}
                onAbrir={pedirConversa}
                onApagar={id => void apagar(id)}
                onNovaConversa={() => setNovaConversa(true)}
                onNovoDisparo={() => setNovoDisparo(true)}
              />
            </div>
          )}

          {mostraConversa && conversaAtual && (
            <div className="flex-1 min-w-0 min-h-0">
              <Conversa
                conversa={conversaAtual}
                mensagens={chat.mensagens}
                online={online.has(conversaAtual.outro_id)}
                digitando={digitando.has(conversaAtual.outro_id)}
                expandido={expandido}
                onVoltar={() => chat.abrir(null)}
                onEnviar={chat.enviar}
                onDigitando={() => avisarDigitando(conversaAtual.outro_id)}
              />
            </div>
          )}

          {expandido && !conversaAtual && (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-xs text-muted-foreground">Escolha uma conversa</p>
            </div>
          )}
        </div>
      </div>

      <NovaConversaDialog
        aberto={novaConversa} online={online}
        onFechar={() => setNovaConversa(false)}
        onEscolher={pedirPessoa}
      />

      {/* Uma vez por pessoa, antes da primeira conversa. Ver o componente. */}
      <BoasVindasChat aberto={!!pendente} onAceitar={depoisDeLer} />

      <DisparoDialog
        aberto={novoDisparo}
        onFechar={() => setNovoDisparo(false)}
        onPronto={enviados => {
          toast({
            title: `Enviado para ${enviados} ${enviados === 1 ? 'pessoa' : 'pessoas'}`,
            description: 'Quem responder aparece na sua lista de conversas.',
          });
          chat.recarregar();
        }}
      />
    </>
  );
}
