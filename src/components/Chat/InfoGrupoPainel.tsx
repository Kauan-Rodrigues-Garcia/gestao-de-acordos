/**
 * InfoGrupoPainel.tsx — o «dados do grupo», por dentro da conversa.
 *
 * ## Por que não é um Dialog
 *
 * O painel de CONFIGURAÇÕES (`ConfigGrupoDialog`) é uma janela: é onde se
 * altera o grupo, e alterar merece sair do fluxo da conversa. Este aqui é o
 * contrário — é para OLHAR, e olhar não deve tirar ninguém do lugar. Um modal
 * escureceria a conversa, prenderia o foco e pediria um fechar explícito para
 * uma consulta de dois segundos.
 *
 * Então ele é uma camada `absolute` dentro da própria conversa, que entra
 * deslizando por cima dela e sai do mesmo jeito. A conversa continua atrás,
 * viva; o «voltar» é um botão só.
 *
 * ## A animação, e por que ela não é enfeite
 *
 * O painel nasce do cabeçalho — é ali que se clica — e cresce até ocupar a
 * conversa. Sem esse movimento a tela simplesmente TROCA de conteúdo, e quem
 * clicou no nome do grupo não tem como saber se abriu alguma coisa ou se a
 * conversa foi embora. A animação responde «isto veio dali e volta para lá».
 *
 * ## A galeria não mora aqui
 *
 * A grade de fotos é `GradeMidias`, que a lista de conversas também usa — na
 * conversa direta, onde este painel não existe. Aqui ela é só uma das duas
 * seções; lá é o conteúdo de um diálogo. Ver `GradeMidias` e `GaleriaDialog`.
 */
import { useEffect, useState } from 'react';
import {
  ArrowLeft, Users, ShieldCheck, Images, Loader2, Lock, LogOut,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { listarMembros, type MembroGrupo } from '@/services/chat/grupos.service';
import type { ConversaChat } from '@/services/chat/chat.service';
import { AvatarChat, useFotoResolvida, TagAdm } from './comum';
import { GradeMidias } from './GradeMidias';

interface Props {
  conversa: ConversaChat;
  meuId:    string;
  aberto:   boolean;
  onFechar: () => void;
}

type Secao = 'info' | 'galeria';

export function InfoGrupoPainel({ conversa, meuId, aberto, onFechar }: Props) {
  const [membros, setMembros]   = useState<MembroGrupo[]>([]);
  const [secao, setSecao]       = useState<Secao>('info');
  const [carregando, setCarregando] = useState(true);
  const foto = useFotoResolvida(conversa.outro_foto);

  useEffect(() => {
    if (!aberto) return;
    setSecao('info');
    setCarregando(true);
    let cancelado = false;
    void listarMembros(conversa.id).then(m => {
      if (cancelado) return;
      setMembros(m);
      setCarregando(false);
    });
    return () => { cancelado = true; };
  }, [aberto, conversa.id]);

  if (!aberto) return null;

  return (
    <div
      className={cn(
        'absolute inset-0 z-20 flex flex-col bg-background',
        // A origem no topo é o que faz o painel "sair" do cabeçalho, que é
        // exatamente onde o dedo clicou.
        'origin-top animate-[info-grupo-abre_180ms_cubic-bezier(0.16,1,0.3,1)]',
      )}
      role="dialog"
      aria-label={`Dados do grupo ${conversa.outro_nome}`}
    >
      <style>{`
        @keyframes info-grupo-abre {
          from { opacity: 0; transform: scaleY(0.94) translateY(-8px); }
          to   { opacity: 1; transform: none; }
        }
      `}</style>

      <header className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2.5">
        <button
          type="button"
          onClick={() => (secao === 'galeria' ? setSecao('info') : onFechar())}
          className="-ml-1 rounded p-1 transition-colors hover:bg-muted"
          aria-label={secao === 'galeria' ? 'Voltar aos dados do grupo' : 'Voltar para a conversa'}
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <p className="flex-1 truncate text-sm font-medium">
          {secao === 'galeria' ? 'Fotos, GIFs e vídeos' : 'Dados do grupo'}
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {secao === 'info' ? (
          <>
            {/* Identidade: foto grande e centralizada, como pedido. */}
            <section className="flex flex-col items-center gap-2 px-4 py-5">
              <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border border-border bg-muted/50">
                {foto
                  ? <img src={foto} alt="" className="h-full w-full object-cover" />
                  : <Users className="h-9 w-9 text-muted-foreground" />}
              </div>
              <p className="text-center text-base font-semibold leading-tight">
                {conversa.outro_nome}
              </p>
              <p className="text-xs text-muted-foreground">
                Grupo · {membros.length} {membros.length === 1 ? 'participante' : 'participantes'}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-1.5">
                {conversa.somente_lideranca && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground ring-1 ring-border">
                    <Lock className="h-2.5 w-2.5" /> Só a liderança escreve
                  </span>
                )}
                {conversa.sai && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive">
                    <LogOut className="h-2.5 w-2.5" /> Você saiu deste grupo
                  </span>
                )}
              </div>
            </section>

            <section className="px-3 pb-2">
              <button
                type="button"
                onClick={() => setSecao('galeria')}
                className="flex w-full items-center gap-2.5 rounded-lg border border-border px-3 py-2.5 text-left transition-colors hover:bg-muted/60"
              >
                <Images className="h-4 w-4 shrink-0 text-primary" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm leading-tight">Fotos, GIFs e vídeos</span>
                  <span className="block text-[11px] leading-tight text-muted-foreground">
                    Tudo que já foi enviado neste grupo
                  </span>
                </span>
              </button>
            </section>

            <section className="px-3 pb-4">
              <p className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Participantes
              </p>
              {carregando ? (
                <p className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando…
                </p>
              ) : membros.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">
                  Ninguém para mostrar.
                </p>
              ) : membros.map(m => (
                <div key={m.perfil_id} className="flex items-center gap-2.5 rounded-lg px-1 py-1.5">
                  <AvatarChat nome={m.nome} foto={m.foto_url} tamanho={32} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-sm leading-tight">
                      <span className="truncate">{m.perfil_id === meuId ? 'Você' : m.nome}</span>
                      <TagAdm perfil={m.cargo} />
                    </p>
                    <p className="truncate text-[11px] leading-tight text-muted-foreground">
                      {m.usuario ? `@${m.usuario}` : m.cargo}
                    </p>
                  </div>
                  {m.admin && (
                    <span title="Administra o grupo"
                          className="inline-flex shrink-0 items-center gap-0.5 rounded bg-primary/10 px-1 py-px text-[9px] font-bold uppercase text-primary">
                      <ShieldCheck className="h-2.5 w-2.5" /> adm
                    </span>
                  )}
                </div>
              ))}
            </section>
          </>
        ) : (
          <section className="p-2">
            <GradeMidias conversaId={conversa.id} ativo={secao === 'galeria'} />
          </section>
        )}
      </div>
    </div>
  );
}
