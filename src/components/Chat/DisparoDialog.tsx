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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, FileText, Image as ImageIcon, Loader2, Paperclip, Search, Send, Users, X,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import {
  listarContatos, dispararMensagem, subirAnexo, LIMITE_ANEXO,
  type AnexoChat, type ContatoChat,
} from '@/services/chat/chat.service';
import { AvatarChat, tamanhoLegivel } from './comum';
import { PERFIL_COLORS } from '@/lib/index';

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

/** Ordem e tag são apresentação do cadastro, não autorização de acesso. */
const PRIORIDADE_NO_DISPARO: Record<string, number> = { lider: 0 };

export function DisparoDialog({ aberto, onFechar, onPronto }: Props) {
  const [passo, setPasso] = useState<1 | 2>(1);
  const [contatos, setContatos] = useState<ContatoChat[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [busca, setBusca] = useState('');
  const [texto, setTexto] = useState('');
  const [pendentes, setPendentes] = useState<File[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const pastaDoDisparo = useRef(`disparos/${crypto.randomUUID()}`);

  const previas = useMemo(() => pendentes.map(arquivo => ({
    arquivo,
    url: arquivo.type.startsWith('image/') ? URL.createObjectURL(arquivo) : null,
  })), [pendentes]);

  useEffect(() => () => {
    for (const previa of previas) if (previa.url) URL.revokeObjectURL(previa.url);
  }, [previas]);

  useEffect(() => {
    if (!aberto) return;
    setCarregando(true);
    void listarContatos().then(c => { setContatos(c); setCarregando(false); });
  }, [aberto]);

  // Fecha zerando: um disparo antigo pendurado no formulário é um disparo
  // acidental esperando para acontecer.
  useEffect(() => {
    if (aberto) return;
    setPasso(1); setMarcados(new Set()); setTexto(''); setPendentes([]);
    setBusca(''); setErro(null); setArrastando(false);
    pastaDoDisparo.current = `disparos/${crypto.randomUUID()}`;
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

    const ordenar = (pessoas: ContatoChat[]) => [...pessoas].sort((a, b) => {
      const prioridadeA = PRIORIDADE_NO_DISPARO[a.cargo] ?? 1;
      const prioridadeB = PRIORIDADE_NO_DISPARO[b.cargo] ?? 1;
      return prioridadeA - prioridadeB || a.nome.localeCompare(b.nome, 'pt-BR');
    });

    const saida: Grupo[] = [];
    for (const [setorId, pessoas] of porSetor) {
      saida.push({
        chave: `setor:${setorId}`,
        rotulo: pessoas[0]?.setor_nome ?? 'Sem setor',
        nivel: 'setor',
        pessoas: ordenar(pessoas),
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
          pessoas: ordenar(membros),
        });
      }

      // Este era o buraco da lista: a pessoa entrava no número do setor, mas
      // só desenhávamos linhas dentro de equipes. Líderes e outros usuários
      // vinculados apenas ao setor ficavam invisíveis para seleção individual.
      const semEquipe = pessoas.filter(p => !p.equipe_id);
      if (semEquipe.length > 0) {
        saida.push({
          chave: `equipe:${setorId}:sem-equipe`,
          rotulo: 'Sem equipe',
          nivel: 'equipe',
          pessoas: ordenar(semEquipe),
        });
      }
    }
    return saida;
  }, [contatos, busca]);

  const receberArquivos = useCallback((arquivos: File[]) => {
    const grandes = arquivos.filter(a => a.size > LIMITE_ANEXO);
    const bons = arquivos.filter(a => a.size <= LIMITE_ANEXO);
    if (grandes.length) {
      setErro(grandes.length === 1
        ? `«${grandes[0].name}» tem ${tamanhoLegivel(grandes[0].size)} e o limite é 10 MB.`
        : `${grandes.length} arquivos passam de 10 MB e ficaram de fora.`);
    }
    if (bons.length) setPendentes(atuais => [...atuais, ...bons]);
  }, []);

  const aoColar = useCallback((e: React.ClipboardEvent) => {
    const arquivos = [...e.clipboardData.files];
    if (arquivos.length) { e.preventDefault(); receberArquivos(arquivos); }
  }, [receberArquivos]);

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
    if (!marcados.size || (!texto.trim() && !pendentes.length) || enviando) return;
    setEnviando(true);
    setErro(null);

    const anexos: AnexoChat[] = [];
    for (const arquivo of pendentes) {
      const { anexo, erro: falha } = await subirAnexo(arquivo, pastaDoDisparo.current);
      if (falha) { setErro(falha); setEnviando(false); return; }
      if (anexo) anexos.push(anexo);
    }

    const r = await dispararMensagem([...marcados], texto, anexos);
    setEnviando(false);
    if (r.erro) { setErro(r.erro); return; }
    onPronto(r.enviados);
    onFechar();
  };

  const escolhidos = [...new Map(
    contatos.filter(c => marcados.has(c.perfil_id)).map(c => [c.perfil_id, c]),
  ).values()];

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
                        {PRIORIDADE_NO_DISPARO[p.cargo] === 0 && (
                          <span className={cn(
                            'shrink-0 rounded border px-1.5 py-px text-[9px] font-semibold',
                            PERFIL_COLORS.lider,
                          )}>
                            Líder
                          </span>
                        )}
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

            <div
              className={cn(
                'relative rounded-xl border border-transparent transition-colors',
                arrastando && 'border-primary bg-primary/5',
              )}
              onDragOver={e => { e.preventDefault(); setArrastando(true); }}
              onDragLeave={e => { if (e.currentTarget === e.target) setArrastando(false); }}
              onDrop={e => {
                e.preventDefault(); setArrastando(false);
                receberArquivos([...e.dataTransfer.files]);
              }}
            >
              {previas.length > 0 && (
                <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto border-b border-border/60 p-2">
                  {previas.map((previa, i) => (
                    <div key={`${previa.arquivo.name}-${i}`}
                         className="relative overflow-hidden rounded-lg border border-border bg-muted">
                      {previa.url ? (
                        <img src={previa.url} alt={previa.arquivo.name}
                             className="h-16 w-16 object-cover" />
                      ) : (
                        <div className="flex h-16 min-w-[110px] max-w-[160px] items-center gap-2 px-2 pr-7">
                          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="min-w-0">
                            <span className="block truncate text-[10px]">{previa.arquivo.name}</span>
                            <span className="block text-[9px] text-muted-foreground">
                              {tamanhoLegivel(previa.arquivo.size)}
                            </span>
                          </span>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => setPendentes(atuais => atuais.filter((_, j) => j !== i))}
                        className="absolute right-0.5 top-0.5 rounded-full bg-background/90 p-0.5 hover:bg-background"
                        aria-label={`Tirar ${previa.arquivo.name}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <textarea
                value={texto} onChange={e => setTexto(e.target.value)} rows={6} autoFocus
                onPaste={aoColar}
                placeholder="Escreva a mensagem que todos vão receber"
                className="w-full resize-none rounded-t-xl bg-muted/60 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
              />
              <div className="flex items-center border-t border-border/60 bg-muted/30 px-1.5 py-1">
                <label className="inline-flex cursor-pointer items-center">
                  <span className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
                    <Paperclip className="h-4 w-4" />
                    Anexar foto ou arquivo
                  </span>
                  <input type="file" multiple className="sr-only"
                         onChange={e => {
                           receberArquivos([...(e.target.files ?? [])]); e.target.value = '';
                         }} />
                </label>
                {pendentes.some(a => a.type.startsWith('image/')) && (
                  <span className="ml-auto inline-flex items-center gap-1 pr-2 text-[10px] text-muted-foreground">
                    <ImageIcon className="h-3 w-3" /> imagem pronta
                  </span>
                )}
              </div>
              {arrastando && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-background/85 text-sm font-medium text-primary">
                  Solte para anexar ao disparo
                </div>
              )}
            </div>

            {erro && <p className="text-xs text-destructive">{erro}</p>}

            <div className="flex items-center gap-2 shrink-0">
              <Button variant="ghost" size="sm" onClick={() => setPasso(1)}>Voltar</Button>
              <div className="flex-1" />
              <Button size="sm" onClick={() => void disparar()}
                      disabled={enviando || (!texto.trim() && !pendentes.length)}>
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
