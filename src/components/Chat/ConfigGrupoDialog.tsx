/**
 * ConfigGrupoDialog.tsx — o painel de configurações do grupo.
 *
 * Reúne o que só quem administra pode mexer: foto, nome, a trava «só a
 * liderança escreve», quem está dentro, e quem sai. Mais «sair do grupo», que
 * é de todo mundo e por isso fica separado, embaixo, longe do resto.
 *
 * ## Por que uma tela só, e não um menu com cinco itens
 *
 * As decisões se explicam umas às outras: travar a escrita só faz sentido
 * quando se vê quem é liderança na lista de membros, e remover alguém é a ação
 * que mais precisa da lista ao lado. Espalhá-las em itens de menu obrigaria a
 * abrir e fechar para conferir.
 *
 * ## O que a tela NÃO decide
 *
 * Nada de acesso. Cada botão daqui chama uma RPC que confere duas coisas no
 * banco: a permissão do painel (`chat_grupo_editar` e companhia) e a
 * administração DESTE grupo. Se a tela estiver aberta com informação velha —
 * alguém me tirou de administrador enquanto ela estava aberta —, a ação falha
 * lá e o erro aparece aqui. A tela é conveniência, não a régua.
 */
import { useEffect, useRef, useState } from 'react';
import {
  Loader2, Camera, Trash2, UserPlus, LogOut, Lock, Users, ShieldCheck,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import {
  listarMembros, configurarGrupo, removerDoGrupo, sairDoGrupo,
  adicionarAoGrupo, subirFotoDoGrupo, type MembroGrupo,
} from '@/services/chat/grupos.service';
import { listarContatos, type ContatoChat, type ConversaChat } from '@/services/chat/chat.service';
import { AvatarChat, useFotoResolvida } from './comum';

interface Props {
  aberto:   boolean;
  conversa: ConversaChat;
  meuId:    string;
  onFechar: () => void;
  /** Recarrega a lista de conversas: nome e foto mudam a linha lá fora. */
  onMudou:  () => void;
  /** Saí do grupo — a janela precisa fechar a conversa aberta. */
  onSai:    () => void;
}

export function ConfigGrupoDialog({
  aberto, conversa, meuId, onFechar, onMudou, onSai,
}: Props) {
  const { temPermissao } = useCargoPermissoes();
  const [membros, setMembros] = useState<MembroGrupo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [nome, setNome] = useState(conversa.outro_nome);
  const [travado, setTravado] = useState(conversa.somente_lideranca);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [adicionando, setAdicionando] = useState(false);
  const [candidatos, setCandidatos] = useState<ContatoChat[]>([]);
  const inputFoto = useRef<HTMLInputElement>(null);
  // O balde do chat e privado: o caminho gravado vira URL assinada aqui.
  const fotoAtual = useFotoResolvida(conversa.outro_foto);

  const souAdmin = conversa.sou_admin;
  const podeEditar    = souAdmin && temPermissao('chat_grupo_editar');
  const podeAdicionar = souAdmin && temPermissao('chat_grupo_adicionar');
  const podeRemover   = souAdmin && temPermissao('chat_grupo_remover');

  const recarregar = () => {
    setCarregando(true);
    void listarMembros(conversa.id).then(m => { setMembros(m); setCarregando(false); });
  };

  useEffect(() => {
    if (!aberto) return;
    setNome(conversa.outro_nome);
    setTravado(conversa.somente_lideranca);
    setErro(null);
    setAdicionando(false);
    recarregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, conversa.id]);

  async function agir(acao: () => Promise<{ erro: string | null }>, depois?: () => void) {
    setSalvando(true);
    setErro(null);
    try {
      const { erro: falha } = await acao();
      if (falha) { setErro(falha); return; }
      depois?.();
      onMudou();
    } finally { setSalvando(false); }
  }

  const nomeMudou = nome.trim() !== conversa.outro_nome && nome.trim().length > 0;

  async function escolherFoto(arquivo: File) {
    setSalvando(true);
    setErro(null);
    try {
      const { url, erro: falha } = await subirFotoDoGrupo(conversa.id, arquivo);
      if (falha || !url) { setErro(falha ?? 'A foto não subiu.'); return; }
      const r = await configurarGrupo({ conversaId: conversa.id, fotoUrl: url });
      if (r.erro) { setErro(r.erro); return; }
      onMudou();
    } finally { setSalvando(false); }
  }

  async function abrirAdicionar() {
    setAdicionando(true);
    if (candidatos.length === 0) setCandidatos(await listarContatos());
  }

  // Quem já está dentro não entra na lista de adicionar — oferecer alguém que
  // já é membro é oferecer uma ação sem efeito.
  const dentro = new Set(membros.map(m => m.perfil_id));
  const paraAdicionar = candidatos.filter(c => !dentro.has(c.perfil_id));

  return (
    <Dialog open={aberto} onOpenChange={o => { if (!o && !salvando) onFechar(); }}>
      <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" /> {conversa.outro_nome}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {souAdmin
              ? 'Você administra este grupo.'
              : 'Só quem administra o grupo pode alterar estas configurações.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 space-y-4 overflow-y-auto -mx-1 px-1">
          {/* ── Identidade ─────────────────────────────────────────────── */}
          <section className="flex items-center gap-3">
            <button
              type="button"
              disabled={!podeEditar || salvando}
              onClick={() => inputFoto.current?.click()}
              title={podeEditar ? 'Trocar a foto do grupo' : 'Só quem administra troca a foto'}
              className={cn(
                'relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full',
                'border border-border bg-muted/50 transition-colors',
                podeEditar ? 'hover:bg-muted' : 'cursor-not-allowed opacity-70',
              )}
            >
              {fotoAtual
                ? <img src={fotoAtual} alt="" className="h-full w-full object-cover" />
                : <Camera className="h-5 w-5 text-muted-foreground" />}
            </button>
            <input
              ref={inputFoto} type="file" accept="image/*" className="sr-only"
              onChange={e => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) void escolherFoto(f);
              }}
            />
            <div className="min-w-0 flex-1 space-y-1">
              <Label htmlFor="cfg-nome" className="text-xs">Nome</Label>
              <div className="flex gap-1.5">
                <Input
                  id="cfg-nome" value={nome} maxLength={60} disabled={!podeEditar}
                  onChange={e => setNome(e.target.value)} className="h-8 text-sm"
                />
                {nomeMudou && podeEditar && (
                  <Button size="sm" className="h-8 shrink-0" disabled={salvando}
                          onClick={() => void agir(
                            () => configurarGrupo({ conversaId: conversa.id, nome: nome.trim() }),
                          )}>
                    Salvar
                  </Button>
                )}
              </div>
              {conversa.outro_foto && podeEditar && (
                <button
                  type="button" disabled={salvando}
                  onClick={() => void agir(
                    () => configurarGrupo({ conversaId: conversa.id, fotoUrl: null }),
                  )}
                  className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
                >
                  Remover a foto
                </button>
              )}
            </div>
          </section>

          {/* ── Quem escreve ───────────────────────────────────────────── */}
          <section className="rounded-lg border border-border p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-sm font-medium">
                  <Lock className="h-3.5 w-3.5" /> Só a liderança escreve
                </p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                  Ligado, só a liderança escreve — quem opera continua LENDO
                  tudo, e o campo de escrita dá lugar a um aviso. Liderança aqui
                  é quem o painel deixa criar grupos.
                </p>
              </div>
              <Switch
                checked={travado}
                disabled={!podeEditar || salvando}
                onCheckedChange={v => {
                  setTravado(v);
                  void agir(
                    () => configurarGrupo({ conversaId: conversa.id, somenteLideranca: v }),
                    undefined,
                  );
                }}
              />
            </div>
          </section>

          {/* ── Membros ────────────────────────────────────────────────── */}
          <section className="space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {membros.length} {membros.length === 1 ? 'participante' : 'participantes'}
              </p>
              {podeAdicionar && !adicionando && (
                <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs"
                        onClick={() => void abrirAdicionar()}>
                  <UserPlus className="h-3.5 w-3.5" /> Adicionar
                </Button>
              )}
            </div>

            {carregando ? (
              <p className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando…
              </p>
            ) : membros.map(m => (
              <div key={m.perfil_id} className="flex items-center gap-2.5 rounded-lg px-1 py-1.5 hover:bg-muted/50">
                <AvatarChat nome={m.nome} foto={m.foto_url} tamanho={30} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-sm leading-tight">
                    <span className="truncate">{m.perfil_id === meuId ? 'Você' : m.nome}</span>
                    {m.admin && (
                      <span title="Administra o grupo"
                            className="inline-flex shrink-0 items-center gap-0.5 rounded bg-primary/10 px-1 py-px text-[9px] font-bold uppercase text-primary">
                        <ShieldCheck className="h-2.5 w-2.5" /> adm
                      </span>
                    )}
                  </p>
                  <p className="truncate text-[11px] leading-tight text-muted-foreground">
                    {m.usuario ? `@${m.usuario}` : m.cargo}
                  </p>
                </div>
                {podeRemover && m.perfil_id !== meuId && (
                  <button
                    type="button" disabled={salvando}
                    onClick={() => void agir(
                      () => removerDoGrupo(conversa.id, m.perfil_id), recarregar,
                    )}
                    title={`Remover ${m.nome} do grupo`}
                    className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}

            {/* Lista de adicionar: aparece embaixo dos membros, não numa
                segunda janela — quem adiciona acabou de olhar quem já está. */}
            {adicionando && (
              <div className="mt-2 rounded-lg border border-dashed border-border p-2">
                <p className="mb-1.5 text-[11px] text-muted-foreground">
                  Quem você alcança e ainda não está no grupo:
                </p>
                {paraAdicionar.length === 0 ? (
                  <p className="py-2 text-center text-xs text-muted-foreground">
                    Todo mundo do seu alcance já está aqui.
                  </p>
                ) : (
                  <div className="max-h-40 space-y-0.5 overflow-y-auto">
                    {paraAdicionar.map(c => (
                      <button
                        key={c.perfil_id}
                        disabled={salvando}
                        onClick={() => void agir(
                          async () => {
                            const r = await adicionarAoGrupo(conversa.id, [c.perfil_id]);
                            return { erro: r.erro };
                          },
                          recarregar,
                        )}
                        className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left transition-colors hover:bg-muted/60"
                      >
                        <AvatarChat nome={c.nome} foto={c.foto_url} tamanho={24} />
                        <span className="truncate text-xs">{c.nome}</span>
                        <UserPlus className="ml-auto h-3 w-3 shrink-0 text-muted-foreground" />
                      </button>
                    ))}
                  </div>
                )}
                <Button variant="ghost" size="sm" className="mt-1 h-7 w-full text-xs"
                        onClick={() => setAdicionando(false)}>
                  Fechar
                </Button>
              </div>
            )}
          </section>

          {erro && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{erro}</p>
          )}
        </div>

        {/* Sair fica no rodapé, separado: é de todo mundo e é irreversível
            sem alguém readicionar. Longe dos controles que se usa todo dia. */}
        <div className="shrink-0 border-t border-border pt-3">
          <Button
            variant="ghost" size="sm"
            className="h-8 w-full gap-1.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
            disabled={salvando}
            onClick={() => void agir(
              () => sairDoGrupo(conversa.id),
              () => { onFechar(); onSai(); },
            )}
          >
            <LogOut className="h-3.5 w-3.5" /> Sair do grupo
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
