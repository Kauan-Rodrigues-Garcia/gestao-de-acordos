/**
 * O cartão de uma equipe no quadro.
 *
 * De cima para baixo: o nome e quantas pessoas; quem lidera (a linha
 * dourada); os subgrupos, cada um com a própria zona de soltar; quem conta
 * direto na equipe; e os clones, tracejados. As ações que antes eram cinco
 * ícones de 14px no cabeçalho moram num menu «⋯», e cada uma abre um painel
 * dentro do próprio cartão — o que se está fazendo fica ao lado de onde vai
 * acontecer.
 *
 * O cartão não fala com o banco: recebe a lista pronta e devolve intenções.
 */
import { useState, type ReactNode } from 'react';
import {
  ArrowDownToLine, Check, Copy, Crown, GraduationCap, Layers, MoreHorizontal, Pencil, Plus, Trash2, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { cn } from '@/lib/utils';
import {
  casaBusca, plural, repartirPorSubgrupo,
  type Destino, type EquipeEq, type OpcaoDeDestino, type PessoaEq, type SubgrupoEq,
} from './modelo';
import { PessoaLinha } from './partes';
import { useZonaDeSoltar } from './arraste';

export interface LiderNoCartao { vinculoId: string; nome: string; naoResolvido: boolean; outroSetor: string | null }
export interface CloneNoCartao {
  cloneId: string; pessoaId: string; nome: string; naoResolvido: boolean;
  /** «clone de Play 2 · Equipe X» */
  origem: string; dica: string; conta: boolean;
}
export interface Candidato { id: string; nome: string; detalhe: string }

export interface CartaoEquipeProps {
  equipe: EquipeEq;
  membros: PessoaEq[];
  grupos: SubgrupoEq[];
  lideres: LiderNoCartao[] | null;
  clones: CloneNoCartao[] | null;
  ehTransferida: (id: string) => boolean;
  emprestada: (p: PessoaEq) => string[];
  busca: string;

  /** Editar nome, treino, excluir (chave `equipes_criar_editar` + setor). */
  podeGerenciar: boolean;
  podeExcluir: boolean;
  /** Líderes, clones e subgrupos (chave `equipes_gerenciar_composicao`). */
  podeComposicao: boolean;
  podeMover: boolean;

  selecionados: ReadonlySet<string>;
  opcoes: OpcaoDeDestino[];
  onAlternar: (id: string) => void;
  onArrastar: (id: string) => void;
  onSoltar: (d: Destino) => void;
  onMover: (id: string, d: Destino) => void;
  onLevarSelecionados: (d: Destino) => void;
  onTirar: (p: PessoaEq) => void;

  onRenomear: (nome: string) => Promise<boolean>;
  onAlternarTreino: () => void;
  onExcluir: () => void;
  onCriarSubgrupo: ((nome: string) => Promise<boolean>) | null;
  onRenomearSubgrupo: (sg: SubgrupoEq, nome: string) => Promise<boolean>;
  onExcluirSubgrupo: (sg: SubgrupoEq) => void;

  lideresDisponiveis: () => Candidato[];
  onAdicionarLider: (id: string) => void;
  onRemoverLider: (vinculoId: string) => void;

  clonagem: null | {
    setores: { id: string; nome: string }[];
    candidatos: (setorId: string) => Candidato[];
    aviso: (setorId: string) => string;
    onClonar: (id: string) => void;
  };
  onRemoverClone: (c: CloneNoCartao) => void;
  onContaRecebimento: (cloneId: string, conta: boolean) => void;
}

type Painel = 'nome' | 'subgrupo' | 'lider' | 'clone' | null;

export function CartaoEquipe(p: CartaoEquipeProps) {
  const { equipe, membros, grupos } = p;
  const [painel, setPainel] = useState<Painel>(null);
  const [rascunho, setRascunho] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [setorClone, setSetorClone] = useState('');
  const [editandoSg, setEditandoSg] = useState<string | null>(null);
  const [nomeSg, setNomeSg] = useState('');

  const zona = useZonaDeSoltar({ equipeId: equipe.id, subgrupoId: null }, p.onSoltar, p.podeMover);
  const { porGrupo, soltos } = repartirPorSubgrupo(membros, grupos);
  const reais = membros.filter(m => !p.ehTransferida(m.id));
  const nSel = p.selecionados.size;
  const modoMover = p.podeMover && nSel > 0;
  const buscando = !!p.busca.trim();
  const algumCasa = buscando && (membros.some(m => casaBusca(m.nome, p.busca)) || (p.clones ?? []).some(c => casaBusca(c.nome, p.busca)));

  function abrir(qual: Painel, inicial = '') { setPainel(atual => (atual === qual ? null : qual)); setRascunho(inicial); }

  async function salvarTexto(acao: (nome: string) => Promise<boolean>) {
    const nome = rascunho.trim();
    if (!nome) return;
    setSalvando(true);
    const ok = await acao(nome);
    setSalvando(false);
    if (ok) { setPainel(null); setRascunho(''); }
  }

  const linha = (m: PessoaEq) => {
    const transf = p.ehTransferida(m.id);
    return (
      <PessoaLinha
        key={m.id}
        pessoa={m}
        selecionada={p.selecionados.has(m.id)}
        podeMover={p.podeMover}
        transferida={transf}
        emprestada={transf ? [] : p.emprestada(m)}
        casa={buscando ? casaBusca(m.nome, p.busca) : null}
        opcoes={p.opcoes}
        onAlternar={p.onAlternar}
        onArrastar={p.onArrastar}
        onMover={p.onMover}
        onTirar={p.podeGerenciar ? p.onTirar : undefined}
      />
    );
  };

  const temMenu = p.podeGerenciar || p.podeComposicao;

  return (
    <article
      className={cn('eq-cartao', zona.sobre && 'eq-solta', buscando && !algumCasa && 'eq-apagado')}
      aria-label={`Equipe ${equipe.nome}`}
      {...zona.props}
    >
      <header className="eq-cab">
        <div className="eq-cab-nome">
          {painel === 'nome' ? (
            <form className="flex items-center gap-1 flex-1" onSubmit={e => { e.preventDefault(); void salvarTexto(p.onRenomear); }}>
              <Input autoFocus value={rascunho} disabled={salvando} className="h-8 text-sm"
                onChange={e => setRascunho(e.target.value)} aria-label="Nome da equipe"
                onKeyDown={e => { if (e.key === 'Escape') setPainel(null); }} />
              <button type="submit" className="eq-icone" aria-label="Salvar nome" disabled={salvando}><Check /></button>
              <button type="button" className="eq-icone" aria-label="Cancelar" onClick={() => setPainel(null)}><X /></button>
            </form>
          ) : (
            <>
              <h3 title={equipe.nome}>{equipe.nome}</h3>
              <span className="eq-qtd" title={`${plural(reais.length, 'pessoa', 'pessoas')}${p.clones?.length ? ` e ${plural(p.clones.length, 'clone', 'clones')}` : ''}`}
                aria-label={plural(reais.length, 'pessoa', 'pessoas')}>{reais.length}</span>
              {equipe.treinamento && <span className="eq-selo treino"><GraduationCap /> Treino</span>}
            </>
          )}
        </div>
        {temMenu && painel !== 'nome' && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="eq-icone" aria-label={`Ações da equipe ${equipe.nome}`}><MoreHorizontal /></button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {p.podeGerenciar && (
                <DropdownMenuItem onSelect={() => abrir('nome', equipe.nome)}><Pencil className="w-4 h-4 mr-2" /> Renomear</DropdownMenuItem>
              )}
              {p.lideres && p.podeGerenciar && (
                <DropdownMenuItem onSelect={() => abrir('lider')}><Crown className="w-4 h-4 mr-2" /> Adicionar líder</DropdownMenuItem>
              )}
              {p.onCriarSubgrupo && p.podeComposicao && (
                <DropdownMenuItem onSelect={() => abrir('subgrupo')}><Layers className="w-4 h-4 mr-2" /> Novo subgrupo</DropdownMenuItem>
              )}
              {p.clonagem && p.podeComposicao && (
                <DropdownMenuItem onSelect={() => { abrir('clone'); setSetorClone(''); }}><Copy className="w-4 h-4 mr-2" /> Clonar operador para cá</DropdownMenuItem>
              )}
              {p.podeGerenciar && (
                <DropdownMenuItem onSelect={p.onAlternarTreino}>
                  <GraduationCap className="w-4 h-4 mr-2" /> {equipe.treinamento ? 'Deixar de ser treino' : 'Marcar como treino'}
                </DropdownMenuItem>
              )}
              {p.podeGerenciar && p.podeExcluir && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={p.onExcluir} className="text-destructive focus:text-destructive">
                    <Trash2 className="w-4 h-4 mr-2" /> Excluir equipe
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </header>

      {/* Quem lidera. Sem ninguém, o convite fica no lugar do nome. */}
      {p.lideres && (p.lideres.length > 0 || p.podeGerenciar) && (
        <div className="eq-lideres" aria-label="Liderança da equipe">
          <div className="eq-lideres-cab">
            <span className="eq-lideres-rot"><Crown aria-hidden="true" /> {p.lideres.length > 1 ? 'Líderes' : 'Líder'}</span>
            {p.podeGerenciar && (
              <button type="button" className="eq-mais" onClick={() => abrir('lider')}>
                <Plus /> {p.lideres.length ? 'adicionar' : 'definir líder'}
              </button>
            )}
          </div>
          {p.lideres.length > 0 ? (
            <ul className="eq-lideres-lista">
              {p.lideres.map(l => (
                <li key={l.vinculoId} className={cn('eq-lider', l.naoResolvido && 'eq-sem-nome')}
                  title={l.naoResolvido ? 'Líder de outro setor: o seu acesso não mostra o nome dele.' : undefined}>
                  <span>{l.nome}</span>
                  {l.outroSetor && <em>clone de {l.outroSetor}</em>}
                  {p.podeGerenciar && (
                    <button type="button" aria-label={`Tirar ${l.nome} da liderança`} title="Tirar da liderança"
                      onClick={() => p.onRemoverLider(l.vinculoId)}><X className="w-3 h-3" /></button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <span className="eq-lider-nenhum">Sem líder definido</span>
          )}
        </div>
      )}

      {painel === 'lider' && (
        <Painel titulo="Quem lidera esta equipe?" onFechar={() => setPainel(null)}>
          <ListaDePessoas candidatos={p.lideresDisponiveis()} vazio="Nenhum líder disponível."
            onEscolher={id => { p.onAdicionarLider(id); setPainel(null); }} />
        </Painel>
      )}

      {painel === 'subgrupo' && p.onCriarSubgrupo && (
        <Painel titulo="Novo subgrupo" onFechar={() => setPainel(null)}>
          <form className="flex gap-1.5" onSubmit={e => { e.preventDefault(); void salvarTexto(p.onCriarSubgrupo!); }}>
            <Input autoFocus value={rascunho} onChange={e => setRascunho(e.target.value)} placeholder="Ex.: Manhã"
              disabled={salvando} className="h-8 text-sm" aria-label="Nome do subgrupo"
              onKeyDown={e => { if (e.key === 'Escape') setPainel(null); }} />
            <Button type="submit" size="sm" className="h-8" disabled={salvando || !rascunho.trim()}>Criar</Button>
          </form>
          <p>Divide a leitura (Destaques do Dia, ranking). O recebimento continua sendo da equipe.</p>
        </Painel>
      )}

      {painel === 'clone' && p.clonagem && (() => {
        const setor = setorClone || equipe.setor_id;
        return (
          <Painel titulo="Clonar operador para cá" onFechar={() => setPainel(null)}>
            <Select value={setor} onValueChange={setSetorClone}>
              <SelectTrigger className="h-8 text-xs bg-background" aria-label="Setor de onde vem"><SelectValue placeholder="Setor…" /></SelectTrigger>
              <SelectContent>
                {p.clonagem.setores.map(s => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.nome}{s.id === equipe.setor_id ? ' (este setor)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <ListaDePessoas candidatos={p.clonagem.candidatos(setor)} vazio="Ninguém com equipe neste setor."
              onEscolher={id => { p.clonagem!.onClonar(id); setPainel(null); }} />
            <p>{p.clonagem.aviso(setor)}</p>
          </Painel>
        );
      })()}

      <div className="eq-corpo">
        {modoMover && (
          <button type="button" className="eq-alvo-btn" onClick={() => p.onLevarSelecionados({ equipeId: equipe.id, subgrupoId: null })}>
            <ArrowDownToLine /> Mover {nSel === 1 ? 'a selecionada' : `as ${nSel}`} para cá
          </button>
        )}

        {grupos.map(sg => (
          <Subgrupo key={sg.id} sg={sg} equipeId={equipe.id} qtd={porGrupo.get(sg.id)?.length ?? 0}
            podeMover={p.podeMover} podeEditar={p.podeComposicao} modoMover={modoMover}
            editando={editandoSg === sg.id} nome={nomeSg}
            onEditar={() => { setEditandoSg(sg.id); setNomeSg(sg.nome); }}
            onNome={setNomeSg}
            onSalvar={async () => { if (await p.onRenomearSubgrupo(sg, nomeSg)) setEditandoSg(null); }}
            onCancelar={() => setEditandoSg(null)}
            onExcluir={() => p.onExcluirSubgrupo(sg)}
            onSoltar={p.onSoltar} onLevar={p.onLevarSelecionados}>
            {(porGrupo.get(sg.id) ?? []).map(linha)}
          </Subgrupo>
        ))}

        {grupos.length > 0 && soltos.length > 0 && <div className="eq-solto-rot">Direto na equipe · {soltos.length}</div>}
        {soltos.map(linha)}

        {(p.clones ?? []).map(c => (
          <div key={c.cloneId} className="eq-pessoa eq-clone" title={c.dica}
            data-casa={buscando && casaBusca(c.nome, p.busca) || undefined}
            data-longe={buscando && !casaBusca(c.nome, p.busca) || undefined}>
            <span className="eq-av" aria-hidden="true"><Copy className="w-3 h-3" /></span>
            <div className="eq-clone-txt">
              <b className={cn(c.naoResolvido && 'italic text-muted-foreground')}>{c.nome}</b>
              <small>{c.origem}</small>
            </div>
            <label className="eq-receb" title="Contar o recebimento deste clone nesta equipe (desligado: não conta aqui nem no setor dela; a origem continua contando)">
              <Switch checked={c.conta} disabled={!p.podeGerenciar} className="scale-75 origin-right"
                onCheckedChange={v => p.onContaRecebimento(c.cloneId, v)} aria-label={`Recebimento de ${c.nome} conta nesta equipe`} />
              receb.
            </label>
            {p.podeGerenciar && (
              <div className="eq-acoes">
                <button type="button" className="eq-icone perigo" aria-label={`Remover o clone de ${c.nome}`} title="Remover clone (não mexe na equipe de origem)"
                  onClick={() => p.onRemoverClone(c)}><X /></button>
              </div>
            )}
          </div>
        ))}

        {membros.length === 0 && !p.clones?.length && (
          <div className="eq-vazio">{p.podeMover ? 'Equipe vazia. Arraste alguém para cá ou selecione e use «Mover para cá».' : 'Equipe vazia.'}</div>
        )}
      </div>
    </article>
  );
}

// ── Peças internas ───────────────────────────────────────────────────────────

function Painel({ titulo, onFechar, children }: { titulo: string; onFechar: () => void; children: ReactNode }) {
  return (
    <div className="eq-painel">
      <div className="eq-painel-cab">
        {titulo}
        <button type="button" className="eq-icone" aria-label="Fechar" onClick={onFechar}><X /></button>
      </div>
      {children}
    </div>
  );
}

function ListaDePessoas({ candidatos, vazio, onEscolher }: { candidatos: Candidato[]; vazio: string; onEscolher: (id: string) => void }) {
  return (
    <Command className="rounded-lg border bg-background">
      <CommandInput placeholder="Buscar pelo nome…" className="h-8 text-xs" />
      <CommandList>
        <CommandEmpty className="py-4 text-center text-xs text-muted-foreground">{candidatos.length ? 'Ninguém com esse nome.' : vazio}</CommandEmpty>
        <CommandGroup>
          {candidatos.map(c => (
            <CommandItem key={c.id} value={`${c.nome} ${c.id}`} onSelect={() => onEscolher(c.id)} className="text-xs">
              <span className="truncate">{c.nome}</span>
              <span className="ml-auto pl-2 text-muted-foreground truncate">{c.detalhe}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}

function Subgrupo({
  sg, equipeId, qtd, podeMover, podeEditar, modoMover, editando, nome,
  onEditar, onNome, onSalvar, onCancelar, onExcluir, onSoltar, onLevar, children,
}: {
  sg: SubgrupoEq; equipeId: string; qtd: number; podeMover: boolean; podeEditar: boolean; modoMover: boolean;
  editando: boolean; nome: string;
  onEditar: () => void; onNome: (v: string) => void; onSalvar: () => void; onCancelar: () => void; onExcluir: () => void;
  onSoltar: (d: Destino) => void; onLevar: (d: Destino) => void; children: ReactNode;
}) {
  const destino = { equipeId, subgrupoId: sg.id };
  const zona = useZonaDeSoltar(destino, onSoltar, podeMover);
  return (
    <section className={cn('eq-sub', zona.sobre && 'eq-solta')} aria-label={`Subgrupo ${sg.nome}`} {...zona.props}>
      <div className="eq-sub-cab">
        {editando ? (
          <form className="flex items-center gap-1 flex-1" onSubmit={e => { e.preventDefault(); onSalvar(); }}>
            <Input autoFocus value={nome} onChange={e => onNome(e.target.value)} className="h-7 text-xs" aria-label="Nome do subgrupo"
              onKeyDown={e => { if (e.key === 'Escape') onCancelar(); }} />
            <button type="submit" className="eq-icone" aria-label="Salvar nome"><Check /></button>
          </form>
        ) : (
          <>
            <span>{sg.nome} · {qtd}</span>
            {modoMover && (
              <button type="button" className="eq-alvo-btn mini" onClick={() => onLevar(destino)}>para cá</button>
            )}
            {podeEditar && (
              <>
                <button type="button" className="eq-icone" aria-label={`Renomear o subgrupo ${sg.nome}`} onClick={onEditar}><Pencil /></button>
                <button type="button" className="eq-icone" aria-label={`Excluir o subgrupo ${sg.nome} (as pessoas seguem na equipe)`}
                  title="Excluir subgrupo (as pessoas seguem na equipe)" onClick={onExcluir}><Trash2 /></button>
              </>
            )}
          </>
        )}
      </div>
      {qtd === 0 ? <div className="eq-sub-vazio">{podeMover ? 'Ninguém ainda. Solte alguém aqui.' : 'Ninguém ainda.'}</div> : children}
    </section>
  );
}
