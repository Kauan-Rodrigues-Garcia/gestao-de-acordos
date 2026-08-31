/**
 * ListaConversas.tsx — as três abas da coluna esquerda.
 *
 * «Conversas» é a lista de sempre. «Disparos» existe para que mandar a mesma
 * mensagem para vinte pessoas não vire vinte linhas aqui — dezenove das quais
 * ninguém responde. Quem responder aparece em «Conversas» naquele instante; o
 * resto fica registrado ali do lado, e a lista continua servindo para conversar.
 *
 * «Histórico» recebe o que não teve atividade válida hoje. A classificação já
 * vem do banco no horário de São Paulo; esta tela apenas separa a lista única.
 */
import { useCallback, useState } from 'react';
import { ChevronDown, Loader2, MessageSquarePlus, Plus, Search, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type {
  ConversaChat, DestinoDisparoChat, DisparoChat,
} from '@/services/chat/chat.service';
import {
  listarDestinosDisparo, PAGINA_DESTINOS_DISPARO, rotuloAnexo,
} from '@/services/chat/chat.service';
import { AvatarChat, horaCurta, TagEmpresa } from './comum';
import { niveisLiberados } from '@/lib/permissoes-escopo';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { cargosChatLiberados } from '@/lib/permissoes-chat';
import { StatusMensagem } from './StatusMensagem';
import { estadoMensagem } from './estadoMensagem';

type Aba = 'conversas' | 'historico' | 'disparos';

interface Props {
  conversas:   ConversaChat[];
  disparos:    DisparoChat[];
  online:      Set<string>;
  digitando:   Set<string>;
  selecionada: string | null;
  carregando:  boolean;
  meuId:       string;
  onAbrir:     (id: string) => void;
  onApagar:    (id: string) => void;
  onNovaConversa: () => void;
  onNovoDisparo:  () => void;
}

interface CardDisparoProps {
  disparo: DisparoChat;
  online: Set<string>;
  onAbrir: (conversaId: string) => void;
}

/**
 * Um disparo abre a própria lista de destinatários, sem misturá-la à lista
 * principal de conversas. O estado fica no card para que fechar e reabrir não
 * baixe novamente as páginas que a pessoa acabou de ver.
 */
function CardDisparo({ disparo, online, onAbrir }: CardDisparoProps) {
  const [expandido, setExpandido] = useState(false);
  const [destinos, setDestinos] = useState<DestinoDisparoChat[]>([]);
  const [carregado, setCarregado] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [temMais, setTemMais] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async (reiniciar = false) => {
    if (carregando) return;
    setCarregando(true);
    setErro(null);

    const inicio = reiniciar ? 0 : destinos.length;
    const resultado = await listarDestinosDisparo(disparo.id, inicio);

    setCarregando(false);
    setCarregado(true);
    setErro(resultado.erro);
    if (resultado.erro) return;

    setDestinos(atuais => reiniciar
      ? resultado.destinos
      : [...atuais, ...resultado.destinos]);
    setTemMais(resultado.temMais);
  }, [carregando, destinos.length, disparo.id]);

  const alternar = () => {
    const vaiAbrir = !expandido;
    setExpandido(vaiAbrir);
    if (vaiAbrir && !carregado && !carregando) void carregar(true);
  };

  const conteudo = disparo.texto
    ?? (disparo.anexos.length ? rotuloAnexo(disparo.anexos) : '—');
  const listaId = `destinos-disparo-${disparo.id}`;

  return (
    <article className="border-b border-border/50 last:border-0">
      <button
        type="button"
        onClick={alternar}
        aria-expanded={expandido}
        aria-controls={listaId}
        className={cn(
          'w-full px-3 py-2.5 text-left transition-colors',
          'hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
          expandido && 'bg-muted/40',
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <p className="text-xs font-medium flex-1">
                {disparo.total_destinos} {disparo.total_destinos === 1 ? 'pessoa' : 'pessoas'}
              </p>
              <span className="text-[10px] text-muted-foreground shrink-0">
                {horaCurta(disparo.criado_em)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground truncate mt-0.5">{conteudo}</p>
          </div>
          <ChevronDown
            aria-hidden="true"
            className={cn(
              'w-4 h-4 shrink-0 text-muted-foreground transition-transform duration-200',
              expandido && 'rotate-180',
            )}
          />
        </div>
      </button>

      {expandido && (
        <div id={listaId} className="bg-muted/15" aria-busy={carregando}>
          {carregando && destinos.length === 0 && (
            <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Carregando destinatários…
            </div>
          )}

          {erro && destinos.length === 0 && (
            <div className="px-4 py-5 text-center">
              <p className="text-xs text-muted-foreground">{erro}</p>
              <Button variant="link" size="sm" className="text-xs mt-1"
                      onClick={() => void carregar(true)}>
                Tentar novamente
              </Button>
            </div>
          )}

          {!carregando && !erro && carregado && destinos.length === 0 && (
            <p className="px-4 py-5 text-center text-xs text-muted-foreground">
              Nenhum destinatário encontrado.
            </p>
          )}

          {destinos.map(destino => (
            <button
              type="button"
              key={`${disparo.id}-${destino.perfil_id}`}
              onClick={() => onAbrir(destino.conversa_id)}
              className={cn(
                'w-full grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2.5 px-4 py-2 text-left',
                'border-t border-border/40 hover:bg-muted/50 transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
              )}
            >
              <AvatarChat nome={destino.nome} foto={destino.foto_url} tamanho={34}
                          online={online.has(destino.perfil_id)} />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <p className="text-xs font-medium truncate min-w-0">{destino.nome}</p>
                  <TagEmpresa slug={destino.empresa_slug} />
                </div>
                {destino.usuario && (
                  <p className="text-[11px] text-muted-foreground truncate">@{destino.usuario}</p>
                )}
              </div>
            </button>
          ))}

          {(temMais || (carregando && destinos.length > 0)) && (
            <div className="border-t border-border/40 px-3 py-2 text-center">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                disabled={carregando}
                onClick={() => void carregar(false)}
              >
                {carregando ? (
                  <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Carregando…</>
                ) : (
                  `Ver mais ${Math.min(PAGINA_DESTINOS_DISPARO, Math.max(0, disparo.total_destinos - destinos.length))}`
                )}
              </Button>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

export function ListaConversas({
  conversas, disparos, online, digitando, selecionada, carregando, meuId,
  onAbrir, onApagar, onNovaConversa, onNovoDisparo,
}: Props) {
  const [aba, setAba] = useState<Aba>('conversas');
  const [busca, setBusca] = useState('');

  /*
   * Sem nenhum nível de alcance a pessoa recebe e responde, mas não começa
   * conversa nenhuma. O botão sumir é melhor que abrir uma janela vazia — e o
   * mesmo vale para o disparo, que é iniciar várias de uma vez.
   */
  const { temPermissao } = useCargoPermissoes();
  const podeIniciar = niveisLiberados('chat', temPermissao).length > 0
    && cargosChatLiberados(temPermissao).length > 0;

  const atuais = conversas.filter(c => !c.em_historico);
  const historico = conversas.filter(c => c.em_historico);
  const listaDaAba = aba === 'historico' ? historico : atuais;
  const filtradas = busca.trim()
    ? listaDaAba.filter(c =>
        c.outro_nome.toLowerCase().includes(busca.trim().toLowerCase())
        || (c.outro_usuario ?? '').toLowerCase().includes(busca.trim().toLowerCase()))
    : listaDaAba;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Abas */}
      {/*
        O espaço à direita é reservado para o botão de ação, que é `absolute`.
        Reservar por `aba !== 'historico'` sobrava 40px de vazio para quem NÃO
        pode iniciar conversa — e nessas contas as três abas eram espremidas
        (e truncadas) para abrir lugar a um botão que nunca era desenhado.
        A condição agora é a MESMA do botão, então os dois nunca divergem.
      */}
      <div className={cn(
        'relative flex items-center px-2 pt-2 shrink-0',
        podeIniciar && aba !== 'historico' ? 'pr-10' : 'pr-2',
      )}>
        <div className="grid min-w-0 flex-1 grid-cols-3 gap-0.5 overflow-hidden rounded-lg bg-muted/35 p-0.5">
          {(['conversas', 'historico', 'disparos'] as const).map(a => (
            <button
              key={a} onClick={() => setAba(a)}
              className={cn(
                'min-w-0 truncate rounded-md px-1.5 py-1.5 text-[11px] font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                aba === a
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {a === 'conversas' ? 'Conversas' : a === 'historico' ? 'Histórico' : 'Disparos'}
              {a === 'disparos' && disparos.length > 0 && (
                <span className="ml-1 opacity-60">{disparos.length}</span>
              )}
            </button>
          ))}
        </div>
        {podeIniciar && aba !== 'historico' && (
          <Button variant="ghost" size="icon"
                  className="absolute right-2 top-2 z-20 h-7 w-7"
                  onClick={aba === 'conversas' ? onNovaConversa : onNovoDisparo}
                  aria-label={aba === 'conversas' ? 'Nova conversa' : 'Novo disparo'}>
            {aba === 'conversas' ? <MessageSquarePlus className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          </Button>
        )}
      </div>

      {aba !== 'disparos' && (
        <div className="px-2 py-2 shrink-0">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={busca} onChange={e => setBusca(e.target.value)}
              placeholder="Procurar"
              className="w-full bg-muted/60 rounded-lg pl-8 pr-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto">
        {aba !== 'disparos' ? (
          <>
            {carregando && (
              <p className="text-center text-xs text-muted-foreground py-8">Carregando…</p>
            )}
            {!carregando && filtradas.length === 0 && (
              <div className="text-center py-10 px-4">
                <p className="text-xs text-muted-foreground">
                  {busca.trim()
                    ? 'Ninguém com esse nome por aqui.'
                    : aba === 'historico'
                      ? 'Nenhuma conversa no histórico.'
                      : 'Nenhuma conversa hoje.'}
                </p>
                {!busca.trim() && aba === 'conversas' && podeIniciar && (
                  <Button variant="link" size="sm" className="text-xs mt-1" onClick={onNovaConversa}>
                    Começar uma
                  </Button>
                )}
              </div>
            )}

            {filtradas.map(c => (
              <div key={c.id} className="group relative">
                <button
                  onClick={() => onAbrir(c.id)}
                  className={cn(
                    // A terceira coluna fica reservada para o contador. Texto
                    // grande só encolhe a coluna do meio, inclusive a 360 px.
                    'w-full grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 px-3 py-2.5 text-left transition-colors',
                    selecionada === c.id ? 'bg-muted' : 'hover:bg-muted/50',
                  )}
                >
                  <AvatarChat nome={c.outro_nome} foto={c.outro_foto} tamanho={40}
                              online={online.has(c.outro_id)} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium truncate min-w-0">{c.outro_nome}</p>
                      <TagEmpresa slug={c.outro_empresa} />
                    </div>
                    <p className={cn(
                      'text-xs truncate',
                      c.nao_lidas > 0 ? 'text-foreground font-medium' : 'text-muted-foreground',
                    )}>
                      {digitando.has(c.outro_id)
                        ? <span className="text-primary">digitando…</span>
                        : <>
                            {c.ultimo_autor_id === meuId && <span className="opacity-60">Você: </span>}
                            {c.ultimo_texto ?? 'Anexo'}
                          </>}
                    </p>
                  </div>
                  <span className="flex min-w-[30px] shrink-0 flex-col items-end gap-0.5 self-stretch justify-center">
                    <span className="text-[10px] text-muted-foreground">
                      {horaCurta(c.ultima_mensagem_em)}
                    </span>
                    {c.nao_lidas > 0 ? (
                      <span
                        aria-label={`${c.nao_lidas} ${c.nao_lidas === 1 ? 'mensagem não lida' : 'mensagens não lidas'}`}
                        className="min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold flex items-center justify-center"
                      >
                        {c.nao_lidas > 99 ? '99+' : c.nao_lidas}
                      </span>
                    ) : c.ultimo_autor_id === meuId && c.ultima_mensagem_em ? (
                      <StatusMensagem
                        estado={estadoMensagem(
                          c.ultima_mensagem_em,
                          c.entrega_do_outro,
                          c.leitura_do_outro,
                        )}
                      />
                    ) : null}
                  </span>
                </button>

                {/* Apagar some com a conversa da MINHA lista. A do outro fica,
                    e nenhuma mensagem é destruída. */}
                <button
                  onClick={() => onApagar(c.id)}
                  className="absolute right-1 top-1 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-background transition-opacity"
                  aria-label={`Tirar a conversa com ${c.outro_nome} da lista`}
                  title="Tirar da minha lista"
                >
                  <Trash2 className="w-3 h-3 text-muted-foreground" />
                </button>
              </div>
            ))}
          </>
        ) : (
          <>
            {disparos.length === 0 && (
              <div className="text-center py-10 px-4">
                <p className="text-xs text-muted-foreground">
                  Nenhum disparo ainda.
                </p>
                <p className="text-[11px] text-muted-foreground/70 mt-1.5 leading-relaxed">
                  Mandar a mesma mensagem para várias pessoas não reativa a
                  lista. Uma resposta ou mensagem manual abre a conversa.
                </p>
                {podeIniciar && (
                  <Button variant="link" size="sm" className="text-xs mt-1" onClick={onNovoDisparo}>
                    Fazer um disparo
                  </Button>
                )}
              </div>
            )}
            {disparos.map(d => (
              <CardDisparo key={d.id} disparo={d} online={online} onAbrir={onAbrir} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
