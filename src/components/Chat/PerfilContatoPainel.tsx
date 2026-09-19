/**
 * PerfilContatoPainel.tsx — os dados da pessoa, por dentro da conversa direta.
 *
 * O irmão de `InfoGrupoPainel`, e de propósito com a mesma forma: camada que
 * entra deslizando do cabeçalho, foto grande no centro, o botão da galeria logo
 * abaixo. Quem já abriu os dados de um grupo reconhece a tela sem aprender
 * nada — só o miolo muda, de «participantes» para «quem é esta pessoa».
 *
 * ## De onde vêm os dados
 *
 * `fn_chat_perfil_contato`, que responde só sobre quem está numa conversa que
 * eu posso ver (a minha, ou uma que monitoro). A RLS de `perfis` é mais
 * estreita que o chat — operador não lê o cadastro de gente de outro setor —,
 * e o chat deixa conversar com gente de fora do setor. Sem a RPC, metade dos
 * cartões abriria vazia.
 *
 * Se a RPC falhar (rede, ou migration ainda não aplicada), o cartão abre com o
 * que a conversa já sabe — nome, login, foto — e diz que o resto não veio. Um
 * cartão pela metade é melhor que um clique que não faz nada.
 *
 * ## «Na planilha desde»
 *
 * É `perfis.criado_em`: o dia em que o usuário foi cadastrado no Gestão. Foi o
 * pedido, com essas palavras — é a data que a operação usa para dizer há
 * quanto tempo alguém está com a gente.
 */
import { useEffect, useState } from 'react';
import {
  ArrowLeft, Building2, CalendarDays, Images, Loader2, Palmtree, UserCheck, Users, X,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import { PERFIL_COLORS, PERFIL_LABELS } from '@/lib/index';
import {
  buscarPerfilContato, type ConversaChat, type PerfilContato,
} from '@/services/chat/chat.service';
import { AvatarChat, TagAdm } from './comum';
import { useFotoResolvida } from './useFotoResolvida';
import { tempoDesde } from './formatos';
import { GradeMidias } from './GradeMidias';

interface Props {
  conversa: ConversaChat;
  aberto:   boolean;
  /** A pessoa está com o sistema aberto agora (presença do canal). */
  online:   boolean;
  onFechar: () => void;
  /** Abre um dos grupos em comum. Ausente = a lista só informa. */
  onAbrirConversa?: (conversaId: string) => void;
}

type Secao = 'info' | 'galeria';

export function PerfilContatoPainel({
  conversa, aberto, online, onFechar, onAbrirConversa,
}: Props) {
  const [perfil, setPerfil] = useState<PerfilContato | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [falhou, setFalhou] = useState(false);
  const [secao, setSecao] = useState<Secao>('info');
  const [fotoAmpliada, setFotoAmpliada] = useState(false);

  // O que a conversa já sabe desenha o topo na hora; o resto chega da RPC.
  const nome    = perfil?.nome ?? conversa.outro_nome;
  const usuario = perfil?.usuario ?? conversa.outro_usuario;
  const cargo   = perfil?.cargo ?? conversa.outro_perfil;
  const foto    = useFotoResolvida(perfil?.foto_url ?? conversa.outro_foto);

  useEffect(() => {
    if (!aberto || !conversa.outro_id) return;
    setSecao('info');
    setFotoAmpliada(false);
    setCarregando(true);
    setFalhou(false);
    let cancelado = false;
    void buscarPerfilContato(conversa.id, conversa.outro_id).then(({ perfil: p, erro }) => {
      if (cancelado) return;
      setPerfil(p);
      setFalhou(!!erro || !p);
      setCarregando(false);
    });
    return () => { cancelado = true; };
  }, [aberto, conversa.id, conversa.outro_id]);

  if (!aberto) return null;

  const lotacao = [perfil?.setor_nome, perfil?.equipe_nome].filter(Boolean).join(' · ');
  const emFerias = perfil?.situacao === 'ferias';

  return (
    <div
      className={cn(
        'absolute inset-0 z-20 flex flex-col bg-background',
        'origin-top animate-[perfil-contato-abre_180ms_cubic-bezier(0.16,1,0.3,1)]',
      )}
      role="dialog"
      aria-label={`Dados de ${nome}`}
    >
      <style>{`
        @keyframes perfil-contato-abre {
          from { opacity: 0; transform: scaleY(0.94) translateY(-8px); }
          to   { opacity: 1; transform: none; }
        }
      `}</style>

      <header className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2.5">
        <button
          type="button"
          onClick={() => (secao === 'galeria' ? setSecao('info') : onFechar())}
          className="-ml-1 rounded p-1 transition-colors hover:bg-muted"
          aria-label={secao === 'galeria' ? 'Voltar aos dados do contato' : 'Voltar para a conversa'}
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <p className="flex-1 truncate text-sm font-medium">
          {secao === 'galeria' ? 'Fotos, GIFs e vídeos' : 'Dados do contato'}
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {secao === 'info' ? (
          <>
            {/* Identidade: a foto maior que a do grupo, e clicável — é o
                primeiro lugar onde a mão vai para ver o rosto de alguém. */}
            <section className="flex flex-col items-center gap-1.5 px-4 pb-4 pt-6">
              <button
                type="button"
                onClick={() => foto && setFotoAmpliada(true)}
                disabled={!foto}
                className="relative mb-1 rounded-full transition-transform enabled:hover:scale-[1.03] disabled:cursor-default"
                aria-label={foto ? `Ampliar a foto de ${nome}` : undefined}
              >
                <AvatarChat nome={nome} foto={foto} tamanho={112} online={online} />
              </button>
              <p className="flex items-center gap-1.5 text-center text-base font-semibold leading-tight">
                <span>{nome}</span>
                <TagAdm perfil={cargo} />
              </p>
              {usuario && (
                <p className="text-xs text-muted-foreground">@{usuario}</p>
              )}
              {online && (
                <p className="flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> online agora
                </p>
              )}
              <div className="mt-1 flex flex-wrap items-center justify-center gap-1.5">
                {cargo && PERFIL_LABELS[cargo] && (
                  <span className={cn(
                    'rounded-full border px-2 py-0.5 text-[10px] font-semibold',
                    PERFIL_COLORS[cargo] ?? 'border-border text-muted-foreground',
                  )}>
                    {PERFIL_LABELS[cargo]}
                  </span>
                )}
                {perfil?.empresa_nome && (
                  <span className="rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {perfil.empresa_nome}
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
                    Tudo que já foi enviado nesta conversa
                  </span>
                </span>
              </button>
            </section>

            <section className="px-3 pb-3">
              <p className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Sobre
              </p>
              {carregando ? (
                <p className="flex items-center gap-2 px-1 py-3 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando…
                </p>
              ) : falhou ? (
                <p className="px-1 py-3 text-xs text-muted-foreground">
                  Os detalhes desta pessoa não vieram agora. Tente abrir de novo em instantes.
                </p>
              ) : (
                <div className="divide-y divide-border/60 rounded-lg border border-border">
                  {lotacao && (
                    <LinhaSobre Icone={Building2} rotulo="Setor e equipe" valor={lotacao} />
                  )}
                  {perfil?.lideres && (
                    <LinhaSobre Icone={UserCheck} rotulo="Liderança" valor={perfil.lideres} />
                  )}
                  {perfil?.criado_em && (
                    <LinhaSobre
                      Icone={CalendarDays}
                      rotulo="Na planilha desde"
                      valor={`${format(parseISO(perfil.criado_em), 'dd/MM/yyyy')} · ${tempoDesde(perfil.criado_em)}`}
                    />
                  )}
                  {emFerias && (
                    <LinhaSobre
                      Icone={Palmtree}
                      rotulo="Situação"
                      valor={perfil?.ferias_ate
                        ? `De férias até ${format(parseISO(perfil.ferias_ate), 'dd/MM')}`
                        : 'De férias'}
                      destaque
                    />
                  )}
                </div>
              )}
            </section>

            {/* Só aparece para quem está NA conversa: na monitoria, «em
                comum» seria entre a pessoa e quem monitora — outra pergunta. */}
            {!!perfil?.grupos_em_comum.length && (
              <section className="px-3 pb-4">
                <p className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {perfil.grupos_em_comum.length === 1
                    ? '1 grupo em comum'
                    : `${perfil.grupos_em_comum.length} grupos em comum`}
                </p>
                {perfil.grupos_em_comum.map(g => (
                  <button
                    key={g.id}
                    type="button"
                    disabled={!onAbrirConversa}
                    onClick={() => onAbrirConversa?.(g.id)}
                    className="flex w-full items-center gap-2.5 rounded-lg px-1 py-1.5 text-left transition-colors enabled:hover:bg-muted/60 disabled:cursor-default"
                  >
                    <FotoGrupo foto={g.foto_url} />
                    <span className="min-w-0 flex-1 truncate text-sm">{g.nome}</span>
                  </button>
                ))}
              </section>
            )}
          </>
        ) : (
          <section className="p-2">
            <GradeMidias conversaId={conversa.id} ativo={secao === 'galeria'} />
          </section>
        )}
      </div>

      {/* A foto ampliada fica dentro do painel, não numa janela nova: fecha
          com um clique em qualquer lugar e devolve a pessoa ao cartão. */}
      {fotoAmpliada && foto && (
        <button
          type="button"
          onClick={() => setFotoAmpliada(false)}
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/80 p-6"
          aria-label="Fechar a foto"
        >
          <img src={foto} alt={nome} className="max-h-full max-w-full rounded-xl object-contain shadow-2xl" />
          <X className="absolute right-3 top-3 h-5 w-5 text-white/80" />
        </button>
      )}
    </div>
  );
}

function LinhaSobre({
  Icone, rotulo, valor, destaque = false,
}: {
  Icone: typeof Building2; rotulo: string; valor: string; destaque?: boolean;
}) {
  return (
    <div className="flex items-start gap-2.5 px-3 py-2">
      <Icone className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', destaque ? 'text-warning' : 'text-muted-foreground')} />
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{rotulo}</p>
        <p className="text-sm leading-snug">{valor}</p>
      </div>
    </div>
  );
}

/** A foto do grupo mora no balde privado: precisa ser assinada, como no cabeçalho. */
function FotoGrupo({ foto }: { foto: string | null }) {
  const src = useFotoResolvida(foto);
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-muted/50">
      {src
        ? <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
        : <Users className="h-3.5 w-3.5 text-muted-foreground" />}
    </span>
  );
}
