/**
 * MontarVotacaoGerentes — Configurações › Votação da Liderança › aba
 * «Gerentes» (12/11/2026): a OPERAÇÃO vota nos GERENTES.
 *
 * Mesma mecânica da votação da liderança (categorias juntas, voto secreto,
 * apuração da diretoria, revelação), com quem vota separado de quem concorre:
 *
 *   1. a operação (BookPlay e PaguePlay OU Vendas);
 *   2. os gerentes que concorrem — todos da operação vêm marcados; toque tira,
 *      e dá para incluir à mão;
 *   3. quem vota — cargos (padrão Operador), SETORES e, dentro de cada setor,
 *      as EQUIPES; depois, pessoa por pessoa (tirar e incluir à mão);
 *      CADA SETOR VOTA NO SEU GERENTE: a ligação setor → gerentes vem do
 *      cadastro e muda à mão (um gerente pode valer para mais setores);
 *   4. as OPÇÕES (mínimo 3): o operador vê o gerente dele e marca a que mais
 *      se encaixa («Mais resolve problemas», «Mais inspirador»…), 12/11/2026;
 *      com 2 gerentes no setor, uma para cada (opções diferentes). O
 *      resultado é o perfil de cada gerente (`PerfilDosGerentes`);
 *   6. ver como fica (demonstração) e «Liberar para a operação».
 *
 * O rascunho fica neste navegador; só vai para o banco ao liberar
 * (`liberarVotacao`, migration 20261112160000).
 */
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ChevronDown, Loader2, Play, Plus, RotateCcw, Search, Send, Trash2, UserPlus, X } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { PERFIL_LABELS } from '@/lib/index';
import { ehProduto, type Produto } from '@/lib/produto';
import { faltaMigration, liberarVotacao, mensagemDoErro } from './banco';
import {
  MIN_GERENTES, MIN_PERGUNTAS_GERENTES, PERGUNTAS_PADRAO_GERENTES, cedulaComTodos, nomeCurto,
  type Candidato,
} from './cedula';
import { CARGOS_QUE_VOTAM, gerentesPorOperacao, montarGerentes, rascunhoGerentesPadrao, semEquipe, type RascunhoGerentes } from './gerentes';
import { NOME_DO_PRODUTO, type EquipeDaVotacao, type GrupoDaVotacao, type Participante } from './participantes';
import { FotoLider } from './FotoLider';
import { TelaVotacao } from './TelaVotacao';

const CHAVE = 'votacao-gerentes:rascunho:v1';
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const listaDeTexto = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => typeof x === 'string');

function lerRascunho(): RascunhoGerentes {
  const base = rascunhoGerentesPadrao();
  try {
    const bruto = localStorage.getItem(CHAVE);
    if (!bruto) return base;
    const r = JSON.parse(bruto) as Partial<RascunhoGerentes>;
    const lista = (k: keyof RascunhoGerentes) => (listaDeTexto(r[k]) ? (r[k] as string[]) : (base[k] as string[]));
    return {
      titulo: typeof r.titulo === 'string' ? r.titulo : base.titulo,
      produto: ehProduto(r.produto) ? r.produto : base.produto,
      gerentesFora: lista('gerentesFora'), gerentesVoltaram: lista('gerentesVoltaram'), gerentesIncluidos: lista('gerentesIncluidos'),
      cargosEleitores: listaDeTexto(r.cargosEleitores) && r.cargosEleitores.length ? r.cargosEleitores : base.cargosEleitores,
      setores: lista('setores'), equipesFora: lista('equipesFora'),
      eleitoresFora: lista('eleitoresFora'), eleitoresVoltaram: lista('eleitoresVoltaram'), eleitoresIncluidos: lista('eleitoresIncluidos'),
      // Rascunho de uma lista-base antiga (as 24 da liderança, 12/11): entram as 11 de gerente.
      perguntas: r.versaoPerguntas === base.versaoPerguntas && Array.isArray(r.perguntas) && r.perguntas.length ? r.perguntas : base.perguntas,
      versaoPerguntas: base.versaoPerguntas,
      umPorCandidato: typeof r.umPorCandidato === 'boolean' ? r.umPorCandidato : base.umPorCandidato,
      umTitulo: typeof r.umTitulo === 'boolean' ? r.umTitulo : base.umTitulo,
      ligacoes: r.ligacoes && typeof r.ligacoes === 'object' && !Array.isArray(r.ligacoes)
        ? Object.fromEntries(Object.entries(r.ligacoes).filter((e): e is [string, string[]] => listaDeTexto(e[1])))
        : base.ligacoes,
    };
  } catch { return base; }
}

interface Props {
  dados: { pessoas: Participante[]; grupos: GrupoDaVotacao[]; equipes: EquipeDaVotacao[] };
  /** Depois de liberar: o painel das votações lê de novo. */
  onLiberada: () => void;
}

const titulo3 = 'text-sm font-semibold';
const chip = (ativo: boolean) => cn('rounded-full border px-2.5 py-0.5 text-xs transition-colors', ativo ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:border-primary/60');
const dica = (p: Participante) => `${p.nome} — ${PERFIL_LABELS[p.perfil] ?? p.perfil} · ${p.setor}${p.empresa ? ` · ${p.empresa}` : ''}`;

/** Busca por nome entre todas as pessoas, fora de uma lista. */
function BuscaDePessoa({ pessoas, fora, produto, rotulo, onIncluir }: {
  pessoas: readonly Participante[]; fora: ReadonlySet<string>; produto: Produto; rotulo: string; onIncluir: (id: string) => void;
}) {
  const [busca, setBusca] = useState('');
  const achados = useMemo(() => {
    const termo = semAcento(busca.trim());
    if (termo.length < 2) return [];
    return pessoas.filter(p => !fora.has(p.id) && semAcento(p.nome).includes(termo)).slice(0, 8);
  }, [busca, pessoas, fora]);
  return (
    <div className="space-y-1.5">
      <div className="relative max-w-md">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar pelo nome (2 letras ou mais)" className="h-9 pl-8 text-sm" aria-label={rotulo} />
      </div>
      {busca.trim().length >= 2 && (
        <ul className="max-w-md divide-y overflow-hidden rounded-lg border">
          {achados.length === 0 && <li className="px-3 py-2.5 text-xs text-muted-foreground">Ninguém com esse nome fora da lista.</li>}
          {achados.map(p => (
            <li key={p.id}>
              <button type="button" onClick={() => { onIncluir(p.id); setBusca(''); }} className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-muted/50">
                <FotoLider lider={p} className="h-7 w-7 text-[10px]" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{p.nome}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {PERFIL_LABELS[p.perfil] ?? p.perfil} · {p.setor}{p.empresa ? ` · ${p.empresa}` : ''}
                    {p.produto && p.produto !== produto ? ` · ${NOME_DO_PRODUTO[p.produto]}` : ''}
                  </span>
                </span>
                <UserPlus className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Pessoa como pílula: toca para tirar/colocar. */
function Pilula({ p, fora, onClick, extra }: { p: Participante; fora: boolean; onClick: () => void; extra?: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={!fora} title={`${dica(p)}${fora ? ' (fora: toque para colocar de volta)' : ''}`}
      className={cn('flex items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2.5 text-xs transition-colors',
        fora ? 'border-dashed text-muted-foreground line-through opacity-60' : 'bg-card hover:border-primary/60')}>
      <FotoLider lider={p} className="h-5 w-5 text-[8px]" /> {nomeCurto(p.nome)}
      {extra && <span className="text-[10px] text-muted-foreground no-underline">· {extra}</span>}
    </button>
  );
}

export function MontarVotacaoGerentes({ dados, onLiberada }: Props) {
  const [r, setR] = useState<RascunhoGerentes>(lerRascunho);
  useEffect(() => { try { localStorage.setItem(CHAVE, JSON.stringify(r)); } catch { /* sem armazenamento: só na tela */ } }, [r]);
  const mudar = (parcial: Partial<RascunhoGerentes>) => setR(atual => ({ ...atual, ...parcial }));
  const ehContaE = (id: string) => m.contasEleitores.some(c => c.p.id === id);
  const alternar = (k: 'gerentesFora' | 'gerentesVoltaram' | 'equipesFora' | 'eleitoresFora' | 'eleitoresVoltaram' | 'cargosEleitores', id: string) =>
    mudar({ [k]: r[k].includes(id) ? r[k].filter(x => x !== id) : [...r[k], id] });

  const m = useMemo(() => montarGerentes(dados, r), [dados, r]);
  const [verEleitores, setVerEleitores] = useState(false);
  const [buscaEleitor, setBuscaEleitor] = useState('');
  const [demo, setDemo] = useState<number | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [liberando, setLiberando] = useState(false);

  /** As operações com gerente (cobrança primeiro). */
  const produtos = useMemo(() => {
    const n = gerentesPorOperacao(dados.pessoas);
    if (!n.has(r.produto)) n.set(r.produto, 0);
    return [...n.entries()].sort((a, b) => Number(b[0] === 'cobranca') - Number(a[0] === 'cobranca'));
  }, [dados.pessoas, r.produto]);
  const nomeDoSetor = useMemo(() => new Map(dados.grupos.flatMap(g => g.setores.map(s => [s.id, s.nome] as const))), [dados.grupos]);

  const perguntas = useMemo(() => r.perguntas.filter(p => p.texto.trim()), [r.perguntas]);
  const pessoasDaCedula = useMemo(() => new Map<string, Candidato>(m.candidatos.map(p => [
    p.id, p.setorId ? p : { ...p, setor: PERFIL_LABELS[p.perfil] ?? 'Sem setor' },
  ])), [m.candidatos]);
  // A demonstração vota como alguém de um setor com 2+ gerentes (se houver): é o caso de escolher.
  const eleitorDemo = useMemo(() => m.eleitores.find(e => (m.cedulaPorEleitor.get(e.id)?.length ?? 0) > 1) ?? m.eleitores[0],
    [m.eleitores, m.cedulaPorEleitor]);
  const cedula = useMemo(() => {
    const ids = eleitorDemo ? new Set(m.cedulaPorEleitor.get(eleitorDemo.id) ?? []) : null;
    return cedulaComTodos(perguntas, ids ? m.candidatos.filter(g => ids.has(g.id)) : m.candidatos);
  }, [perguntas, m.candidatos, m.cedulaPorEleitor, eleitorDemo]);
  /** Quantos gerentes tem a maior cédula: precisa de pelo menos uma opção para cada. */
  const maiorCedula = useMemo(() => Math.max(0, ...[...m.cedulaPorEleitor.values()].map(c => c.length)), [m.cedulaPorEleitor]);
  /** Os setores de quem vota (marcados + de quem entrou à mão), para ligar os gerentes. */
  const setoresQueVotam = useMemo(() => [...new Set(m.eleitores.map(e => e.setorId).filter((s): s is string => !!s))]
    .sort((a, b) => (nomeDoSetor.get(a) ?? '').localeCompare(nomeDoSetor.get(b) ?? '', 'pt-BR', { numeric: true })), [m.eleitores, nomeDoSetor]);
  const ligar = (setorId: string, ids: string[]) => mudar({ ligacoes: { ...r.ligacoes, [setorId]: ids } });
  const voltarAoCadastro = (setorId: string) => { const { [setorId]: _fora, ...resto } = r.ligacoes; mudar({ ligacoes: resto }); };

  const idsCandidatos = useMemo(() => new Set(m.candidatos.map(p => p.id)), [m.candidatos]);
  const idsEleitores = useMemo(() => new Set(m.eleitores.map(p => p.id)), [m.eleitores]);

  const problemas: string[] = [];
  if (m.candidatos.length < MIN_GERENTES) problemas.push(`Precisa de pelo menos ${MIN_GERENTES} gerentes concorrendo.`);
  if (m.eleitores.length < 1) problemas.push('Escolha quem vota: marque setores (e equipes) ou inclua pessoas à mão.');
  if (perguntas.length < MIN_PERGUNTAS_GERENTES) problemas.push(`São ${perguntas.length} opções; o mínimo é ${MIN_PERGUNTAS_GERENTES}.`);
  if (new Set(perguntas.map(p => p.id)).size !== perguntas.length) problemas.push('Há opções repetidas.');
  if (maiorCedula > perguntas.length) problemas.push(`Há setor com ${maiorCedula} gerentes e só ${perguntas.length} opções: cada gerente precisa de uma opção diferente.`);
  if (m.semGerente.length) problemas.push(`${m.semGerente.length} ${m.semGerente.length === 1 ? 'pessoa vota' : 'pessoas votam'} sem gerente na cédula: ligue um gerente ao setor delas (bloco «Cada setor vota no seu gerente») ou tire-as.`);
  const tituloLimpo = r.titulo.trim();
  const paraLiberar = [...problemas, ...(tituloLimpo ? [] : ['Dê um título para a votação.'])];

  const liberar = async () => {
    setLiberando(true);
    try {
      await liberarVotacao({
        tipo: 'gerentes', titulo: tituloLimpo.slice(0, 120), produto: r.produto,
        setorIds: [...m.marcados], equipeIds: [...m.equipesPorSetor.values()].flat().map(e => e.chave)
          .filter(c => !c.startsWith('sem:') && !r.equipesFora.includes(c)),
        cargos: ['gerencia'], cargosEleitores: r.cargosEleitores,
        perguntas, participantes: m.candidatos.map(p => p.id), eleitores: m.eleitores.map(p => p.id),
        // A cédula do gerente: uma opção por gerente, cada opção para um só.
        umPorCandidato: true, umTitulo: false,
        cedulaPorEleitor: Object.fromEntries(m.cedulaPorEleitor),
      });
      toast.success('Votação dos gerentes liberada', { description: `${m.eleitores.length} pessoas já podem votar pelo card no canto da tela.` });
      setConfirmando(false);
      onLiberada();
    } catch (e) {
      toast.error('Não deu para liberar', {
        description: faltaMigration(e) ? 'O banco ainda não tem a votação dos gerentes (migration 20261112160000).' : mensagemDoErro(e),
      });
    } finally {
      setLiberando(false);
    }
  };

  // A lista de quem vota, por setor · equipe, com busca.
  const eleitoresPorBloco = useMemo(() => {
    const termo = semAcento(buscaEleitor.trim());
    const blocos = new Map<string, Participante[]>();
    for (const p of m.doFiltro) {
      if (termo && !semAcento(p.nome).includes(termo)) continue;
      const k = `${p.setor} · ${m.equipeDe(p)}`;
      blocos.set(k, [...(blocos.get(k) ?? []), p]);
    }
    return [...blocos.entries()].sort(([a], [b]) => a.localeCompare(b, 'pt-BR', { numeric: true }));
  }, [m, buscaEleitor]);
  const incluidosE = r.eleitoresIncluidos.map(id => dados.pessoas.find(p => p.id === id)).filter((p): p is Participante => !!p);
  const incluidosG = r.gerentesIncluidos.map(id => dados.pessoas.find(p => p.id === id)).filter((p): p is Participante => !!p);
  const nomesCargos = r.cargosEleitores.map(c => (PERFIL_LABELS[c] ?? c).toLowerCase()).join(' / ') || 'ninguém';

  return (
    <div className="space-y-6">
      {/* 1. Operação */}
      <section className="space-y-2.5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className={titulo3}>1. Operação</h3>
          <div role="radiogroup" aria-label="Operação" className="flex overflow-hidden rounded-md border text-xs">
            {produtos.map(([prod, n]) => (
              <button key={prod} type="button" role="radio" aria-checked={r.produto === prod}
                onClick={() => { if (r.produto !== prod) mudar({ produto: prod, setores: [], equipesFora: [], gerentesFora: [], eleitoresFora: [] }); }}
                className={cn('px-3 py-1', r.produto === prod ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}>
                {NOME_DO_PRODUTO[prod]} <span className="opacity-70">{n}</span>
              </button>
            ))}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">O número é quantos gerentes a operação tem. {NOME_DO_PRODUTO.comercial} não se mistura com {NOME_DO_PRODUTO.cobranca}.</p>
      </section>

      {/* 2. Gerentes */}
      <section className="space-y-2.5">
        <h3 className={titulo3}>2. Gerentes que concorrem <span className="font-normal text-muted-foreground">· {m.candidatos.length} na votação</span></h3>
        <p className="text-xs text-muted-foreground">Todos os gerentes da operação vêm marcados. Toque para tirar (férias, saiu) ou colocar de volta.</p>
        <div className="flex flex-wrap gap-1.5 rounded-lg border p-2.5">
          {m.gerentesDaOperacao.length === 0 && <p className="w-full py-2 text-center text-xs text-muted-foreground">Nenhum gerente nesta operação. Inclua à mão abaixo.</p>}
          {m.gerentesDaOperacao.filter(p => !m.contasGerentes.some(c => c.p.id === p.id)).map(p => (
            <Pilula key={p.id} p={p} fora={r.gerentesFora.includes(p.id)} onClick={() => alternar('gerentesFora', p.id)} extra={p.setorId ? p.setor : undefined} />
          ))}
        </div>
        {m.contasGerentes.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-dashed p-2.5 text-xs">
            <span className="text-muted-foreground">Contas que não parecem pessoa (ficam fora):</span>
            {m.contasGerentes.map(({ p, motivo }) => {
              const voltou = r.gerentesVoltaram.includes(p.id);
              return (
                <button key={p.id} type="button" onClick={() => alternar('gerentesVoltaram', p.id)} aria-pressed={voltou} title={`${dica(p)} · ${motivo}`}
                  className={cn('rounded-full border px-2 py-0.5', voltou ? 'border-primary bg-primary/10' : 'text-muted-foreground line-through opacity-70 hover:opacity-100')}>
                  {p.nome}
                </button>
              );
            })}
          </div>
        )}
        <BuscaDePessoa pessoas={dados.pessoas} fora={idsCandidatos} produto={r.produto} rotulo="Buscar pessoa para concorrer"
          onIncluir={id => mudar({ gerentesIncluidos: [...r.gerentesIncluidos.filter(x => x !== id), id], gerentesFora: r.gerentesFora.filter(x => x !== id) })} />
        {incluidosG.length > 0 && (
          <div className="flex flex-wrap gap-1.5" aria-label="Incluídos à mão para concorrer">
            {incluidosG.map(p => (
              <span key={p.id} className="flex items-center gap-1.5 rounded-full border border-primary/50 bg-primary/10 py-0.5 pl-0.5 pr-1 text-xs" title={dica(p)}>
                <FotoLider lider={p} className="h-5 w-5 text-[8px]" /> {nomeCurto(p.nome)}
                <span className="text-[10px] text-muted-foreground">· {PERFIL_LABELS[p.perfil] ?? p.perfil}</span>
                <button type="button" onClick={() => mudar({ gerentesIncluidos: r.gerentesIncluidos.filter(x => x !== p.id) })} aria-label={`Tirar ${p.nome}`}
                  className="rounded-full p-0.5 text-muted-foreground hover:bg-destructive/15 hover:text-destructive"><X className="h-3 w-3" /></button>
              </span>
            ))}
          </div>
        )}
      </section>

      {/* 3. Quem vota */}
      <section className="space-y-2.5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className={titulo3}>3. Quem vota <span className="font-normal text-muted-foreground">· {m.eleitores.length} {m.eleitores.length === 1 ? 'pessoa' : 'pessoas'}</span></h3>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Cargos que votam">
            {CARGOS_QUE_VOTAM.map(c => (
              <button key={c} type="button" className={chip(r.cargosEleitores.includes(c))} aria-pressed={r.cargosEleitores.includes(c)}
                onClick={() => alternar('cargosEleitores', c)}>{PERFIL_LABELS[c] ?? c}</button>
            ))}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Marque os setores; dentro de cada um, as equipes vêm todas marcadas — toque para tirar uma equipe inteira. O número é quantos {nomesCargos} há.
        </p>
        <div className="space-y-2.5 rounded-lg border p-2.5">
          {m.grupos.length === 0 && <p className="py-3 text-center text-xs text-muted-foreground">Nenhum setor desta operação tem alguém com esses cargos.</p>}
          {m.grupos.map(g => {
            const ids = g.setores.map(s => s.id);
            const todos = ids.every(id => m.marcados.has(id));
            return (
              <div key={g.chave}>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{g.rotulo}</p>
                  <button type="button" className="text-[11px] font-medium text-primary hover:underline"
                    onClick={() => { const n = new Set(m.marcados); ids.forEach(id => (todos ? n.delete(id) : n.add(id))); mudar({ setores: [...n] }); }}>
                    {todos ? 'Desmarcar todos' : 'Marcar todos'}
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label={`Setores de ${g.rotulo}`}>
                  {g.setores.map(s => {
                    const ativo = m.marcados.has(s.id);
                    return (
                      <button key={s.id} type="button" className={chip(ativo)} aria-pressed={ativo}
                        onClick={() => mudar({ setores: ativo ? [...m.marcados].filter(x => x !== s.id) : [...m.marcados, s.id] })}>
                        {s.nome} <span className="opacity-70">{m.porSetor.get(s.id) ?? 0}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {m.marcados.size > 0 && (
          <div className="space-y-2 rounded-lg border bg-muted/20 p-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Equipes dos setores marcados</p>
            {[...m.equipesPorSetor.entries()].map(([setorId, equipes]) => {
              const todasDentro = equipes.every(e => !r.equipesFora.includes(e.chave));
              return (
                <div key={setorId} className="flex flex-wrap items-center gap-1.5">
                  <span className="mr-1 min-w-[90px] text-xs font-medium">{nomeDoSetor.get(setorId) ?? 'Setor'}</span>
                  {equipes.map(e => {
                    const dentro = !r.equipesFora.includes(e.chave);
                    return (
                      <button key={e.chave} type="button" className={cn(chip(dentro), e.chave === semEquipe(setorId) && 'italic')} aria-pressed={dentro}
                        onClick={() => alternar('equipesFora', e.chave)}>
                        {e.nome} <span className="opacity-70">{e.total}</span>
                      </button>
                    );
                  })}
                  <button type="button" className="text-[11px] font-medium text-primary hover:underline"
                    onClick={() => {
                      const chaves = equipes.map(e => e.chave);
                      mudar({ equipesFora: todasDentro ? [...new Set([...r.equipesFora, ...chaves])] : r.equipesFora.filter(c => !chaves.includes(c)) });
                    }}>
                    {todasDentro ? 'Tirar todas' : 'Todas'}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {m.contasEleitores.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-dashed p-2.5 text-xs">
            <span className="text-muted-foreground">Contas que não parecem pessoa (não votam):</span>
            {m.contasEleitores.map(({ p, motivo }) => {
              const voltou = r.eleitoresVoltaram.includes(p.id);
              return (
                <button key={p.id} type="button" onClick={() => alternar('eleitoresVoltaram', p.id)} aria-pressed={voltou} title={`${dica(p)} · ${motivo}`}
                  className={cn('rounded-full border px-2 py-0.5', voltou ? 'border-primary bg-primary/10' : 'text-muted-foreground line-through opacity-70 hover:opacity-100')}>
                  {p.nome}
                </button>
              );
            })}
          </div>
        )}

        <div className="rounded-lg border">
          <button type="button" onClick={() => setVerEleitores(v => !v)} aria-expanded={verEleitores}
            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs font-medium hover:bg-muted/40">
            <span>Ver e ajustar quem vota, pessoa por pessoa ({m.doFiltro.length} pelo filtro{r.eleitoresFora.length ? `, ${r.eleitoresFora.filter(id => m.doFiltro.some(p => p.id === id)).length} tirados` : ''})</span>
            <ChevronDown className={cn('h-4 w-4 transition-transform', verEleitores && 'rotate-180')} />
          </button>
          {verEleitores && (
            <div className="space-y-2 border-t p-2.5">
              <div className="relative max-w-xs">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input value={buscaEleitor} onChange={e => setBuscaEleitor(e.target.value)} placeholder="Filtrar pelo nome" className="h-8 pl-8 text-xs" aria-label="Filtrar quem vota" />
              </div>
              <div className="max-h-72 space-y-2 overflow-y-auto">
                {eleitoresPorBloco.length === 0 && <p className="py-2 text-center text-xs text-muted-foreground">Ninguém aqui.</p>}
                {eleitoresPorBloco.map(([bloco, gente]) => (
                  <div key={bloco}>
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{bloco} · {gente.length}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {gente.map(p => {
                        // Conta (pelo nome) entra pelo «voltou»; gente, pelo «fora».
                        const conta = ehContaE(p.id);
                        const fora = conta ? !r.eleitoresVoltaram.includes(p.id) : r.eleitoresFora.includes(p.id);
                        return <Pilula key={p.id} p={p} fora={fora} onClick={() => alternar(conta ? 'eleitoresVoltaram' : 'eleitoresFora', p.id)} />;
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <p className="text-xs font-medium">Incluir quem vota à mão <span className="font-normal text-muted-foreground">· qualquer cargo, setor ou equipe</span></p>
        <BuscaDePessoa pessoas={dados.pessoas} fora={idsEleitores} produto={r.produto} rotulo="Buscar pessoa para votar"
          onIncluir={id => mudar({ eleitoresIncluidos: [...r.eleitoresIncluidos.filter(x => x !== id), id], eleitoresFora: r.eleitoresFora.filter(x => x !== id) })} />
        {incluidosE.length > 0 && (
          <div className="flex flex-wrap gap-1.5" aria-label="Incluídos à mão para votar">
            {incluidosE.map(p => (
              <span key={p.id} className="flex items-center gap-1.5 rounded-full border border-primary/50 bg-primary/10 py-0.5 pl-0.5 pr-1 text-xs" title={dica(p)}>
                <FotoLider lider={p} className="h-5 w-5 text-[8px]" /> {nomeCurto(p.nome)}
                <button type="button" onClick={() => mudar({ eleitoresIncluidos: r.eleitoresIncluidos.filter(x => x !== p.id) })} aria-label={`Tirar ${p.nome}`}
                  className="rounded-full p-0.5 text-muted-foreground hover:bg-destructive/15 hover:text-destructive"><X className="h-3 w-3" /></button>
              </span>
            ))}
          </div>
        )}
      </section>

      {/* 3b. Cada setor vota no seu gerente */}
      <section className="space-y-2.5">
        <h3 className={titulo3}>Cada setor vota no seu gerente</h3>
        <p className="text-xs text-muted-foreground">
          Quem vota só vê os gerentes ligados ao setor dele. A ligação vem do cadastro (o setor do gerente); mude aqui quando um gerente cuida de
          mais de um setor. Com 2 gerentes no setor, a pessoa escolhe em cada categoria qual dos dois combina mais.
        </p>
        <div className="divide-y rounded-lg border">
          {setoresQueVotam.length === 0 && <p className="px-3 py-3 text-center text-xs text-muted-foreground">Marque quem vota acima.</p>}
          {setoresQueVotam.map(setorId => {
            const ligados = m.gerentesDoSetor(setorId);
            const idsLigados = ligados.map(g => g.id);
            const livres = m.candidatos.filter(g => !idsLigados.includes(g.id));
            const quantos = m.eleitores.filter(e => e.setorId === setorId).length;
            return (
              <div key={setorId} className="flex flex-wrap items-center gap-1.5 px-3 py-2">
                <span className="min-w-[120px] text-xs font-medium">
                  {nomeDoSetor.get(setorId) ?? m.eleitores.find(e => e.setorId === setorId)?.setor ?? 'Setor'}
                  <span className="ml-1 font-normal text-muted-foreground">· {quantos} votam</span>
                </span>
                <span className="text-[11px] text-muted-foreground">votam em</span>
                {ligados.length === 0 && <span className="rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-[11px] text-destructive">nenhum gerente</span>}
                {ligados.map(g => (
                  <span key={g.id} className="flex items-center gap-1 rounded-full border border-primary/50 bg-primary/10 py-0.5 pl-0.5 pr-1 text-xs" title={dica(g)}>
                    <FotoLider lider={g} className="h-5 w-5 text-[8px]" /> {nomeCurto(g.nome)}
                    <button type="button" onClick={() => ligar(setorId, idsLigados.filter(id => id !== g.id))} aria-label={`Desligar ${g.nome} de ${nomeDoSetor.get(setorId) ?? 'este setor'}`}
                      className="rounded-full p-0.5 text-muted-foreground hover:bg-destructive/15 hover:text-destructive"><X className="h-3 w-3" /></button>
                  </span>
                ))}
                {livres.length > 0 && (
                  <select value="" aria-label={`Ligar gerente a ${nomeDoSetor.get(setorId) ?? 'este setor'}`}
                    onChange={e => { if (e.target.value) ligar(setorId, [...idsLigados, e.target.value]); }}
                    className="h-7 rounded-md border bg-background px-1.5 text-xs">
                    <option value="">+ ligar gerente</option>
                    {livres.map(g => <option key={g.id} value={g.id}>{g.nome}{g.setorId ? ` · ${g.setor}` : ''}</option>)}
                  </select>
                )}
                {m.ligadoAMao(setorId) && (
                  <button type="button" onClick={() => voltarAoCadastro(setorId)} className="text-[11px] font-medium text-primary hover:underline">
                    voltar ao cadastro
                  </button>
                )}
              </div>
            );
          })}
        </div>
        {m.semGerente.length > 0 && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            Sem gerente na cédula ({m.semGerente.length}): {m.semGerente.slice(0, 12).map(p => `${nomeCurto(p.nome)} (${p.setor})`).join(', ')}
            {m.semGerente.length > 12 ? '…' : ''}. Ligue um gerente ao setor delas ou tire-as de quem vota.
          </p>
        )}
        {m.gerentesSemEleitor.length > 0 && (
          <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
            Ninguém vota em: {m.gerentesSemEleitor.map(g => nomeCurto(g.nome)).join(', ')}. Ligue ao setor que ele cuida, ou tire da votação.
          </p>
        )}
      </section>

      {/* 4. Opções */}
      <section className="space-y-2.5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className={titulo3}>4. Opções <span className={cn('font-normal', perguntas.length < MIN_PERGUNTAS_GERENTES ? 'text-warning' : 'text-muted-foreground')}>· {perguntas.length} (mínimo {MIN_PERGUNTAS_GERENTES})</span></h3>
          <div className="flex gap-1.5">
            <Button type="button" size="sm" variant="outline" className="h-7 gap-1 text-xs"
              onClick={() => mudar({ perguntas: [...r.perguntas, { id: `nova-${Date.now()}`, emoji: '⭐', texto: '' }] })}>
              <Plus className="h-3 w-3" /> Opção
            </Button>
            <Button type="button" size="sm" variant="ghost" className="h-7 gap-1 text-xs"
              onClick={() => mudar({ perguntas: PERGUNTAS_PADRAO_GERENTES.map(p => ({ ...p })) })}>
              <RotateCcw className="h-3 w-3" /> Padrão
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          O operador vê o gerente dele e a pergunta «Selecione a opção que mais se encaixa com seu gerente», e marca UMA destas. Com 2 gerentes no
          setor, marca uma para cada (opções diferentes). O resultado mostra o perfil de cada gerente: o que a equipe dele mais marcou, em %.
        </p>
        <ol className="grid gap-1.5 sm:grid-cols-2">
          {r.perguntas.map((p, n) => (
            <li key={p.id} className="flex items-center gap-1.5">
              <span className="w-5 text-right text-[11px] tabular-nums text-muted-foreground">{n + 1}</span>
              <Input value={p.emoji} onChange={e => mudar({ perguntas: r.perguntas.map((q, i) => (i === n ? { ...q, emoji: e.target.value } : q)) })}
                className="h-8 w-11 px-1 text-center" aria-label={`Emoji da opção ${n + 1}`} maxLength={4} />
              <Input value={p.texto} onChange={e => mudar({ perguntas: r.perguntas.map((q, i) => (i === n ? { ...q, texto: e.target.value } : q)) })}
                placeholder="Mais …" className="h-8 flex-1 text-sm" aria-label={`Opção ${n + 1}`} />
              <Button type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0" aria-label={`Apagar a opção ${n + 1}`}
                onClick={() => mudar({ perguntas: r.perguntas.filter((_, i) => i !== n) })}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ol>
      </section>

      {/* 6. Ver e liberar */}
      <section className="space-y-3 rounded-lg border bg-muted/30 p-3">
        <h3 className={titulo3}>6. Ver como fica e liberar</h3>
        <div className="flex flex-wrap items-end gap-2 rounded-md border border-primary/30 bg-background p-2.5">
          <div className="grid min-w-[220px] flex-1 gap-1">
            <label htmlFor="vg-titulo" className="text-xs text-muted-foreground">Título que a operação vê</label>
            <Input id="vg-titulo" value={r.titulo} maxLength={120} onChange={e => mudar({ titulo: e.target.value })} className="h-9 text-sm" />
          </div>
          <Button type="button" variant="outline" className="gap-2" disabled={problemas.length > 0} onClick={() => setDemo(Math.floor(Math.random() * 2 ** 31))}>
            <Play className="h-4 w-4" /> Abrir a demonstração
          </Button>
          <Button type="button" className="gap-2" disabled={paraLiberar.length > 0 || liberando} onClick={() => setConfirmando(true)}>
            <Send className="h-4 w-4" /> Liberar para a operação
          </Button>
        </div>
        {paraLiberar.length > 0
          ? <ul className="space-y-0.5 text-xs text-warning">{paraLiberar.map(p => <li key={p}>• {p}</li>)}</ul>
          : <p className="text-xs text-muted-foreground">
              A demonstração mostra a votação como a operação vai ver (nada é gravado; os votos dos outros são sorteados), a apuração da diretoria e a revelação.
              «Liberar» grava e abre para as {m.eleitores.length} pessoas; cada uma vê o card «Votar agora» no canto da tela.
            </p>}
      </section>

      <AlertDialog open={confirmando} onOpenChange={o => { if (!liberando) setConfirmando(o); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Liberar «{tituloLimpo}» para a operação?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  <strong className="text-foreground">{m.eleitores.length} pessoas votam</strong> em <strong className="text-foreground">{m.candidatos.length} gerentes</strong> ·
                  {' '}{perguntas.length} opções · {NOME_DO_PRODUTO[r.produto]}.
                </p>
                <p>Cada pessoa marca, para o gerente do próprio setor, a opção que mais se encaixa com ele. Depois de liberada, quem vota, os gerentes e as perguntas não mudam. O voto é secreto.</p>
                <p className="max-h-24 overflow-y-auto rounded-md bg-muted px-2.5 py-1.5 text-xs">
                  <strong>Cédula por setor:</strong>{' '}
                  {setoresQueVotam.map(s => `${nomeDoSetor.get(s) ?? 'Setor'} → ${m.gerentesDoSetor(s).map(g => nomeCurto(g.nome)).join(' e ') || '—'}`).join(' · ')}
                </p>
                <p className="max-h-20 overflow-y-auto rounded-md bg-muted px-2.5 py-1.5 text-xs"><strong>Gerentes:</strong> {m.candidatos.map(p => p.nome).join(', ')}</p>
                <p className="max-h-28 overflow-y-auto rounded-md bg-muted px-2.5 py-1.5 text-xs"><strong>Votam:</strong> {m.eleitores.map(p => p.nome).join(', ')}</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={liberando}>Voltar</AlertDialogCancel>
            <AlertDialogAction disabled={liberando} onClick={e => { e.preventDefault(); void liberar(); }} className="gap-2">
              {liberando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Liberar agora
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {demo !== null && (
        <TelaVotacao cedula={cedula} pessoas={pessoasDaCedula} eleitorId={eleitorDemo?.id ?? null} nomeEleitor={eleitorDemo?.nome}
          semente={demo} tipo="gerentes"
          eleitoresSimulados={m.eleitores.map(p => p.id)} onFechar={() => setDemo(null)} />
      )}
    </div>
  );
}
