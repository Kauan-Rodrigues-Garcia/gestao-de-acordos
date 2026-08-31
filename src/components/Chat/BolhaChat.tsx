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
import { useCallback, useEffect, useRef, useState } from 'react';
import { MessageCircle, Minus, Maximize2, Minimize2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { useChat } from '@/hooks/useChat';
import { useChatPresenca } from '@/hooks/useChatPresenca';
import {
  apagarConversa, buscarConversa, possoUsarOChat, rotuloAnexo,
  type MensagemChat,
} from '@/services/chat/chat.service';
import { IconeChat } from './comum';
import { ListaConversas } from './ListaConversas';
import { Conversa } from './Conversa';
import { DisparoDialog } from './DisparoDialog';
import { NovaConversaDialog } from './NovaConversaDialog';
import { NovoGrupoDialog } from './NovoGrupoDialog';
import { ConfigGrupoDialog } from './ConfigGrupoDialog';
import { PainelMonitor } from './PainelMonitor';
import { BoasVindasChat } from './BoasVindasChat';
import { useToast } from '@/components/ui/use-toast';
import { toast as toastFlutuante } from '@/components/ui/sonner';
import { NotificacaoMensagem } from './NotificacaoMensagem';
import {
  deveNotificarMensagemChat, executarNotificacaoChatUmaVez, tituloComMensagensNaoLidas,
} from '@/lib/notificacao-chat';
import { prepararSomChat, tocarSomChat } from '@/lib/som-chat';

const CHAVE_LARGURA = 'chat-expandido';

export function BolhaChat() {
  const { perfil } = useAuth();
  const { temPermissao, loading: permLoading } = useCargoPermissoes();
  const { toast } = useToast();

  const [aberto, setAberto] = useState(false);
  /*
   * Nasce GRANDE, desde 31/08/2026.
   *
   * A janela pequena era o padrão porque um chat de canto não deve tomar a
   * tela sem ser convidado. Só que a lista de conversas não cabe nela: no
   * tamanho menor a tela alterna entre lista e conversa, e quem abre o chat
   * para responder alguém precisa de dois cliques só para chegar na pessoa.
   *
   * Por isso a comparação é `!== 'nao'` e não `=== 'sim'`: quem nunca decidiu
   * nada (chave ausente) cai no grande; só quem clicou em diminuir — e ficou
   * gravado o 'nao' — continua no pequeno.
   */
  const [expandido, setExpandido] = useState(() => {
    try { return localStorage.getItem(CHAVE_LARGURA) !== 'nao'; } catch { return true; }
  });
  const [novaConversa, setNovaConversa] = useState(false);
  const [novoGrupo, setNovoGrupo] = useState(false);
  /** Painel de configuracoes do grupo aberto. */
  const [configGrupo, setConfigGrupo] = useState(false);
  const [novoDisparo, setNovoDisparo] = useState(false);
  /** Mouse ou teclado em cima do botão — acende o brilho e os pontos. */
  const [sobre, setSobre] = useState(false);
  const abertoRef = useRef(aberto);
  abertoRef.current = aberto;

  // A assinatura do Realtime nasce dentro de useChat, mas a decisão visual
  // mora aqui, onde sabemos se a janela está de fato aberta. Refs evitam
  // recriar o canal a cada conversa ou a cada abrir/minimizar.
  const chatRef = useRef<ReturnType<typeof useChat> | null>(null);
  const aoMensagemRecebida = useCallback((mensagem: MensagemChat) => {
    const estado = chatRef.current;
    if (!estado || !deveNotificarMensagemChat({
      janelaAberta: abertoRef.current,
      conversaAberta: estado.conversaAberta,
      conversaDaMensagem: mensagem.conversa_id,
    })) return;

    void executarNotificacaoChatUmaVez(mensagem.id, () => {
      void (async () => {
        const atual = chatRef.current;
        const conversa = atual?.conversas.find(c => c.id === mensagem.conversa_id)
          ?? await buscarConversa(mensagem.conversa_id);
        if (!conversa) return;

        // A busca da foto pode levar alguns milissegundos. Se a pessoa abriu a
        // conversa nesse intervalo, o aviso perdeu a razão de existir.
        const depoisDaBusca = chatRef.current;
        if (depoisDaBusca && !deveNotificarMensagemChat({
          janelaAberta: abertoRef.current,
          conversaAberta: depoisDaBusca.conversaAberta,
          conversaDaMensagem: mensagem.conversa_id,
        })) return;

        const previa = mensagem.texto?.trim()
          || (mensagem.anexos.length ? rotuloAnexo(mensagem.anexos) : 'Nova mensagem');

        toastFlutuante.custom(id => (
          <NotificacaoMensagem
            nome={conversa.outro_nome}
            foto={conversa.outro_foto}
            mensagem={previa}
            onFechar={() => toastFlutuante.dismiss(id)}
            onAbrir={() => {
              toastFlutuante.dismiss(id);
              chatRef.current?.abrir(mensagem.conversa_id);
              abertoRef.current = true;
              setAberto(true);
            }}
          />
        ), { duration: 8_000 });
        tocarSomChat();
      })();
    });
  }, []);

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
   * Grupo e Monitor sao chaves do painel, lidas UMA vez aqui.
   *
   * Passar `undefined` para a lista e o que faz a aba e o item de menu nao
   * existirem — em vez de existirem desabilitados. Botao que aparece e nao
   * funciona e pior que botao ausente: ele promete.
   */
  const podeCriarGrupo = podeVer && temPermissao('chat_grupo_criar');
  const podeMonitorar   = podeVer && temPermissao('chat_monitor');

  /*
   * O chat continua ligado com a janela fechada.
   *
   * É o que faz o contador aparecer sem a pessoa precisar abrir para descobrir
   * que tem mensagem. Custa uma assinatura de realtime, que já é compartilhada
   * com o resto do app.
   */
  const chat = useChat(podeVer, aberto, aoMensagemRecebida);
  chatRef.current = chat;
  const { online, digitando, gravando, avisarAtividade } = useChatPresenca(podeVer);

  // Contagem da própria aba do navegador. Mensagens lidas limpam o prefixo.
  useEffect(() => {
    document.title = tituloComMensagensNaoLidas(chat.naoLidasTotal);
    return () => { document.title = 'Gestão de Acordos'; };
  }, [chat.naoLidasTotal]);

  // O arquivo é diferente do som do sino. O primeiro gesto apenas antecipa o
  // download e deixa o navegador pronto para tocar quando a mensagem chegar.
  useEffect(() => {
    if (!podeVer) return;
    prepararSomChat();
    const preparar = () => {
      prepararSomChat();
      window.removeEventListener('pointerdown', preparar, true);
      window.removeEventListener('keydown', preparar, true);
    };
    window.addEventListener('pointerdown', preparar, true);
    window.addEventListener('keydown', preparar, true);
    return () => {
      window.removeEventListener('pointerdown', preparar, true);
      window.removeEventListener('keydown', preparar, true);
    };
  }, [podeVer]);

  useEffect(() => {
    try { localStorage.setItem(CHAVE_LARGURA, expandido ? 'sim' : 'nao'); } catch { /* sem storage */ }
  }, [expandido]);

  const conversaAtual = chat.aberta;

  const abrirJanela = useCallback(() => {
    abertoRef.current = true;
    setAberto(true);
    // Minimizar conserva a conversa selecionada. Ao voltar ela se torna
    // visível novamente, então relê e marca como lida o que chegou no intervalo.
    if (chat.conversaAberta) chat.abrir(chat.conversaAberta);
  }, [chat]);

  const abrirCom = useCallback(async (pessoaId: string) => {
    const id = await chat.abrirCom(pessoaId);
    if (!id) toast({ title: 'Não foi possível abrir a conversa', variant: 'destructive' });
    else {
      abertoRef.current = true;
      setAberto(true);
    }
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
      <>
      <style>{`
        @keyframes chat-alerta-pendente {
          0%   { transform: scale(.9); opacity: .85; }
          70%  { transform: scale(1.22); opacity: 0; }
          100% { transform: scale(1.22); opacity: 0; }
        }
        .chat-alerta-pendente {
          animation: chat-alerta-pendente 1.45s ease-out infinite;
        }
      `}</style>
      <button
        onClick={abrirJanela}
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
        {chat.naoLidasTotal > 0 && (
          <span
            aria-hidden="true"
            className="chat-alerta-pendente pointer-events-none absolute -inset-1 rounded-[18px] border-2 border-primary/70"
          />
        )}
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
      </>
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
          <button onClick={() => { abertoRef.current = false; setAberto(false); }}
                  className="p-1.5 rounded hover:bg-muted transition-colors" aria-label="Fechar o chat">
            <Minus className="w-3.5 h-3.5" />
          </button>
        </header>

        <div className="flex-1 min-h-0 flex">
          {mostraLista && (
            <div className={cn(
              // `min-w-0`: item de flex nao encolhe abaixo do conteudo sem isso,
              // e uma lista larga (disparo de texto longo) empurrava a janela.
              'min-h-0 min-w-0',
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
                onNovoGrupo={podeCriarGrupo ? () => setNovoGrupo(true) : undefined}
                painelMonitor={podeMonitorar ? <PainelMonitor expandido={expandido} /> : undefined}
              />
            </div>
          )}

          {mostraConversa && conversaAtual && (
            <div className="flex-1 min-w-0 min-h-0">
              {/*
                Presença é de UMA pessoa, e grupo não tem «a outra»: as três
                marcas ficam desligadas lá. Anunciar «digitando…» num grupo de
                dez exigiria saber QUEM, e a presença atual guarda um par.
              */}
              <Conversa
                conversa={conversaAtual}
                mensagens={chat.mensagens}
                online={!!conversaAtual.outro_id && online.has(conversaAtual.outro_id)}
                digitando={!!conversaAtual.outro_id && digitando.has(conversaAtual.outro_id)}
                gravando={!!conversaAtual.outro_id && gravando.has(conversaAtual.outro_id)}
                expandido={expandido}
                onVoltar={() => chat.abrir(null)}
                onEnviar={chat.enviar}
                onDigitando={() => { if (conversaAtual.outro_id) avisarAtividade(conversaAtual.outro_id, 'digitando'); }}
                onGravando={() => { if (conversaAtual.outro_id) avisarAtividade(conversaAtual.outro_id, 'gravando'); }}
                temMais={chat.temMais}
                carregandoMais={chat.carregandoMais}
                onVerAnteriores={chat.verAnteriores}
                onConfigurarGrupo={
                  conversaAtual.tipo === 'grupo' ? () => setConfigGrupo(true) : undefined
                }
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

      <NovoGrupoDialog
        aberto={novoGrupo}
        onFechar={() => setNovoGrupo(false)}
        onCriado={id => { chat.recarregar(); chat.abrir(id); }}
      />

      {/* O painel de configuracoes so monta com um GRUPO aberto: ele fala de
          nome, foto e membros, que a conversa direta nao tem. */}
      {conversaAtual?.tipo === 'grupo' && (
        <ConfigGrupoDialog
          aberto={configGrupo}
          conversa={conversaAtual}
          meuId={perfil?.id ?? ''}
          onFechar={() => setConfigGrupo(false)}
          onMudou={() => chat.recarregar()}
          onSai={() => { chat.abrir(null); chat.recarregar(); }}
        />
      )}

      {/* Uma vez por pessoa, antes da primeira conversa. Ver o componente. */}
      <BoasVindasChat aberto={!!pendente} onAceitar={depoisDeLer} />

      <DisparoDialog
        aberto={novoDisparo}
        onFechar={() => setNovoDisparo(false)}
        onPronto={enviados => {
          toast({
            title: `Enviado para ${enviados} ${enviados === 1 ? 'pessoa' : 'pessoas'}`,
            description: 'Uma resposta ou mensagem manual reativa a conversa.',
          });
          chat.recarregar();
        }}
      />
    </>
  );
}
