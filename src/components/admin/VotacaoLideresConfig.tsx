/**
 * VotacaoLideresConfig — Configurações › Eventos e gincanas › Votação da
 * Liderança (04/11/2026).
 *
 * VALENDO desde 09/11/2026: «Liberar para os líderes» grava a votação montada
 * aqui e abre para os participantes (`liberarParaOsLideres`). As votações
 * gravadas aparecem no topo (`PainelVotacoes`): andamento, Encerrar, apuração
 * da diretoria com os empates e «Liberar o resultado». O resto da tela
 * continua sendo o rascunho e a demonstração descritos abaixo.
 *
 * Aqui quem organiza monta a votação:
 *   1. a operação — BookPlay e PaguePlay OU Vendas, nunca misturadas — e os
 *      SETORES que participam (nenhum vem marcado: a escolha é de quem organiza);
 *   2. quem entra: os cargos (padrão Líder), quem fica de fora (férias, saiu)
 *      e quem entra À MÃO, de qualquer cargo ou setor (alguém da diretoria);
 *   3. as perguntas (mínimo 15);
 *   4. a prévia: em cada pergunta aparecem TODOS os escolhidos, encaixados.
 * «Abrir a demonstração» mostra a votação exatamente como o líder vai ver,
 * votando como qualquer um deles; depois a apuração da diretoria (empate é ela
 * quem decide, antes de liberar) e a revelação, com votos sorteados.
 *
 * O rascunho fica neste navegador (nomes e fotos lidos do cadastro por
 * `lerParticipantes`); só vai para o banco ao liberar. «Recarregar cadastro»
 * lê de novo quem mudou de cargo ou de setor com a tela aberta.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Vote, Loader2, Play, Plus, Trash2, RotateCcw, Send, Search, UserPlus, X, PanelBottomOpen, RefreshCw } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { liberarParaOsLideres, mensagemDoErro } from '@/components/VotacaoLideres/banco';
import { PainelVotacoes } from '@/components/VotacaoLideres/PainelVotacoes';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { PERFIL_LABELS } from '@/lib/index';
import { ehProduto, type Produto } from '@/lib/produto';
import {
  MIN_LIDERES, MIN_PERGUNTAS, PERGUNTAS_PADRAO, VERSAO_PERGUNTAS, aplicarDesempates, apurar, cedulaComTodos, empatadas, maximoDeRespostas,
  nomeCurto, simularVotos, type Candidato, type Pergunta,
} from '@/components/VotacaoLideres/cedula';
import {
  NOME_DO_PRODUTO, lerParticipantes, motivoDeConta, type Participante,
} from '@/components/VotacaoLideres/participantes';
import { FotoLider } from '@/components/VotacaoLideres/FotoLider';
import { GradeDeLideres } from '@/components/VotacaoLideres/GradeDeLideres';
import { SeloDemonstracao, TelaVotacao, type FormatoDaVotacao } from '@/components/VotacaoLideres/TelaVotacao';
import { CardDaVotacao, type TipoDoCard } from '@/components/VotacaoLideres/CardDaVotacao';
import { TelaResultado } from '@/components/VotacaoLideres/TelaResultado';
import { MontarVotacaoGerentes } from '@/components/VotacaoLideres/MontarVotacaoGerentes';
import type { TipoDaVotacao } from '@/components/VotacaoLideres/textos';

/** Cargos que podem entrar na votação; «Líder» já vem marcado. */
const CARGOS_POSSIVEIS = ['lider', 'elite', 'gerencia'] as const;

interface Rascunho {
  produto: Produto;
  /** Setores que participam. */
  setores: string[];
  cargos: string[];
  tirados: string[];
  /** Contas tiradas pelo nome («Suporte Play 2») que quem organiza colocou de volta. */
  voltaram: string[];
  /** Pessoas incluídas à mão (qualquer cargo/setor), por cima da escolha de setores. */
  incluidos: string[];
  perguntas: Pergunta[];
  /** De que lista-base vieram as perguntas: mudou a base, o rascunho troca. */
  versaoPerguntas: number;
  /** Como o líder vota: todas as categorias juntas (padrão) ou uma pergunta por tela. */
  formato: FormatoDaVotacao;
}

const CHAVE = 'votacao-lideres:rascunho:v2';
const novaSemente = () => Math.floor(Math.random() * 2 ** 31);
const PADRAO = (): Rascunho => ({
  produto: 'cobranca', setores: [], cargos: ['lider'], tirados: [], voltaram: [], incluidos: [], perguntas: PERGUNTAS_PADRAO.map(p => ({ ...p })), versaoPerguntas: VERSAO_PERGUNTAS, formato: 'categorias',
});
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const listaDeTexto = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => typeof x === 'string');

function lerRascunho(): Rascunho {
  try {
    const bruto = localStorage.getItem(CHAVE);
    if (!bruto) return PADRAO();
    const r = JSON.parse(bruto) as Partial<Rascunho>;
    const base = PADRAO();
    return {
      produto: ehProduto(r.produto) ? r.produto : base.produto,
      setores: listaDeTexto(r.setores) ? r.setores : [],
      cargos: listaDeTexto(r.cargos) && r.cargos.length ? r.cargos : base.cargos,
      tirados: listaDeTexto(r.tirados) ? r.tirados : [],
      voltaram: listaDeTexto(r.voltaram) ? r.voltaram : [],
      incluidos: listaDeTexto(r.incluidos) ? r.incluidos : [],
      // Rascunho de uma lista-base antiga (as 20 de antes): entra a lista nova.
      perguntas: r.versaoPerguntas === VERSAO_PERGUNTAS && Array.isArray(r.perguntas) && r.perguntas.length ? r.perguntas : base.perguntas,
      versaoPerguntas: VERSAO_PERGUNTAS,
      formato: r.formato === 'uma_por_vez' ? 'uma_por_vez' : 'categorias',
    };
  } catch { return PADRAO(); }
}

export default function VotacaoLideresConfig() {
  const { perfil } = useAuth();
  const [dados, setDados] = useState<Awaited<ReturnType<typeof lerParticipantes>> | null>(null);
  /** Que votação montar (12/11/2026): a da liderança ou a dos gerentes. */
  const [montando, setMontando] = useState<TipoDaVotacao>('lideranca');
  const [erro, setErro] = useState<string | null>(null);
  const [r, setR] = useState<Rascunho>(lerRascunho);
  const [eleitorId, setEleitorId] = useState<string>('');
  /** A semente dos votos sorteados do resultado: nova a cada demonstração. */
  const [aberta, setAberta] = useState<number | null>(null);
  /** O card do canto como o líder vai ver (demonstração). */
  const [cardDemo, setCardDemo] = useState<{ tipo: TipoDoCard; minimizado: boolean } | null>(null);
  const [resultadoDemo, setResultadoDemo] = useState<number | null>(null);
  /** Valendo (09/11/2026): o título, a confirmação e a lista que relê depois de liberar. */
  const [titulo, setTitulo] = useState('Votação da Liderança');
  const [confirmando, setConfirmando] = useState(false);
  const [liberando, setLiberando] = useState(false);
  const [versaoPainel, setVersaoPainel] = useState(0);
  const [relendo, setRelendo] = useState(false);

  const lerCadastro = useCallback(async () => {
    setRelendo(true);
    try {
      setDados(await lerParticipantes());
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setRelendo(false);
    }
  }, []);
  useEffect(() => { void lerCadastro(); }, [lerCadastro]);

  useEffect(() => { try { localStorage.setItem(CHAVE, JSON.stringify(r)); } catch { /* sem armazenamento: o rascunho só vive na tela */ } }, [r]);
  const mudar = (parcial: Partial<Rascunho>) => setR(atual => ({ ...atual, ...parcial }));

  const pessoas = useMemo(() => dados?.pessoas ?? [], [dados]);
  /** Os produtos que têm alguém com os cargos escolhidos (cobrança primeiro). */
  const produtos = useMemo(() => {
    const m = new Map<Produto, number>();
    for (const p of pessoas) if (p.produto && r.cargos.includes(p.perfil)) m.set(p.produto, (m.get(p.produto) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => Number(b[0] === 'cobranca') - Number(a[0] === 'cobranca'));
  }, [pessoas, r.cargos]);

  /** Quantos de cada setor têm os cargos escolhidos (antes de tirar alguém). */
  const porSetorId = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of pessoas) if (p.setorId && r.cargos.includes(p.perfil)) m.set(p.setorId, (m.get(p.setorId) ?? 0) + 1);
    return m;
  }, [pessoas, r.cargos]);
  /** Só os grupos da operação escolhida, e só setores com alguém do cargo. */
  const grupos = useMemo(() => (dados?.grupos ?? [])
    .filter(g => g.produto === r.produto)
    .map(g => ({ ...g, setores: g.setores.filter(s => (porSetorId.get(s.id) ?? 0) > 0) }))
    .filter(g => g.setores.length > 0), [dados, r.produto, porSetorId]);
  const setoresValidos = useMemo(() => new Set(grupos.flatMap(g => g.setores.map(s => s.id))), [grupos]);
  const marcados = useMemo(() => new Set(r.setores.filter(id => setoresValidos.has(id))), [r.setores, setoresValidos]);

  /** Os dos setores marcados (com os tirados), em ordem de setor e nome. */
  const doCargo = useMemo(() => pessoas
    .filter(p => p.produto === r.produto && p.setorId !== null && marcados.has(p.setorId) && r.cargos.includes(p.perfil))
    .sort((a, b) => a.setor.localeCompare(b.setor, 'pt-BR', { numeric: true }) || a.nome.localeCompare(b.nome, 'pt-BR')),
  [pessoas, r.produto, marcados, r.cargos]);
  /** Contas que não parecem pessoa («Suporte Play 2», «Lider Supervisor»): saem sozinhas. */
  const contas = useMemo(() => doCargo
    .map(p => ({ p, motivo: motivoDeConta(p.nome) }))
    .filter((c): c is { p: Participante; motivo: string } => c.motivo !== null), [doCargo]);
  const ehConta = useMemo(() => new Set(contas.filter(c => !r.voltaram.includes(c.p.id)).map(c => c.p.id)), [contas, r.voltaram]);
  /** Os incluídos à mão: entram sempre, mesmo tirados, «conta» ou de outro cargo/setor. */
  const incluidos = useMemo(() => r.incluidos
    .map(id => pessoas.find(p => p.id === id))
    .filter((p): p is Participante => !!p), [r.incluidos, pessoas]);
  const lideres = useMemo(() => {
    const ja = new Set(incluidos.map(p => p.id));
    return [...doCargo.filter(p => !ja.has(p.id) && !r.tirados.includes(p.id) && !ehConta.has(p.id)), ...incluidos];
  }, [doCargo, incluidos, r.tirados, ehConta]);
  // Quem não tem setor (a diretoria) aparece na votação pelo cargo: «Diretoria».
  const mapa = useMemo(() => new Map<string, Candidato>(lideres.map(p => [
    p.id, p.setorId ? p : { ...p, setor: PERFIL_LABELS[p.perfil] ?? 'Sem setor' },
  ])), [lideres]);

  const [busca, setBusca] = useState('');
  const achados = useMemo(() => {
    const termo = semAcento(busca.trim());
    if (termo.length < 2) return [];
    const ja = new Set(lideres.map(p => p.id));
    return pessoas.filter(p => !ja.has(p.id) && semAcento(p.nome).includes(termo)).slice(0, 8);
  }, [busca, pessoas, lideres]);
  const incluir = (id: string) => { mudar({ incluidos: [...r.incluidos.filter(x => x !== id), id] }); setBusca(''); };
  const desincluir = (id: string) => mudar({ incluidos: r.incluidos.filter(x => x !== id) });

  const perguntas = useMemo(() => r.perguntas.filter(p => p.texto.trim()), [r.perguntas]);
  const cedula = useMemo(() => cedulaComTodos(perguntas, lideres), [perguntas, lideres]);
  const emOrdem = useMemo(() => cedula[0]?.candidatos ?? [], [cedula]);
  // O resultado do card «Ver resultado» (demonstração): votos de todos sorteados;
  // os empates ficam com o primeiro empatado (ali a diretoria já teria decidido).
  const resultadosDemo = useMemo(() => {
    if (resultadoDemo === null) return [];
    const ap = apurar(cedula, simularVotos(cedula, emOrdem, resultadoDemo));
    return aplicarDesempates(ap, Object.fromEntries(empatadas(ap).map(e => [e.pergunta.id, e.vencedores[0]])));
  }, [resultadoDemo, cedula, emOrdem]);

  const problemas: string[] = [];
  if (marcados.size === 0 && incluidos.length === 0) problemas.push('Escolha os setores que participam (ou inclua pessoas à mão).');
  else if (lideres.length < MIN_LIDERES) problemas.push(`Precisa de pelo menos ${MIN_LIDERES} participantes.`);
  if (perguntas.length < MIN_PERGUNTAS) problemas.push(`São ${perguntas.length} perguntas; o mínimo combinado é ${MIN_PERGUNTAS}.`);
  const tituloLimpo = titulo.trim();
  const problemasParaLiberar = [...problemas];
  if (!tituloLimpo) problemasParaLiberar.push('Dê um título para a votação.');

  const liberar = async () => {
    setLiberando(true);
    try {
      await liberarParaOsLideres({
        titulo: tituloLimpo.slice(0, 120), produto: r.produto, setorIds: [...marcados], cargos: r.cargos,
        perguntas, participantes: lideres.map(p => p.id),
      });
      toast.success('Votação liberada para os líderes', {
        description: `${lideres.length} participantes já podem votar pelo card no canto da tela.`,
      });
      setConfirmando(false);
      setVersaoPainel(v => v + 1);
    } catch (e) {
      toast.error('Não deu para liberar', { description: mensagemDoErro(e) });
    } finally {
      setLiberando(false);
    }
  };

  // Votar como: a própria pessoa, se ela entra na votação; senão o primeiro da lista.
  const eleitor = mapa.has(eleitorId) ? eleitorId : (perfil?.id && mapa.has(perfil.id) ? perfil.id : emOrdem[0] ?? '');

  const porSetor = useMemo(() => {
    const m = new Map<string, Participante[]>();
    for (const p of doCargo) if (!ehConta.has(p.id)) m.set(p.setor, [...(m.get(p.setor) ?? []), p]);
    return [...m.entries()];
  }, [doCargo, ehConta]);
  const alternarVolta = (id: string) => mudar({
    voltaram: r.voltaram.includes(id) ? r.voltaram.filter(x => x !== id) : [...r.voltaram, id],
  });

  const alternarTirado = (id: string) => mudar({
    tirados: r.tirados.includes(id) ? r.tirados.filter(x => x !== id) : [...r.tirados, id],
  });
  const marcarSetores = (ids: string[], sim: boolean) => {
    const n = new Set(marcados);
    ids.forEach(id => (sim ? n.add(id) : n.delete(id)));
    mudar({ setores: [...n] });
  };
  const editarPergunta = (n: number, parcial: Partial<Pergunta>) =>
    mudar({ perguntas: r.perguntas.map((p, i) => (i === n ? { ...p, ...parcial } : p)) });

  const chip = (ativo: boolean) => cn('rounded-full border px-2.5 py-0.5 text-xs transition-colors', ativo ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:border-primary/60');
  const tirados = r.tirados.filter(id => doCargo.some(p => p.id === id)).length;
  const nomesDosCargos = r.cargos.map(c => (PERFIL_LABELS[c] ?? c).toLowerCase()).join(' / ');

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base"><Vote className="h-4 w-4 text-primary" /> Votação da Liderança</CardTitle>
          <SeloDemonstracao />
        </div>
        <p className="text-sm text-muted-foreground">
          Duas votações com a mesma mecânica: na da <strong className="text-foreground">Liderança</strong> os líderes votam uns nos outros;
          na dos <strong className="text-foreground">Gerentes</strong> a operação (os setores e equipes que você escolher) vota nos gerentes.
          Monte abaixo, veja como fica na demonstração e libere para valer.
        </p>
      </CardHeader>

      <CardContent className="space-y-6">
        <PainelVotacoes versao={versaoPainel} />

        {erro && <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">Não deu para ler o cadastro: {erro}</p>}
        {!dados && !erro && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Lendo os líderes do cadastro…</p>}

        {dados && (
          <div className="flex flex-wrap items-center gap-2 border-t pt-4">
            <span className="text-sm font-semibold">Montar uma votação nova:</span>
            <div role="radiogroup" aria-label="Tipo de votação" className="flex overflow-hidden rounded-md border text-xs">
              {([['lideranca', 'Liderança · líderes votam entre si'], ['gerentes', 'Gerentes · a operação vota']] as const).map(([v, t]) => (
                <button key={v} type="button" role="radio" aria-checked={montando === v} onClick={() => setMontando(v)}
                  className={cn('px-3 py-1.5', montando === v ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}>{t}</button>
              ))}
            </div>
            <button type="button" onClick={() => void lerCadastro()} disabled={relendo}
              title="Lê de novo o cadastro: quem mudou de cargo, setor ou equipe com esta tela aberta"
              className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline disabled:opacity-60">
              <RefreshCw className={cn('h-3 w-3', relendo && 'animate-spin')} /> Recarregar cadastro
            </button>
          </div>
        )}

        {dados && montando === 'gerentes' && (
          <MontarVotacaoGerentes dados={dados} onLiberada={() => setVersaoPainel(v => v + 1)} />
        )}

        {dados && montando === 'lideranca' && (
          <>
            {/* 1. Operação e setores */}
            <section className="space-y-2.5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="flex flex-wrap items-center gap-x-2 text-sm font-semibold">
                  <span>1. Operação e setores <span className="font-normal text-muted-foreground">· {marcados.size} {marcados.size === 1 ? 'setor marcado' : 'setores marcados'}</span></span>
                  <button type="button" onClick={() => void lerCadastro()} disabled={relendo}
                    title="Lê de novo o cadastro: quem virou líder ou mudou de setor com esta tela aberta"
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline disabled:opacity-60">
                    <RefreshCw className={cn('h-3 w-3', relendo && 'animate-spin')} /> Recarregar cadastro
                  </button>
                </h3>
                <div role="radiogroup" aria-label="Operação" className="flex overflow-hidden rounded-md border text-xs">
                  {produtos.map(([prod, n]) => (
                    <button key={prod} type="button" role="radio" aria-checked={r.produto === prod}
                      onClick={() => { if (r.produto !== prod) mudar({ produto: prod, setores: [], tirados: [] }); }}
                      className={cn('px-3 py-1', r.produto === prod ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}>
                      {NOME_DO_PRODUTO[prod]} <span className="opacity-70">{n}</span>
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Uma votação é de uma operação só: {NOME_DO_PRODUTO.comercial} não se mistura com {NOME_DO_PRODUTO.cobranca}.
                Marque os setores que participam; o número é quantos {nomesDosCargos} há em cada um.
              </p>
              <div className="space-y-2.5 rounded-lg border p-2.5">
                {grupos.length === 0 && <p className="py-3 text-center text-xs text-muted-foreground">Nenhum setor desta operação tem alguém com esses cargos.</p>}
                {grupos.map(g => {
                  const ids = g.setores.map(s => s.id);
                  const todos = ids.every(id => marcados.has(id));
                  return (
                    <div key={g.chave}>
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{g.rotulo}</p>
                        <button type="button" className="text-[11px] font-medium text-primary hover:underline" onClick={() => marcarSetores(ids, !todos)}>
                          {todos ? 'Desmarcar todos' : 'Marcar todos'}
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5" role="group" aria-label={`Setores de ${g.rotulo}`}>
                        {g.setores.map(s => {
                          const ativo = marcados.has(s.id);
                          return (
                            <button key={s.id} type="button" className={chip(ativo)} aria-pressed={ativo} onClick={() => marcarSetores([s.id], !ativo)}>
                              {s.nome} <span className="opacity-70">{porSetorId.get(s.id) ?? 0}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* 2. Quem entra */}
            <section className="space-y-2.5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold">2. Quem entra <span className="font-normal text-muted-foreground">· {lideres.length} na votação{tirados ? `, ${tirados} fora` : ''}{ehConta.size ? `, ${ehConta.size} ${ehConta.size === 1 ? 'conta tirada' : 'contas tiradas'}` : ''}</span></h3>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Cargos">
                  {CARGOS_POSSIVEIS.map(c => {
                    const ativo = r.cargos.includes(c);
                    return (
                      <button key={c} type="button" className={chip(ativo)} aria-pressed={ativo}
                        onClick={() => mudar({ cargos: ativo ? r.cargos.filter(x => x !== c) : [...r.cargos, c] })}>
                        {PERFIL_LABELS[c] ?? c}
                      </button>
                    );
                  })}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Nomes e fotos como estão no cadastro. Passe o mouse para ver cargo, setor e empresa; toque para tirar da votação (férias, saiu) ou colocar de volta.
              </p>
              <div className="max-h-64 space-y-2 overflow-y-auto rounded-lg border p-2.5">
                {porSetor.length === 0 && (
                  <p className="py-3 text-center text-xs text-muted-foreground">
                    {marcados.size ? 'Ninguém com esses cargos nos setores marcados.' : 'Marque os setores acima.'}
                  </p>
                )}
                {porSetor.map(([setor, gente]) => (
                  <div key={setor}>
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{setor}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {gente.map(p => {
                        const tirado = r.tirados.includes(p.id);
                        return (
                          <button key={p.id} type="button" onClick={() => alternarTirado(p.id)} aria-pressed={!tirado}
                            title={`${p.nome} — ${PERFIL_LABELS[p.perfil] ?? p.perfil} · ${p.setor}${p.empresa ? ` · ${p.empresa}` : ''}${tirado ? ' (fora: toque para colocar de volta)' : ''}`}
                            className={cn('flex items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2.5 text-xs transition-colors',
                              tirado ? 'border-dashed text-muted-foreground line-through opacity-60' : 'bg-card hover:border-primary/60')}>
                            <FotoLider lider={p} className="h-5 w-5 text-[8px]" /> {nomeCurto(p.nome)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              {contas.length > 0 && (
                <div className="space-y-1.5 rounded-lg border border-dashed p-2.5">
                  <p className="text-xs text-muted-foreground">
                    <strong className="text-foreground">Contas que não parecem pessoa</strong> (pelo nome: suporte, líder, supervisor, número…) ficam fora da votação.
                    Se alguma for gente de verdade, toque para colocar de volta.
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {contas.map(({ p, motivo }) => {
                      const voltou = r.voltaram.includes(p.id);
                      return (
                        <button key={p.id} type="button" onClick={() => alternarVolta(p.id)} aria-pressed={voltou}
                          title={`${p.nome} — ${PERFIL_LABELS[p.perfil] ?? p.perfil} · ${p.setor}${p.empresa ? ` · ${p.empresa}` : ''} · ${motivo}`}
                          className={cn('flex items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2.5 text-xs transition-colors',
                            voltou ? 'border-primary bg-primary/10' : 'text-muted-foreground line-through opacity-70 hover:opacity-100')}>
                          <FotoLider lider={p} className="h-5 w-5 text-[8px]" /> {p.nome}
                          <span className="text-[10px] no-underline opacity-70">· {voltou ? 'voltou' : p.setor}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>

            {/* 2b. Incluir à mão */}
            <section className="space-y-2.5">
              <h3 className="text-sm font-semibold">Incluir pessoa à mão <span className="font-normal text-muted-foreground">· qualquer cargo ou setor, como alguém da diretoria</span></h3>
              <div className="relative max-w-md">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar pelo nome (2 letras ou mais)" className="h-9 pl-8 text-sm" aria-label="Buscar pessoa para incluir" />
              </div>
              {busca.trim().length >= 2 && (
                <ul className="max-w-md divide-y overflow-hidden rounded-lg border">
                  {achados.length === 0 && <li className="px-3 py-2.5 text-xs text-muted-foreground">Ninguém com esse nome fora da votação.</li>}
                  {achados.map(p => (
                    <li key={p.id}>
                      <button type="button" onClick={() => incluir(p.id)} className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-muted/50">
                        <FotoLider lider={p} className="h-7 w-7 text-[10px]" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{p.nome}</span>
                          <span className="block truncate text-[11px] text-muted-foreground">
                            {PERFIL_LABELS[p.perfil] ?? p.perfil} · {p.setor}{p.empresa ? ` · ${p.empresa}` : ''}
                            {p.produto && p.produto !== r.produto ? ` · ${NOME_DO_PRODUTO[p.produto]}` : ''}
                          </span>
                        </span>
                        <UserPlus className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {incluidos.length > 0 && (
                <div className="flex flex-wrap gap-1.5" aria-label="Incluídos à mão">
                  {incluidos.map(p => (
                    <span key={p.id} className="flex items-center gap-1.5 rounded-full border border-primary/50 bg-primary/10 py-0.5 pl-0.5 pr-1 text-xs"
                      title={`${p.nome} — ${PERFIL_LABELS[p.perfil] ?? p.perfil} · ${p.setor}${p.empresa ? ` · ${p.empresa}` : ''}`}>
                      <FotoLider lider={p} className="h-5 w-5 text-[8px]" /> {nomeCurto(p.nome)}
                      <span className="text-[10px] text-muted-foreground">· {PERFIL_LABELS[p.perfil] ?? p.perfil}</span>
                      <button type="button" onClick={() => desincluir(p.id)} aria-label={`Tirar ${p.nome} da votação`}
                        className="rounded-full p-0.5 text-muted-foreground hover:bg-destructive/15 hover:text-destructive"><X className="h-3 w-3" /></button>
                    </span>
                  ))}
                </div>
              )}
            </section>

            {/* 3. Perguntas */}
            <section className="space-y-2.5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold">3. Perguntas <span className={cn('font-normal', perguntas.length < MIN_PERGUNTAS ? 'text-warning' : 'text-muted-foreground')}>· {perguntas.length} (mínimo {MIN_PERGUNTAS})</span></h3>
                <div className="flex gap-1.5">
                  <Button type="button" size="sm" variant="outline" className="h-7 gap-1 text-xs"
                    onClick={() => mudar({ perguntas: [...r.perguntas, { id: `nova-${Date.now()}`, emoji: '⭐', texto: '' }] })}>
                    <Plus className="h-3 w-3" /> Pergunta
                  </Button>
                  <Button type="button" size="sm" variant="ghost" className="h-7 gap-1 text-xs"
                    onClick={() => mudar({ perguntas: PERGUNTAS_PADRAO.map(p => ({ ...p })) })}>
                    <RotateCcw className="h-3 w-3" /> Padrão
                  </Button>
                </div>
              </div>
              <ol className="grid gap-1.5 sm:grid-cols-2">
                {r.perguntas.map((p, n) => (
                  <li key={p.id} className="flex items-center gap-1.5">
                    <span className="w-5 text-right text-[11px] tabular-nums text-muted-foreground">{n + 1}</span>
                    <Input value={p.emoji} onChange={e => editarPergunta(n, { emoji: e.target.value })} className="h-8 w-11 px-1 text-center" aria-label={`Emoji da pergunta ${n + 1}`} maxLength={4} />
                    <Input value={p.texto} onChange={e => editarPergunta(n, { texto: e.target.value })} placeholder="Quem é o líder mais…?" className="h-8 flex-1 text-sm" aria-label={`Pergunta ${n + 1}`} />
                    <Button type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0" aria-label={`Apagar a pergunta ${n + 1}`}
                      onClick={() => mudar({ perguntas: r.perguntas.filter((_, i) => i !== n) })}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
              </ol>
            </section>

            {/* 4. Como aparece */}
            <section className="space-y-2.5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold">4. Como aparece <span className="font-normal text-muted-foreground">· os {lideres.length} participantes em todas as perguntas</span></h3>
                <span className="text-[11px] text-muted-foreground">Ordem alfabética, igual para todo mundo</span>
              </div>
              <p className="text-xs text-muted-foreground">
                A tela encaixa todas as fotos de uma vez, no maior tamanho que couber: no PC e na TV ninguém precisa rolar.
                Abaixo, uma miniatura da primeira pergunta.
              </p>
              {lideres.length >= MIN_LIDERES && maximoDeRespostas(lideres.length, perguntas.length) < perguntas.length && (
                <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
                  Cada colega só pode ser escolhido uma vez por quem vota. Com {lideres.length} participantes, cada um consegue responder
                  no máximo {maximoDeRespostas(lideres.length, perguntas.length)} das {perguntas.length} perguntas — as outras ficam sem resposta.
                  Para todos responderem tudo, use até {lideres.length - 1} perguntas ou inclua mais participantes.
                </p>
              )}
              {/* Prévia viva: a mesma grade da votação, numa caixa 16:9. */}
              <div className="pointer-events-none overflow-hidden rounded-xl border bg-background" aria-hidden="true">
                <div className="flex aspect-video max-h-[360px] w-full flex-col gap-2 p-3">
                  <div className="flex shrink-0 items-center justify-center gap-2">
                    <span className="text-xl">{perguntas[0]?.emoji}</span>
                    <span className="text-sm font-bold">{perguntas[0]?.texto}</span>
                  </div>
                  {emOrdem.length > 0
                    ? <GradeDeLideres ids={emOrdem} pessoas={mapa} escolhido={undefined} eleitorId={null} rotulo="Prévia" onEscolher={() => undefined} />
                    : <p className="grid flex-1 place-items-center text-xs text-muted-foreground">Marque os setores para ver a prévia.</p>}
                </div>
              </div>
            </section>

            {/* 5. Demonstração */}
            <section className="space-y-3 rounded-lg border bg-muted/30 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">5. Ver como fica</h3>
                <div role="radiogroup" aria-label="Formato da votação" className="flex overflow-hidden rounded-md border text-xs">
                  {([['categorias', 'Categorias juntas'], ['uma_por_vez', 'Uma pergunta por vez']] as const).map(([v, t]) => (
                    <button key={v} type="button" role="radio" aria-checked={r.formato === v} onClick={() => mudar({ formato: v })}
                      className={cn('px-3 py-1', r.formato === v ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}>{t}</button>
                  ))}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {r.formato === 'categorias'
                  ? 'Categorias juntas: o líder vê todas as perguntas numa tela, toca em cada uma e escolhe quem mais combina.'
                  : 'Uma pergunta por vez: cada pergunta ocupa a tela, com as fotos de todos; no fim, a revisão.'}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-xs text-muted-foreground" htmlFor="vl-eleitor">Votar como</label>
                <select id="vl-eleitor" value={eleitor} onChange={e => setEleitorId(e.target.value)}
                  className="h-8 min-w-[200px] flex-1 rounded-md border bg-background px-2 text-sm sm:flex-none">
                  {emOrdem.map(id => mapa.get(id)).map(p => p && <option key={p.id} value={p.id}>{p.nome} · {p.setor}</option>)}
                </select>
                <Button type="button" className="gap-2" disabled={problemas.length > 0} onClick={() => setAberta(novaSemente())}>
                  <Play className="h-4 w-4" /> Abrir a demonstração
                </Button>
              </div>
              <div className="flex flex-wrap items-end gap-2 rounded-md border border-primary/30 bg-background p-2.5">
                <div className="grid min-w-[220px] flex-1 gap-1">
                  <label htmlFor="vl-titulo" className="text-xs text-muted-foreground">Título que os líderes veem</label>
                  <Input id="vl-titulo" value={titulo} maxLength={120} onChange={e => setTitulo(e.target.value)} className="h-9 text-sm" />
                </div>
                <Button type="button" className="gap-2" disabled={problemasParaLiberar.length > 0 || liberando} onClick={() => setConfirmando(true)}>
                  <Send className="h-4 w-4" /> Liberar para os líderes
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">O card no canto da tela:</span>
                <Button type="button" size="sm" variant="outline" className="h-7 gap-1.5 text-xs" disabled={problemas.length > 0}
                  onClick={() => setCardDemo({ tipo: 'votar', minimizado: false })}>
                  <PanelBottomOpen className="h-3.5 w-3.5" /> Ver o card: votar
                </Button>
                <Button type="button" size="sm" variant="outline" className="h-7 gap-1.5 text-xs" disabled={problemas.length > 0}
                  onClick={() => setCardDemo({ tipo: 'resultado', minimizado: false })}>
                  <PanelBottomOpen className="h-3.5 w-3.5" /> Ver o card: resultado
                </Button>
              </div>
              {problemasParaLiberar.length > 0
                ? <ul className="space-y-0.5 text-xs text-warning">{problemasParaLiberar.map(p => <li key={p}>• {p}</li>)}</ul>
                : <p className="text-xs text-muted-foreground">
                    A demonstração abre em tela cheia: a votação igual à do líder, depois a apuração que só a diretoria vê (onde ela decide os empates
                    e libera) e, por fim, a revelação. Os votos dos outros são sorteados, com alguns empates de propósito.
                    «Liberar para os líderes» grava esta votação e abre para os {lideres.length} participantes.
                  </p>}
            </section>
          </>
        )}
      </CardContent>

      <AlertDialog open={confirmando} onOpenChange={o => { if (!liberando) setConfirmando(o); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Liberar «{tituloLimpo}» para os líderes?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  <strong className="text-foreground">{lideres.length} participantes</strong> · {perguntas.length} perguntas · {NOME_DO_PRODUTO[r.produto]}.
                  Cada um vê na hora o card «Votar agora» no canto da tela.
                </p>
                <p>Depois de liberada, a lista de participantes e as perguntas não mudam. O voto é secreto: ninguém vê em quem cada um votou.</p>
                {r.formato === 'uma_por_vez' && <p>Os líderes votam com as categorias juntas, numa tela só.</p>}
                <p className="max-h-28 overflow-y-auto rounded-md bg-muted px-2.5 py-1.5 text-xs">{lideres.map(p => p.nome).join(', ')}</p>
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

      {aberta !== null && (
        <TelaVotacao cedula={cedula} pessoas={mapa} eleitorId={eleitor || null} semente={aberta} formato={r.formato} onFechar={() => setAberta(null)} />
      )}

      {cardDemo && aberta === null && resultadoDemo === null && (
        <CardDaVotacao demo tipo={cardDemo.tipo} titulo="Votação da Liderança (demonstração)" minimizado={cardDemo.minimizado}
          recuoEsquerda={16 + 240}
          onAbrir={() => { if (cardDemo.tipo === 'votar') setAberta(novaSemente()); else setResultadoDemo(novaSemente()); }}
          onMinimizar={() => setCardDemo({ ...cardDemo, minimizado: true })}
          onExpandir={() => setCardDemo({ ...cardDemo, minimizado: false })}
          onDispensar={() => setCardDemo(null)} />
      )}
      {resultadoDemo !== null && (
        <TelaResultado demo titulo="Votação da Liderança (demonstração)" cedula={cedula} pessoas={mapa}
          resultados={resultadosDemo}
          onFechar={() => setResultadoDemo(null)} />
      )}
    </Card>
  );
}
