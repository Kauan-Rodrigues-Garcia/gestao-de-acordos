/**
 * DisparoDialog.tsx — escolher quem recebe, depois escrever.
 *
 * ## Dois passos, e o de volta é de verdade
 *
 * Escolher vinte pessoas e perder a seleção ao clicar em «voltar» é o tipo de
 * coisa que faz alguém desistir da ferramenta. A seleção vive no componente de
 * fora dos dois passos: voltar troca a tela, não o estado.
 *
 * ## Marcar o setor marca quem o BANCO deixaria receber
 *
 * A lista vem de `fn_chat_contatos`, já filtrada por alcance e por quem
 * consegue receber. Se a tela montasse os grupos por conta própria, marcar um
 * setor incluiria gente sem chat e o disparo voltaria com «pulados» que ninguém
 * entenderia.
 *
 * Clone aparece nas duas equipes dele — é assim que ele existe no sistema, e
 * marcar as duas não manda a mensagem duas vezes: a RPC trabalha por pessoa.
 */
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Loader2, Search, Send, Users } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import {
  listarContatos, dispararMensagem, type ContatoChat,
} from '@/services/chat/chat.service';
import { AvatarChat } from './comum';

interface Props {
  aberto:    boolean;
  onFechar:  () => void;
  onPronto:  (enviados: number) => void;
}

/** Um agrupamento da lista: um setor, ou uma equipe dentro dele. */
interface Grupo {
  chave:   string;
  rotulo:  string;
  nivel:   'setor' | 'equipe';
  pessoas: ContatoChat[];
}

export function DisparoDialog({ aberto, onFechar, onPronto }: Props) {
  const [passo, setPasso] = useState<1 | 2>(1);
  const [contatos, setContatos] = useState<ContatoChat[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [busca, setBusca] = useState('');
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!aberto) return;
    setCarregando(true);
    void listarContatos().then(c => { setContatos(c); setCarregando(false); });
  }, [aberto]);

  // Fecha zerando: um disparo antigo pendurado no formulário é um disparo
  // acidental esperando para acontecer.
  useEffect(() => {
    if (aberto) return;
    setPasso(1); setMarcados(new Set()); setTexto(''); setBusca(''); setErro(null);
  }, [aberto]);

  /** Setores, e as equipes dentro de cada um. Pessoa sem equipe fica no setor. */
  const grupos = useMemo<Grupo[]>(() => {
    const termo = busca.trim().toLowerCase();
    const visiveis = termo
      ? contatos.filter(c =>
          c.nome.toLowerCase().includes(termo) || (c.usuario ?? '').toLowerCase().includes(termo))
      : contatos;

    const porSetor = new Map<string, ContatoChat[]>();
    for (const c of visiveis) {
      const chave = c.setor_id ?? '__sem_setor__';
      porSetor.set(chave, [...(porSetor.get(chave) ?? []), c]);
    }

    const saida: Grupo[] = [];
    for (const [setorId, pessoas] of porSetor) {
      saida.push({
        chave: `setor:${setorId}`,
        rotulo: pessoas[0]?.setor_nome ?? 'Sem setor',
        nivel: 'setor',
        pessoas,
      });
      const porEquipe = new Map<string, ContatoChat[]>();
      for (const c of pessoas) {
        if (!c.equipe_id) continue;
        porEquipe.set(c.equipe_id, [...(porEquipe.get(c.equipe_id) ?? []), c]);
      }
      for (const [equipeId, membros] of porEquipe) {
        saida.push({
          chave: `equipe:${equipeId}`,
          rotulo: membros[0]?.equipe_nome ?? 'Equipe',
          nivel: 'equipe',
          pessoas: membros,
        });
      }
    }
    return saida;
  }, [contatos, busca]);

  const alternarPessoa = (id: string) => {
    setMarcados(atual => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id); else novo.add(id);
      return novo;
    });
  };

  const alternarGrupo = (g: Grupo) => {
    const ids = g.pessoas.map(p => p.perfil_id);
    const todosMarcados = ids.every(id => marcados.has(id));
    setMarcados(atual => {
      const novo = new Set(atual);
      for (const id of ids) { if (todosMarcados) novo.delete(id); else novo.add(id); }
      return novo;
    });
  };

  const disparar = async () => {
    if (!marcados.size || !texto.trim() || enviando) return;
    setEnviando(true);
    setErro(null);
    const r = await dispararMensagem([...marcados], texto);
    setEnviando(false);
    if (r.erro) { setErro(r.erro); return; }
    onPronto(r.enviados);
    onFechar();
  };

  const escolhidos = contatos.filter(c => marcados.has(c.perfil_id));

  return (
    <Dialog open={aberto} onOpenChange={o => { if (!o) onFechar(); }}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            {passo === 2 && (
              <button onClick={() => setPasso(1)} className="p-1 -ml-1 rounded hover:bg-muted"
                      aria-label="Voltar para a seleção">
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <Users className="w-4 h-4" />
            {passo === 1 ? 'Para quem?' : 'A mensagem'}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {passo === 1
              ? 'Marque um setor, uma equipe, ou pessoa por pessoa.'
              : `Vai para ${marcados.size} ${marcados.size === 1 ? 'pessoa' : 'pessoas'}, cada uma na conversa dela.`}
          </DialogDescription>
        </DialogHeader>

        {passo === 1 ? (
          <>
            <div className="relative shrink-0">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={busca} onChange={e => setBusca(e.target.value)}
                placeholder="Procurar pessoa"
                className="w-full bg-muted/60 rounded-lg pl-8 pr-2 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1">
              {carregando && <p className="text-center text-xs text-muted-foreground py-8">Carregando…</p>}
              {!carregando && grupos.length === 0 && (
                <p className="text-center text-xs text-muted-foreground py-8">
                  Ninguém disponível para receber.
                </p>
              )}

              {grupos.map(g => {
                const ids = g.pessoas.map(p => p.perfil_id);
                const todos = ids.length > 0 && ids.every(id => marcados.has(id));
                const alguns = !todos && ids.some(id => marcados.has(id));

                return (
                  <div key={g.chave} className={cn('py-1', g.nivel === 'equipe' && 'pl-4')}>
                    <button
                      onClick={() => alternarGrupo(g)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted/60 transition-colors"
                    >
                      <Checkbox checked={todos ? true : alguns ? 'indeterminate' : false} />
                      <span className={cn(
                        'text-xs flex-1 text-left',
                        g.nivel === 'setor' ? 'font-semibold uppercase tracking-wide' : 'font-medium',
                      )}>
                        {g.rotulo}
                      </span>
                      <span className="text-[10px] text-muted-foreground">{g.pessoas.length}</span>
                    </button>

                    {g.nivel === 'equipe' && g.pessoas.map(p => (
                      <button
                        key={p.perfil_id}
                        onClick={() => alternarPessoa(p.perfil_id)}
                        className="w-full flex items-center gap-2 pl-6 pr-2 py-1.5 rounded-lg hover:bg-muted/50 transition-colors"
                      >
                        <Checkbox checked={marcados.has(p.perfil_id)} />
                        <AvatarChat nome={p.nome} foto={p.foto_url} tamanho={24} />
                        <span className="text-xs truncate flex-1 text-left">{p.nome}</span>
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-border shrink-0">
              <p className="text-xs text-muted-foreground flex-1">
                {marcados.size
                  ? `${marcados.size} ${marcados.size === 1 ? 'selecionada' : 'selecionadas'}`
                  : 'Ninguém selecionado'}
              </p>
              {marcados.size > 0 && (
                <Button variant="ghost" size="sm" className="text-xs"
                        onClick={() => setMarcados(new Set())}>
                  Limpar
                </Button>
              )}
              <Button size="sm" disabled={!marcados.size} onClick={() => setPasso(2)}>
                Avançar
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto shrink-0">
              {escolhidos.slice(0, 40).map(p => (
                <span key={p.perfil_id}
                      className="flex items-center gap-1 text-[11px] bg-muted rounded-full pl-1 pr-2 py-0.5">
                  <AvatarChat nome={p.nome} foto={p.foto_url} tamanho={18} />
                  <span className="max-w-[110px] truncate">{p.nome}</span>
                </span>
              ))}
              {escolhidos.length > 40 && (
                <span className="text-[11px] text-muted-foreground self-center">
                  +{escolhidos.length - 40}
                </span>
              )}
            </div>

            <textarea
              value={texto} onChange={e => setTexto(e.target.value)} rows={6} autoFocus
              placeholder="Escreva a mensagem que todos vão receber"
              className="w-full resize-none bg-muted/60 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
            />

            {erro && <p className="text-xs text-destructive">{erro}</p>}

            <div className="flex items-center gap-2 shrink-0">
              <Button variant="ghost" size="sm" onClick={() => setPasso(1)}>Voltar</Button>
              <div className="flex-1" />
              <Button size="sm" onClick={() => void disparar()}
                      disabled={enviando || !texto.trim()}>
                {enviando
                  ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Enviando…</>
                  : <><Send className="w-3.5 h-3.5 mr-1.5" /> Enviar para {marcados.size}</>}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
