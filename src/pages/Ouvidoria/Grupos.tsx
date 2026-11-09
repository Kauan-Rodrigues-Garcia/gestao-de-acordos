/**
 * Grupos.tsx — grupos de manifestações com a mesma reclamação do dia
 * (ex.: «pagou e não deu baixa»).
 *
 *   PainelGrupos   a aba «Grupos»: os cartões e «Novo grupo».
 *   FormGrupo      nome, assunto, relato em comum, canal e encaminhamento padrão.
 *   DetalheGrupo   a gaveta: quem está no grupo, «Adicionar profissional»
 *                  (formulário curto), «Mover para cá» (manifestações que já
 *                  existem), o ticket do grupo, encerrar e apagar.
 *
 * O grupo só organiza: cada manifestação continua com os próprios dados,
 * status, retorno e linha do tempo.
 */
import { useMemo, useState } from 'react';
import {
  Archive, ArchiveRestore, Copy, Layers, Loader2, Pencil, Plus, Search, Trash2, UserPlus, ArrowDownToLine,
} from 'lucide-react';
import { toast } from 'sonner';
import { AvatarChat } from '@/components/Chat/comum';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { contemCpf } from '@/lib/cpf';
import { cn } from '@/lib/utils';
import { excluirGrupo, moverParaGrupo, salvarGrupo } from '@/services/ouvidoriaCofen.service';
import { CampoLista } from './campos';
import { useOuvidoria } from './contexto';
import { copiarTexto } from './copiar';
import { FormManifestacao } from './FormManifestacao';
import {
  ASSUNTOS, CANAIS, dataBr, estaAberta, normalizar, rotuloAssunto, rotuloCanal, textoTicketGrupo,
  type Assunto, type Canal, type Grupo, type Manifestacao,
} from './ouvidoria';
import { AnosColoridos, SeloStatus } from './visual';

// ── A aba ────────────────────────────────────────────────────────────────────

export function PainelGrupos({ aoAbrirGrupo }: { aoAbrirGrupo: (id: string) => void }) {
  const { grupos, todas } = useOuvidoria();
  const [novo, setNovo] = useState(false);
  const [verEncerrados, setVerEncerrados] = useState(false);
  const membros = useMemo(() => {
    const r = new Map<string, Manifestacao[]>();
    for (const m of todas) if (m.grupo_id) r.set(m.grupo_id, [...(r.get(m.grupo_id) ?? []), m]);
    return r;
  }, [todas]);
  const ativos = grupos.filter(g => !g.encerrado_em);
  const encerrados = grupos.filter(g => g.encerrado_em);
  const visiveis = verEncerrados ? grupos : ativos;

  return (
    <div className="p-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2 px-1">
        <p className="text-xs text-muted-foreground flex-1 min-w-[220px]">
          Junte as reclamações iguais do dia. Dentro do grupo, cada profissional entra com um formulário curto —
          o assunto e o relato já vêm do grupo.
        </p>
        {encerrados.length > 0 && (
          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setVerEncerrados(v => !v)}>
            {verEncerrados ? 'Esconder encerrados' : `Ver encerrados (${encerrados.length})`}
          </Button>
        )}
        <Button size="sm" onClick={() => setNovo(true)}>
          <Plus className="h-3.5 w-3.5 mr-1.5" /> Novo grupo
        </Button>
      </div>

      {visiveis.length === 0 ? (
        <div className="py-12 text-center space-y-2">
          <Layers className="h-8 w-8 mx-auto text-muted-foreground/50" />
          <p className="text-sm font-medium">Nenhum grupo {verEncerrados ? '' : 'ativo '}ainda.</p>
          <p className="text-xs text-muted-foreground">Ex.: «Pagou e não deu baixa», «Cobrança depois do cancelamento».</p>
        </div>
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {visiveis.map(g => {
            const ms = membros.get(g.id) ?? [];
            const abertas = ms.filter(m => m.acompanhar && estaAberta(m)).length;
            return (
              <button key={g.id} type="button" onClick={() => aoAbrirGrupo(g.id)}
                      className={cn(
                        'text-left rounded-xl border bg-card p-3.5 hover:border-violet-500/50 hover:shadow-sm transition-all space-y-2',
                        g.encerrado_em && 'opacity-70',
                      )}>
                <div className="flex items-center gap-2">
                  <span className="h-8 w-8 rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400 flex items-center justify-center shrink-0">
                    <Layers className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate">{g.titulo}</p>
                    <p className="text-[11px] text-muted-foreground">
                      <span className="font-mono">{g.codigo}</span> · {rotuloAssunto(g.assunto)}{g.encerrado_em ? ' · encerrado' : ''}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2">{g.descricao}</p>
                <div className="flex items-center gap-3 text-[11px]">
                  <span><strong className="tabular-nums">{ms.length}</strong> {ms.length === 1 ? 'profissional' : 'profissionais'}</span>
                  {abertas > 0 && <span className="text-info"><strong className="tabular-nums">{abertas}</strong> {abertas === 1 ? 'aberta' : 'abertas'}</span>}
                  <span className="ml-auto text-muted-foreground">{g.criado_por_nome ?? ''}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {novo && <FormGrupo grupo={null} aoFechar={() => setNovo(false)} aoSalvar={g => { setNovo(false); aoAbrirGrupo(g.id); }} />}
    </div>
  );
}

// ── Formulário do grupo ──────────────────────────────────────────────────────

function FormGrupo({ grupo, aoFechar, aoSalvar }: {
  grupo: Grupo | null; aoFechar: () => void; aoSalvar: (g: Grupo) => void;
}) {
  const { setor, pessoas, recarregar } = useOuvidoria();
  const [titulo, setTitulo] = useState(grupo?.titulo ?? '');
  const [assunto, setAssunto] = useState<Assunto | ''>(grupo?.assunto ?? '');
  const [canal, setCanal] = useState<Canal | ''>(grupo?.canal ?? '');
  const [descricao, setDescricao] = useState(grupo?.descricao ?? '');
  const [providencia, setProvidencia] = useState(grupo?.providencia ?? '');
  const [responsavel, setResponsavel] = useState(grupo?.responsavel_id ?? '');
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    if (!titulo.trim() || !assunto || !descricao.trim()) { toast.error('Preencha o nome, o assunto e a reclamação em comum.'); return; }
    if (contemCpf(descricao) || contemCpf(providencia) || contemCpf(titulo)) {
      toast.error('Tem um CPF no texto. CPF não pode ser gravado no sistema.');
      return;
    }
    setSalvando(true);
    try {
      const g = await salvarGrupo(setor.setor_id, grupo?.id ?? null, {
        titulo: titulo.trim(), assunto, canal: canal || null, descricao: descricao.trim(),
        providencia: providencia.trim() || null, responsavel_id: responsavel || null, encerrado: !!grupo?.encerrado_em,
      });
      toast.success(grupo ? 'Grupo atualizado.' : `Grupo ${g.codigo} criado.`);
      recarregar();
      aoSalvar(g);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open onOpenChange={o => { if (!o && !salvando) aoFechar(); }}>
      <DialogContent className="max-w-xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{grupo ? `Editar ${grupo.codigo}` : 'Novo grupo'}</DialogTitle>
          <DialogDescription>O que for igual para todos fica aqui; cada profissional entra só com os dados dele.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3.5">
          <div>
            <Label htmlFor="grp-titulo" className="mb-1.5 block">Nome do grupo *</Label>
            <Input id="grp-titulo" autoFocus value={titulo} maxLength={120} onChange={e => setTitulo(e.target.value)}
                   placeholder="Ex.: Pagou e não deu baixa" className="rounded-lg" />
          </div>
          <div>
            <Label className="mb-1.5 block">Assunto *</Label>
            <div className="flex flex-wrap gap-1.5">
              {ASSUNTOS.map(a => (
                <button key={a.valor} type="button" onClick={() => setAssunto(a.valor)}
                        className={cn('rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                          assunto === a.valor ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted')}>
                  {a.rotulo}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label htmlFor="grp-desc" className="mb-1.5 block">Reclamação em comum *</Label>
            <Textarea id="grp-desc" rows={3} value={descricao} onChange={e => setDescricao(e.target.value)}
                      placeholder="O relato que vale para todos do grupo" className="rounded-lg" />
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="grp-canal" className="mb-1.5 block">Canal mais comum</Label>
              <CampoLista id="grp-canal" valor={canal} vazio="Telefone (padrão)" aoMudar={v => setCanal(v as Canal)}
                          opcoes={CANAIS.map(c => ({ valor: c.valor, rotulo: c.rotulo }))} />
            </div>
            <div>
              <Label htmlFor="grp-resp" className="mb-1.5 block">Encaminhar para (padrão)</Label>
              <CampoLista id="grp-resp" valor={responsavel} vazio="Ninguém" aoMudar={setResponsavel}
                          opcoes={pessoas.filter(p => p.tem_acesso).map(p => ({
                            valor: p.perfil_id, rotulo: p.nome, marca: <AvatarChat nome={p.nome} foto={p.foto_url} tamanho={20} />,
                          }))} />
            </div>
          </div>
          <div>
            <Label htmlFor="grp-prov" className="mb-1.5 block">Providência em comum</Label>
            <Textarea id="grp-prov" rows={2} value={providencia} onChange={e => setProvidencia(e.target.value)}
                      placeholder="O que já foi feito para todos (opcional)" className="rounded-lg" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={aoFechar} disabled={salvando}>Cancelar</Button>
          <Button onClick={() => void salvar()} disabled={salvando}>
            {salvando && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
            {grupo ? 'Salvar' : 'Criar grupo'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Mover manifestações existentes para o grupo ──────────────────────────────

function MoverParaGrupo({ grupo, aoFechar }: { grupo: Grupo; aoFechar: () => void }) {
  const { todas, recarregar } = useOuvidoria();
  const [busca, setBusca] = useState('');
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [movendo, setMovendo] = useState(false);

  const candidatas = useMemo(() => {
    const b = normalizar(busca.trim());
    return todas
      .filter(m => m.grupo_id !== grupo.id)
      .filter(m => !b || normalizar(`${m.codigo} ${m.nome_profissional} ${m.codigo_cliente ?? ''} ${m.descricao}`).includes(b))
      // As do mesmo assunto e abertas primeiro: são as que mais provavelmente entram.
      .sort((a, c) => Number(c.assunto === grupo.assunto) - Number(a.assunto === grupo.assunto)
        || Number(estaAberta(c)) - Number(estaAberta(a))
        || c.data_manifestacao.localeCompare(a.data_manifestacao))
      .slice(0, 60);
  }, [todas, grupo, busca]);

  const alternar = (id: string) => setMarcadas(s => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  async function mover() {
    setMovendo(true);
    let ok = 0;
    for (const id of marcadas) {
      try {
        await moverParaGrupo(id, grupo.id);
        ok += 1;
      } catch (err) {
        toast.error((err as Error).message);
        break;
      }
    }
    setMovendo(false);
    if (ok) toast.success(`${ok} ${ok === 1 ? 'manifestação movida' : 'manifestações movidas'} para ${grupo.codigo}.`);
    recarregar();
    aoFechar();
  }

  return (
    <Dialog open onOpenChange={o => { if (!o && !movendo) aoFechar(); }}>
      <DialogContent className="max-w-xl max-h-[88vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Mover para {grupo.codigo}</DialogTitle>
          <DialogDescription>Escolha manifestações que já existem. As de «{rotuloAssunto(grupo.assunto)}» aparecem primeiro.</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="OUV, nome, código do cliente"
                 className="h-9 pl-8 rounded-lg" autoFocus />
        </div>
        <ul className="flex-1 overflow-y-auto divide-y rounded-lg border min-h-[200px]">
          {candidatas.map(m => (
            <li key={m.id}>
              <label className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/40">
                <input type="checkbox" className="h-4 w-4 accent-primary" checked={marcadas.has(m.id)} onChange={() => alternar(m.id)} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{m.nome_profissional}</p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    <span className="font-mono">{m.codigo}</span> · {dataBr(m.data_manifestacao)} · {rotuloAssunto(m.assunto)}
                    {m.grupo_id ? ' · já está em outro grupo' : ''}
                  </p>
                </div>
                {m.acompanhar ? <SeloStatus status={m.status} /> : <span className="text-[10px] text-muted-foreground">Histórico</span>}
              </label>
            </li>
          ))}
          {!candidatas.length && <li className="py-8 text-center text-sm text-muted-foreground">Nada encontrado.</li>}
        </ul>
        <DialogFooter>
          <Button variant="ghost" onClick={aoFechar} disabled={movendo}>Cancelar</Button>
          <Button onClick={() => void mover()} disabled={movendo || marcadas.size === 0}>
            {movendo && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
            Mover {marcadas.size || ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── A gaveta do grupo ────────────────────────────────────────────────────────

export function DetalheGrupo({ grupoId, aoFechar }: { grupoId: string | null; aoFechar: () => void }) {
  const { grupos, todas, setor, etiquetas, recarregar, abrirManifestacao } = useOuvidoria();
  const g = grupos.find(x => x.id === grupoId) ?? null;
  const [editando, setEditando] = useState(false);
  const [adicionando, setAdicionando] = useState(false);
  const [movendo, setMovendo] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const membros = useMemo(() => todas.filter(m => m.grupo_id === grupoId)
    .sort((a, b) => b.data_manifestacao.localeCompare(a.data_manifestacao) || b.numero - a.numero), [todas, grupoId]);
  const abertas = membros.filter(m => m.acompanhar && estaAberta(m));

  async function encerrar(encerrado: boolean) {
    if (!g) return;
    setOcupado('encerrar');
    try {
      await salvarGrupo(setor.setor_id, g.id, {
        titulo: g.titulo, assunto: g.assunto, canal: g.canal, descricao: g.descricao, providencia: g.providencia,
        responsavel_id: g.responsavel_id, encerrado,
      });
      toast.success(encerrado ? 'Grupo encerrado.' : 'Grupo reaberto.');
      recarregar();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setOcupado(null);
    }
  }

  async function apagar() {
    if (!g) return;
    if (!window.confirm(`Apagar o grupo ${g.codigo}? As ${membros.length} manifestações continuam, só saem do grupo.`)) return;
    setOcupado('apagar');
    try {
      await excluirGrupo(g.id);
      toast.success('Grupo apagado.');
      aoFechar();
      recarregar();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setOcupado(null);
    }
  }

  return (
    <>
      <Sheet open={!!g} onOpenChange={o => { if (!o) aoFechar(); }}>
        <SheetContent className="w-full sm:max-w-xl p-0 flex flex-col gap-0">
          {g && (
            <>
              <SheetHeader className="px-5 pt-5 pb-4 border-b space-y-2 text-left">
                <div className="flex items-center gap-2 flex-wrap pr-8">
                  <span className="font-mono text-xs font-semibold text-muted-foreground">{g.codigo}</span>
                  <span className="text-[11px] rounded-full bg-violet-500/10 text-violet-700 dark:text-violet-300 px-2 py-0.5 font-medium">Grupo</span>
                  {g.encerrado_em && <span className="text-[11px] rounded-full bg-muted px-2 py-0.5 font-medium">Encerrado</span>}
                </div>
                <SheetTitle className="text-lg leading-tight">{g.titulo}</SheetTitle>
                <SheetDescription className="text-xs">
                  {rotuloAssunto(g.assunto)}{g.canal ? ` · ${rotuloCanal(g.canal)}` : ''}
                  {g.responsavel_nome ? ` · encaminha para ${g.responsavel_nome}` : ''} · criado por {g.criado_por_nome ?? '—'}
                </SheetDescription>
              </SheetHeader>

              <div className="flex-1 overflow-y-auto">
                <div className="px-5 py-3.5 border-b bg-muted/30 flex flex-wrap items-center gap-2">
                  <Button size="sm" className="h-8 text-xs" disabled={!!g.encerrado_em} onClick={() => setAdicionando(true)}>
                    <UserPlus className="h-3.5 w-3.5 mr-1" /> Adicionar profissional
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 text-xs" disabled={!!g.encerrado_em} onClick={() => setMovendo(true)}>
                    <ArrowDownToLine className="h-3.5 w-3.5 mr-1" /> Mover para cá
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 text-xs" disabled={!membros.length}
                          onClick={() => void copiarTexto(textoTicketGrupo(g, abertas.length ? abertas : membros, { etiquetas, setorNome: setor.setor_nome }))}>
                    <Copy className="h-3.5 w-3.5 mr-1" /> Ticket do grupo
                  </Button>
                  <div className="flex-1" />
                  <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setEditando(true)}>
                    <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 text-xs" disabled={!!ocupado} onClick={() => void encerrar(!g.encerrado_em)}>
                    {g.encerrado_em ? <ArchiveRestore className="h-3.5 w-3.5 mr-1" /> : <Archive className="h-3.5 w-3.5 mr-1" />}
                    {g.encerrado_em ? 'Reabrir' : 'Encerrar'}
                  </Button>
                  {setor.pode_gerir && (
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive hover:text-destructive" aria-label="Apagar grupo"
                            disabled={!!ocupado} onClick={() => void apagar()}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>

                <dl className="px-5 py-4 space-y-3 border-b">
                  <div>
                    <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Reclamação em comum</dt>
                    <dd className="text-sm mt-0.5 whitespace-pre-wrap">{g.descricao}</dd>
                  </div>
                  {g.providencia && (
                    <div>
                      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Providência em comum</dt>
                      <dd className="text-sm mt-0.5 whitespace-pre-wrap">{g.providencia}</dd>
                    </div>
                  )}
                </dl>

                <div className="px-5 py-4 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    No grupo ({membros.length}) · {abertas.length} {abertas.length === 1 ? 'aberta' : 'abertas'}
                  </p>
                  {membros.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-6 text-center">Ninguém ainda. Adicione um profissional ou mova uma manifestação.</p>
                  ) : (
                    <ul className="divide-y rounded-lg border">
                      {membros.map(m => (
                        <li key={m.id}>
                          <button type="button" onClick={() => { aoFechar(); abrirManifestacao(m.id); }}
                                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/40">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium truncate">{m.nome_profissional}</p>
                              <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1.5 flex-wrap">
                                <span className="font-mono">{m.codigo}</span>
                                <span>{dataBr(m.data_manifestacao)}</span>
                                {m.codigo_cliente && <span>Cód. {m.codigo_cliente}</span>}
                                <AnosColoridos m={m} etiquetas={etiquetas} />
                              </p>
                              {m.observacoes && <p className="text-[11px] text-muted-foreground truncate">Obs.: {m.observacoes}</p>}
                            </div>
                            {m.acompanhar ? <SeloStatus status={m.status} /> : <span className="text-[10px] text-muted-foreground">Histórico</span>}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {g && editando && <FormGrupo grupo={g} aoFechar={() => setEditando(false)} aoSalvar={() => setEditando(false)} />}
      {g && movendo && <MoverParaGrupo grupo={g} aoFechar={() => setMovendo(false)} />}
      {g && adicionando && (
        <FormManifestacao aberto manifestacao={null} grupo={g}
                          aoFechar={() => setAdicionando(false)}
                          aoSalvar={() => { setAdicionando(false); recarregar(); }} />
      )}
    </>
  );
}
