/**
 * NovoGrupoDialog.tsx — montar o grupo.
 *
 * Nome, foto e quem entra, na mesma tela. A foto é opcional e o nome não: um
 * grupo sem nome é uma linha sem rótulo na lista de todo mundo, e o banco
 * recusa (`chat_conversa_coerente`).
 *
 * A lista de pessoas é a MESMA de `NovaConversaDialog` — `fn_chat_contatos`,
 * o alcance do chat. Quem eu posso chamar no privado é quem eu posso colocar
 * no grupo, e o banco confere de novo (`fn_chat_alcanca` dentro de
 * `fn_chat_grupo_criar`) para o caso de a tela estar desatualizada.
 *
 * ## A foto sobe DEPOIS do grupo existir
 *
 * A policy do storage confere `fn_chat_grupo_administro(<conversa_id>)` a
 * partir do caminho do arquivo — logo, o grupo precisa existir antes de haver
 * caminho válido. Por isso a ordem é: cria, sobe, configura. Se a foto falhar,
 * o grupo fica de pé sem ela e a pessoa é avisada; o contrário (abortar o
 * grupo porque a imagem não subiu) perderia o trabalho de escolher dez
 * participantes.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Loader2, Camera, X, Users, Check } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { listarContatos, type ContatoChat } from '@/services/chat/chat.service';
import { criarGrupo, configurarGrupo, subirFotoDoGrupo } from '@/services/chat/grupos.service';
import { AvatarChat, TagEmpresa } from './comum';

interface Props {
  aberto:   boolean;
  onFechar: () => void;
  /** Recebe o id do grupo criado, para a janela já abri-lo. */
  onCriado: (conversaId: string) => void;
}

export function NovoGrupoDialog({ aberto, onFechar, onCriado }: Props) {
  const [contatos, setContatos] = useState<ContatoChat[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState('');
  const [nome, setNome] = useState('');
  const [escolhidos, setEscolhidos] = useState<Set<string>>(new Set());
  const [foto, setFoto] = useState<File | null>(null);
  const [previa, setPrevia] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const inputFoto = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!aberto) return;
    setBusca(''); setNome(''); setEscolhidos(new Set());
    setFoto(null); setPrevia(null); setErro(null);
    setCarregando(true);
    void listarContatos().then(c => { setContatos(c); setCarregando(false); });
  }, [aberto]);

  // `createObjectURL` reserva memória até alguém revogar. Sem isto, cada troca
  // de foto na mesma sessão deixaria um blob pendurado.
  useEffect(() => {
    if (!foto) { setPrevia(null); return; }
    const url = URL.createObjectURL(foto);
    setPrevia(url);
    return () => URL.revokeObjectURL(url);
  }, [foto]);

  /*
   * Uma pessoa por linha, mesmo aparecendo em duas equipes.
   *
   * `fn_chat_contatos` devolve uma linha por equipe (o clone existe nas duas).
   * Escolher quem entra no grupo é escolher PESSOAS, e o mesmo nome duas vezes
   * viraria dois check-boxes para o mesmo participante.
   */
  const pessoas = useMemo(() => {
    const unicas = new Map<string, ContatoChat>();
    for (const c of contatos) if (!unicas.has(c.perfil_id)) unicas.set(c.perfil_id, c);
    const termo = busca.trim().toLowerCase();
    const lista = [...unicas.values()];
    return termo
      ? lista.filter(c =>
          c.nome.toLowerCase().includes(termo) || (c.usuario ?? '').toLowerCase().includes(termo))
      : lista;
  }, [contatos, busca]);

  function alternar(id: string) {
    setEscolhidos(atual => {
      const copia = new Set(atual);
      if (copia.has(id)) copia.delete(id); else copia.add(id);
      return copia;
    });
  }

  async function criar() {
    if (!nome.trim() || escolhidos.size === 0 || salvando) return;
    setSalvando(true);
    setErro(null);
    try {
      const { id, erro: falha } = await criarGrupo(nome.trim(), [...escolhidos]);
      if (falha || !id) { setErro(falha ?? 'Não foi possível criar o grupo.'); return; }

      // A foto é a segunda etapa, e a falha dela não desfaz o grupo — ver o
      // cabeçalho. O aviso sai por `erro`, mas a janela já abre o grupo.
      if (foto) {
        const { url, erro: falhaFoto } = await subirFotoDoGrupo(id, foto);
        if (url) await configurarGrupo({ conversaId: id, fotoUrl: url });
        else if (falhaFoto) setErro(`Grupo criado, mas a foto não subiu: ${falhaFoto}`);
      }

      onCriado(id);
      if (!foto) onFechar();
      else setTimeout(onFechar, 900);   // dá tempo de ler o aviso da foto
    } finally { setSalvando(false); }
  }

  return (
    <Dialog open={aberto} onOpenChange={o => { if (!o && !salvando) onFechar(); }}>
      <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" /> Novo grupo
          </DialogTitle>
          <DialogDescription className="text-xs">
            Você pode adicionar quem já está no seu alcance do chat.
          </DialogDescription>
        </DialogHeader>

        {/* Identidade do grupo */}
        <div className="flex shrink-0 items-center gap-3">
          <button
            type="button"
            onClick={() => inputFoto.current?.click()}
            title="Escolher a foto do grupo"
            className={cn(
              'relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden',
              'rounded-full border border-dashed border-border bg-muted/50',
              'transition-colors hover:bg-muted',
            )}
          >
            {previa
              ? <img src={previa} alt="" className="h-full w-full object-cover" />
              : <Camera className="h-5 w-5 text-muted-foreground" />}
          </button>
          <input
            ref={inputFoto} type="file" accept="image/*" className="sr-only"
            onChange={e => { setFoto(e.target.files?.[0] ?? null); e.target.value = ''; }}
          />
          <div className="min-w-0 flex-1 space-y-1">
            <Label htmlFor="grupo-nome" className="text-xs">Nome do grupo</Label>
            <Input
              id="grupo-nome" value={nome} onChange={e => setNome(e.target.value)}
              placeholder="Ex.: Play 4 — avisos" maxLength={60} className="h-9"
            />
          </div>
        </div>

        <div className="relative shrink-0">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={busca} onChange={e => setBusca(e.target.value)}
            placeholder="Procurar quem adicionar"
            className="w-full bg-muted/60 rounded-lg pl-8 pr-2 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1">
          {carregando && (
            <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground py-8">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando…
            </p>
          )}
          {!carregando && pessoas.length === 0 && (
            <p className="py-8 text-center text-xs text-muted-foreground">
              {busca.trim() ? 'Ninguém com esse nome.' : 'Ninguém disponível no seu alcance.'}
            </p>
          )}
          {pessoas.map(p => {
            const dentro = escolhidos.has(p.perfil_id);
            return (
              <button
                key={p.perfil_id}
                onClick={() => alternar(p.perfil_id)}
                aria-pressed={dentro}
                className={cn(
                  'w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-left transition-colors',
                  dentro ? 'bg-primary/10' : 'hover:bg-muted/60',
                )}
              >
                <AvatarChat nome={p.nome} foto={p.foto_url} tamanho={32} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-tight flex items-center gap-1.5">
                    <span className="truncate">{p.nome}</span>
                    <TagEmpresa slug={p.multiempresa ? null : p.empresa_slug} />
                  </p>
                  <p className="text-[11px] text-muted-foreground truncate leading-tight">
                    {[p.setor_nome, p.equipe_nome].filter(Boolean).join(' · ') || p.usuario}
                  </p>
                </div>
                <span className={cn(
                  'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
                  dentro ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
                )}>
                  {dentro && <Check className="h-3 w-3" />}
                </span>
              </button>
            );
          })}
        </div>

        {erro && (
          <p className="shrink-0 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {erro}
          </p>
        )}

        <DialogFooter className="shrink-0 sm:justify-between">
          <p className="self-center text-xs text-muted-foreground">
            {escolhidos.size === 0
              ? 'Escolha ao menos uma pessoa'
              : `${escolhidos.size} ${escolhidos.size === 1 ? 'pessoa' : 'pessoas'} · você entra como administrador`}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onFechar} disabled={salvando}>
              <X className="mr-1.5 h-3.5 w-3.5" /> Cancelar
            </Button>
            <Button onClick={() => void criar()} disabled={!nome.trim() || escolhidos.size === 0 || salvando}>
              {salvando && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Criar grupo
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
