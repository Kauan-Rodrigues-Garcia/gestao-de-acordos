/**
 * ListaConversas.tsx — as duas abas da coluna esquerda.
 *
 * «Conversas» é a lista de sempre. «Disparos» existe para que mandar a mesma
 * mensagem para vinte pessoas não vire vinte linhas aqui — dezenove das quais
 * ninguém responde. Quem responder aparece em «Conversas» naquele instante; o
 * resto fica registrado ali do lado, e a lista continua servindo para conversar.
 *
 * Quem decide o que aparece é o banco (`oculta_em`), não esta tela: ela pede as
 * minhas conversas e desenha o que vier.
 */
import { useState } from 'react';
import { MessageSquarePlus, Search, Send, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { ConversaChat, DisparoChat } from '@/services/chat/chat.service';
import { rotuloAnexo } from '@/services/chat/chat.service';
import { AvatarChat, horaCurta, TagEmpresa } from './comum';
import { niveisLiberados } from '@/lib/permissoes-escopo';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';

type Aba = 'conversas' | 'disparos';

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
  const podeIniciar = niveisLiberados('chat', temPermissao).length > 0;

  const filtradas = busca.trim()
    ? conversas.filter(c =>
        c.outro_nome.toLowerCase().includes(busca.trim().toLowerCase())
        || (c.outro_usuario ?? '').toLowerCase().includes(busca.trim().toLowerCase()))
    : conversas;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Abas */}
      <div className="flex items-center gap-1 px-2 pt-2 shrink-0">
        {(['conversas', 'disparos'] as const).map(a => (
          <button
            key={a} onClick={() => setAba(a)}
            className={cn(
              'text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors',
              aba === a ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {a === 'conversas' ? 'Conversas' : 'Disparos'}
            {a === 'disparos' && disparos.length > 0 && (
              <span className="ml-1 opacity-60">{disparos.length}</span>
            )}
          </button>
        ))}
        <div className="flex-1" />
        {podeIniciar && (
          <Button variant="ghost" size="icon" className="h-7 w-7"
                  onClick={aba === 'conversas' ? onNovaConversa : onNovoDisparo}
                  aria-label={aba === 'conversas' ? 'Nova conversa' : 'Novo disparo'}>
            {aba === 'conversas' ? <MessageSquarePlus className="w-4 h-4" /> : <Send className="w-4 h-4" />}
          </Button>
        )}
      </div>

      {aba === 'conversas' && (
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
        {aba === 'conversas' ? (
          <>
            {carregando && (
              <p className="text-center text-xs text-muted-foreground py-8">Carregando…</p>
            )}
            {!carregando && filtradas.length === 0 && (
              <div className="text-center py-10 px-4">
                <p className="text-xs text-muted-foreground">
                  {busca.trim() ? 'Ninguém com esse nome por aqui.' : 'Nenhuma conversa ainda.'}
                </p>
                {!busca.trim() && podeIniciar && (
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
                    'w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors',
                    selecionada === c.id ? 'bg-muted' : 'hover:bg-muted/50',
                  )}
                >
                  <AvatarChat nome={c.outro_nome} foto={c.outro_foto} tamanho={40}
                              online={online.has(c.outro_id)} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium truncate min-w-0">{c.outro_nome}</p>
                      <TagEmpresa slug={c.outro_empresa} />
                      <span className="text-[10px] text-muted-foreground shrink-0 ml-auto">
                        {horaCurta(c.ultima_mensagem_em)}
                      </span>
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
                  {c.nao_lidas > 0 && (
                    <span className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold flex items-center justify-center">
                      {c.nao_lidas > 99 ? '99+' : c.nao_lidas}
                    </span>
                  )}
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
                  Mandar a mesma mensagem para várias pessoas não enche a lista
                  de conversas. Quem responder aparece lá.
                </p>
                {podeIniciar && (
                  <Button variant="link" size="sm" className="text-xs mt-1" onClick={onNovoDisparo}>
                    Fazer um disparo
                  </Button>
                )}
              </div>
            )}
            {disparos.map(d => (
              <div key={d.id} className="px-3 py-2.5 border-b border-border/50 last:border-0">
                <div className="flex items-baseline gap-2">
                  <p className="text-xs font-medium flex-1">
                    {d.total_destinos} {d.total_destinos === 1 ? 'pessoa' : 'pessoas'}
                  </p>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {horaCurta(d.criado_em)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {d.texto ?? (d.anexos.length ? rotuloAnexo(d.anexos) : '—')}
                </p>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
