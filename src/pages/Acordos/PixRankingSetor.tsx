/**
 * PixRankingSetor.tsx — ranking de Pix automático, um setor de cada vez.
 *
 * ## O ranking é DE um setor, nunca ENTRE setores
 *
 * Até 05/09/2026 o card recebia `itens` cru e ordenava o que viesse. Para o
 * líder isso bastava — a consulta dele já vinha recortada. Para quem enxerga a
 * empresa inteira, não: o pódio somava Receptivo, Play 1 e Digital numa lista
 * só, e ainda estampava no cabeçalho o nome de UM setor, porque o rótulo saía
 * de `setorConfig`. Um ranking misturado apresentado como se fosse de um setor.
 *
 * Comparar operadores de setores diferentes não responde pergunta nenhuma: as
 * metas de acordos são por setor (`meta_acordos_dobra`), o percentual de
 * comissão é por setor, e o volume que chega a cada um não se parece. Por isso
 * não existe aba «Todos» aqui, e não é omissão — é a regra.
 *
 * ## As abas são do card, não da tela
 *
 * A barra de setores do topo da aba rege metas, NRs, premiações e a tabela.
 * O ranking tem as PRÓPRIAS abas, e o motivo é que os dois públicos querem
 * coisas diferentes ao mesmo tempo: a diretoria compara setores sem desmontar
 * o recorte da tela, e o líder chega no ranking dele com um clique. Quem
 * enxerga um setor só não vê fileira de abas — ela não teria o que oferecer.
 *
 * ## O desenho
 *
 * O 1º lugar ocupa um cartão mais largo e mais alto que o 2º e o 3º: a
 * hierarquia é lida pelo TAMANHO antes da cor, e sobrevive a quem não separa
 * âmbar de laranja. Do 4º em diante vira lista densa, porque ali a pergunta
 * deixa de ser «quem ganhou» e passa a ser «onde eu estou».
 *
 * O pódio mostra a FOTO de quem está nele — `perfis.foto_url`, o mesmo cadastro
 * da barra lateral. Sigla identifica quem já sabe de quem é a sigla; num pódio
 * que a equipe inteira olha, o rosto é o que faz reconhecer sem ler. Sem foto
 * (ou com a URL morta) `AvatarParticipante` cai nas iniciais sozinho.
 *
 * O card pode ser FECHADO: é informação de acompanhamento, não de operação, e
 * o líder que confere acordo por acordo quer a tabela na tela. A escolha — e a
 * aba — ficam guardadas no navegador para não serem refeitas a cada visita.
 *
 * ## Separado por equipe (24/11/2026)
 *
 * Dentro do setor, o card tem dois modos. «Operadores» é o pódio de sempre,
 * agora com uma fileira de equipes para recortar: escolhida a equipe, o pódio
 * é o DELA, com os lugares contados de novo. «Equipes» põe as equipes do setor
 * disputando entre si — ver `PixRankingEquipes`. Nenhum dos dois atravessa
 * setores: a equipe de outro setor nunca aparece numa aba.
 *
 * A ordenação e as somas moram em `rankingPixSetor` e `rankingPixPorEquipe`
 * (puras, com teste).
 */
import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Crown, Medal, Zap, ChevronDown, Eye, EyeOff, Users, User } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/index';
import { cn } from '@/lib/utils';
import { AvatarParticipante } from '@/pages/Analitico/Desafios/AvatarParticipante';
import {
  rankingPixPorEquipe,
  type LinhaRankingPix, type MetaDaEquipeNoRanking, type OrdemRankingEquipe,
} from './pixAutomaticoView';
import { PixRankingEquipes } from './PixRankingEquipes';
import { PODIO, lido, grava } from './pixRankingPodio';

const CHAVE_ABERTO = 'pix-ranking-aberto';
const CHAVE_SETOR  = 'pix-ranking-setor';

const CHAVE_MODO   = 'pix-ranking-modo';
const CHAVE_EQUIPE = 'pix-ranking-equipe';
const CHAVE_ORDEM  = 'pix-ranking-ordem-equipe';

/** O filtro «Sem equipe» na fileira de chips. Não colide com um uuid. */
const SEM_EQUIPE = '__sem_equipe__';
/** O filtro «Todas». */
const TODAS = '';

type ModoRanking = 'operadores' | 'equipes';

/** Equipe escolhida por setor, guardada como `{ setorId: equipeId }`. */
function equipesGuardadas(): Record<string, string> {
  try { return JSON.parse(lido(CHAVE_EQUIPE) ?? '{}') ?? {}; } catch { return {}; }
}

/** Um setor e o ranking dele, já calculado por quem chama. */
export interface AbaRankingPix {
  setorId: string;
  nome: string;
  linhas: LinhaRankingPix[];
  /** As equipes do setor, inclusive as paradas. Vazio = setor sem equipe. */
  equipes?: { id: string; nome: string }[];
  /** operador_id → equipe dele NESTE setor (`null` = sem equipe). */
  equipeDe?: Record<string, string | null>;
  /** % da meta de Pix de cada equipe no mês, quando há meta. */
  metaPorEquipe?: Record<string, MetaDaEquipeNoRanking>;
}

export interface PixRankingSetorProps {
  /** Um item por setor. Nunca contém uma aba «todos» — ver o cabeçalho. */
  abas: AbaRankingPix[];
  /** Aba em que o card abre na primeira visita. Normalmente o próprio setor. */
  setorInicial?: string | null;
  /**
   * Equipe em que o card abre quando a pessoa ainda não escolheu uma no setor
   * — a equipe filtrada na barra do topo. Só vale se for do setor da aba.
   */
  equipeInicial?: string | null;
  /**
   * Foto de cada operador, por id (`perfis.foto_url`).
   *
   * Fica fora de `LinhaRankingPix` de propósito: `rankingPixSetor` calcula
   * quem está na frente, e a foto não entra nessa conta. Ausente, o pódio
   * desenha as iniciais.
   */
  fotoPorOperador?: Record<string, string | null>;
  /** Destaca a linha de quem está olhando. */
  destacarOperadorId?: string | null;
  /**
   * Abre e fecha? Na sub-aba Ranking (16/10/2026) não: a aba inteira É o
   * ranking, e um card fechado ali seria uma aba vazia. Padrão `true`.
   */
  recolhivel?: boolean;
  /** O que desenhar quando o setor não tem ninguém no ranking. Padrão: nada. */
  vazio?: React.ReactNode;
}

/** Selo de "cumpriu a meta de acordos do setor" — não afirma que a comissão dobrou. */
function SeloAcordos() {
  return (
    <span
      title="Cumpriu o requisito de acordos Pix no mês (a dobra exige também a meta do mês)"
      className="shrink-0 inline-flex items-center gap-0.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-1 py-0.5 text-[9px] font-bold text-amber-500 dark:text-amber-400"
    >
      <Zap className="w-2.5 h-2.5" /> meta
    </span>
  );
}

export function PixRankingSetor({
  abas, setorInicial, equipeInicial, fotoPorOperador, destacarOperadorId,
  recolhivel = true, vazio = null,
}: PixRankingSetorProps) {
  const [abertoGuardado, setAberto] = useState<boolean>(() => lido(CHAVE_ABERTO) !== 'nao');
  const aberto = recolhivel ? abertoGuardado : true;

  /*
   * A aba escolhida é lembrada, mas a lembrança só vale se o setor ainda
   * existir na lista: alguém que guardou «Digital» e perdeu o acesso a ele
   * abriria num card vazio, sem nada na tela explicando o vazio.
   */
  const [setorAtivo, setSetorAtivo] = useState<string | null>(() => lido(CHAVE_SETOR));

  /*
   * A aba é DERIVADA, e a ordem da queda importa:
   *
   *   1. a que a pessoa escolheu (guardada), enquanto o setor existir;
   *   2. o setor em foco da barra do topo — e é só até o primeiro clique que o
   *      card acompanha a barra. Depois disso ele anda sozinho, que é o ponto
   *      de ter abas próprias: comparar setores sem desmontar o resto da tela;
   *   3. a primeira aba, para o card nunca abrir vazio.
   */
  const existe = (id: string | null) => id != null && abas.some(a => a.setorId === id);
  const ativo = existe(setorAtivo)
    ? setorAtivo
    : (existe(setorInicial ?? null) ? (setorInicial ?? null) : (abas[0]?.setorId ?? null));

  function alternar() {
    setAberto(a => { grava(CHAVE_ABERTO, a ? 'nao' : 'sim'); return !a; });
  }

  function escolherSetor(id: string) {
    grava(CHAVE_SETOR, id);
    setSetorAtivo(id);
  }

  // ── Equipes ──
  const [modoGuardado, setModo] = useState<ModoRanking>(() =>
    lido(CHAVE_MODO) === 'equipes' ? 'equipes' : 'operadores');
  const [ordemGuardada, setOrdem] = useState<OrdemRankingEquipe>(() => {
    const o = lido(CHAVE_ORDEM);
    return o === 'media' || o === 'meta' ? o : 'acordos';
  });
  const [equipePorSetor, setEquipePorSetor] = useState<Record<string, string>>(equipesGuardadas);

  const aba = abas.find(a => a.setorId === ativo) ?? abas[0];
  const equipeDe = useMemo(() => aba?.equipeDe ?? {}, [aba]);
  const equipesDoSetor = useMemo(() => aba?.equipes ?? [], [aba]);
  const metaPorEquipe = useMemo(() => aba?.metaPorEquipe ?? {}, [aba]);
  const linhasDaAba = useMemo(() => aba?.linhas ?? [], [aba]);

  /** O id que a fileira de chips usa para a linha: a equipe, ou «sem equipe». */
  const chipDe = (operadorId: string) => equipeDe[operadorId] ?? SEM_EQUIPE;

  /*
   * As equipes que viram chip: as do setor que têm alguém no ranking, mais
   * «Sem equipe» quando sobra gente fora. Chip de equipe parada abriria um
   * pódio vazio — ela aparece no modo Equipes, zerada, que é onde isso informa.
   */
  const chips = useMemo(() => {
    const comGente = new Set(linhasDaAba.map(l => equipeDe[l.operadorId] ?? SEM_EQUIPE));
    const lista = equipesDoSetor
      .filter(e => comGente.has(e.id))
      .map(e => ({ id: e.id, nome: e.nome }));
    if (comGente.has(SEM_EQUIPE) && lista.length > 0) lista.push({ id: SEM_EQUIPE, nome: 'Sem equipe' });
    return lista;
  }, [linhasDaAba, equipeDe, equipesDoSetor]);

  // Setor sem equipe nenhuma não tem o que separar: o card fica como sempre foi.
  const temEquipes = chips.length > 0;
  const modo: ModoRanking = temEquipes ? modoGuardado : 'operadores';

  /*
   * A equipe do filtro — mesma queda da aba de setor: a escolhida no setor
   * (enquanto ainda for chip), a da barra do topo, e por fim «Todas».
   */
  const guardada = aba ? equipePorSetor[aba.setorId] : undefined;
  const ehChip = (id: string | null | undefined): id is string =>
    id != null && chips.some(c => c.id === id);
  const equipeFiltro = guardada === TODAS ? TODAS
    : ehChip(guardada) ? guardada
    : ehChip(equipeInicial) ? equipeInicial
    : TODAS;

  const temMeta = Object.keys(metaPorEquipe).length > 0;
  const ordem: OrdemRankingEquipe = ordemGuardada === 'meta' && !temMeta ? 'acordos' : ordemGuardada;
  const rankingEquipes = useMemo(
    () => rankingPixPorEquipe(linhasDaAba, equipeDe, equipesDoSetor, metaPorEquipe, ordem),
    [linhasDaAba, equipeDe, equipesDoSetor, metaPorEquipe, ordem],
  );

  const nomeDaEquipe = useMemo(() => {
    const m = new Map(equipesDoSetor.map(e => [e.id, e.nome]));
    return (operadorId: string): string | null => {
      const id = equipeDe[operadorId];
      return id ? m.get(id) ?? null : null;
    };
  }, [equipesDoSetor, equipeDe]);

  function escolherModo(m: ModoRanking) {
    grava(CHAVE_MODO, m);
    setModo(m);
  }
  function escolherOrdem(o: OrdemRankingEquipe) {
    grava(CHAVE_ORDEM, o);
    setOrdem(o);
  }
  function escolherEquipe(id: string) {
    if (!aba) return;
    const setorId = aba.setorId;
    setEquipePorSetor(atual => {
      const novo = { ...atual, [setorId]: id };
      grava(CHAVE_EQUIPE, JSON.stringify(novo));
      return novo;
    });
  }
  /** Clique numa equipe do modo Equipes: abre os operadores dela. */
  function abrirEquipe(equipeId: string | null) {
    escolherEquipe(equipeId ?? SEM_EQUIPE);
    escolherModo('operadores');
  }

  if (!aba || aba.linhas.length === 0) return <>{vazio}</>;

  const linhas = equipeFiltro === TODAS
    ? aba.linhas
    : aba.linhas.filter(l => chipDe(l.operadorId) === equipeFiltro);
  const podio  = linhas.slice(0, 3);
  const demais = linhas.slice(3);
  const maximo = Math.max(linhas[0]?.acordos ?? 0, 1);
  const totalAcordos = linhas.reduce((s, l) => s + l.acordos, 0);
  const acordosDoSetor = aba.linhas.reduce((s, l) => s + l.acordos, 0);
  const qtdEquipes = rankingEquipes.filter(e => e.equipeId != null).length;
  const nomeFiltro = chips.find(c => c.id === equipeFiltro)?.nome ?? null;
  const minhaEquipeId = destacarOperadorId ? equipeDe[destacarOperadorId] ?? null : null;
  // Com a equipe já escolhida, repetir o nome dela em cada linha é ruído.
  const mostrarEquipeNaLinha = temEquipes && equipeFiltro === TODAS;

  return (
    <Card className="border-border overflow-hidden">
      <CardContent className="p-0">
        {/* ── Cabeçalho: sempre visível, é ele que abre e fecha ── */}
        <button
          type="button"
          onClick={recolhivel ? alternar : undefined}
          aria-expanded={recolhivel ? aberto : undefined}
          className={cn(
            'w-full flex items-center gap-2 px-4 py-3 text-left transition-colors',
            recolhivel ? 'hover:bg-accent/20' : 'cursor-default',
          )}
        >
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-500/25 to-orange-600/10 border border-amber-500/30 flex items-center justify-center shrink-0">
            <Trophy className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-xs font-bold text-foreground truncate">
              Ranking Pix Automático · {aba.nome}
              {modo === 'operadores' && nomeFiltro && <> · {nomeFiltro}</>}
            </h3>
            <p className="text-[10.5px] text-muted-foreground">
              {modo === 'equipes' ? (
                <>
                  {qtdEquipes} equipe{qtdEquipes !== 1 ? 's' : ''} · {acordosDoSetor} acordo
                  {acordosDoSetor !== 1 ? 's' : ''} no mês
                </>
              ) : (
                <>
                  {linhas.length} operador{linhas.length !== 1 ? 'es' : ''} · {totalAcordos} acordo
                  {totalAcordos !== 1 ? 's' : ''} no mês
                </>
              )}
            </p>
          </div>
          {recolhivel && (
            <>
              <span className="text-[10.5px] text-muted-foreground inline-flex items-center gap-1 shrink-0">
                {aberto ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                {aberto ? 'Ocultar' : 'Mostrar'}
              </span>
              <ChevronDown className={cn('w-4 h-4 text-muted-foreground shrink-0 transition-transform',
                aberto && 'rotate-180')} />
            </>
          )}
        </button>

        <AnimatePresence initial={false}>
          {aberto && (
            <motion.div
              key="corpo"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22 }}
              className="overflow-hidden"
            >
              <div className="border-t border-border/60">
                {/* ── Abas de setor: só quando há mais de um a oferecer ── */}
                {abas.length > 1 && (
                  <div
                    role="tablist"
                    aria-label="Setor do ranking"
                    className="flex gap-1 overflow-x-auto border-b border-border/60 px-3 pt-2"
                  >
                    {abas.map(a => (
                      <button
                        key={a.setorId}
                        role="tab"
                        aria-selected={a.setorId === aba.setorId}
                        onClick={() => escolherSetor(a.setorId)}
                        className={cn(
                          'shrink-0 rounded-t-lg border-b-2 px-3 py-1.5 text-[11px] font-semibold transition-colors',
                          a.setorId === aba.setorId
                            ? 'border-amber-500 text-foreground'
                            : 'border-transparent text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {a.nome}
                      </button>
                    ))}
                  </div>
                )}

                {/* ── Modo e equipes: só quando o setor tem equipe ── */}
                {temEquipes && (
                  <div className="flex flex-col gap-2 border-b border-border/60 px-3 py-2 sm:flex-row sm:items-center">
                    <div role="tablist" aria-label="Ranking por"
                      className="inline-flex shrink-0 self-start rounded-lg border border-border bg-muted/30 p-0.5">
                      {([
                        ['operadores', 'Operadores', User],
                        ['equipes', 'Equipes', Users],
                      ] as const).map(([m, rotulo, Icone]) => (
                        <button
                          key={m}
                          type="button"
                          role="tab"
                          aria-selected={modo === m}
                          onClick={() => escolherModo(m)}
                          className={cn(
                            'inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors',
                            modo === m ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                          )}
                        >
                          <Icone className="h-3 w-3" /> {rotulo}
                        </button>
                      ))}
                    </div>

                    {modo === 'operadores' && (
                      <div role="radiogroup" aria-label="Equipe do ranking"
                        className="-mx-1 flex min-w-0 gap-1 overflow-x-auto px-1 pb-0.5">
                        {[{ id: TODAS, nome: 'Todas as equipes' }, ...chips].map(c => {
                          const ativa = c.id === equipeFiltro;
                          return (
                            <button
                              key={c.id || 'todas'}
                              type="button"
                              role="radio"
                              aria-checked={ativa}
                              onClick={() => escolherEquipe(c.id)}
                              className={cn(
                                'shrink-0 rounded-full border px-2.5 py-0.5 text-[10.5px] font-medium transition-colors',
                                ativa
                                  ? 'border-amber-500/60 bg-amber-500/15 text-foreground'
                                  : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground',
                                c.id === SEM_EQUIPE && !ativa && 'italic',
                              )}
                            >
                              {c.nome}
                              {c.id !== TODAS && c.id === minhaEquipeId && (
                                <span className="ml-1 text-[9px] font-bold text-primary">• sua</span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {modo === 'equipes' ? (
                  <PixRankingEquipes
                    linhas={rankingEquipes}
                    ordem={ordem}
                    onOrdem={escolherOrdem}
                    onAbrirEquipe={abrirEquipe}
                    minhaEquipeId={minhaEquipeId}
                  />
                ) : linhas.length === 0 ? (
                  <p className="px-4 py-8 text-center text-[11px] text-muted-foreground">
                    Nenhum acordo Pix desta equipe no mês.
                  </p>
                ) : (<>
                {/* ── Pódio: o 1º é mais largo e mais alto que os outros dois ── */}
                <div className="grid grid-cols-1 gap-2.5 p-3 sm:grid-cols-[1.4fr_1fr_1fr] sm:items-end">
                  {podio.map((l, i) => {
                    const pos = i + 1;
                    const cor = PODIO[pos];
                    const ehLider = pos === 1;
                    const ehVoce = destacarOperadorId != null && l.operadorId === destacarOperadorId;
                    return (
                      <motion.div
                        key={l.operadorId}
                        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05, duration: 0.25 }}
                        className={cn(
                          'flex flex-col gap-2 rounded-xl border',
                          ehLider ? 'p-3.5 sm:gap-2.5' : 'p-2.5',
                          cor.cartao,
                          ehVoce && 'ring-1 ring-primary/50',
                        )}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <AvatarParticipante
                            nome={l.nome}
                            fotoUrl={fotoPorOperador?.[l.operadorId] ?? null}
                            /* `border-0`: o aro colorido do lugar já contorna a
                               foto, e a borda cinza padrão do avatar viraria um
                               segundo contorno por dentro dele. */
                            className={cn(
                              'shrink-0 border-0',
                              ehLider ? 'h-10 w-10 text-sm' : 'h-8 w-8 text-xs',
                              cor.anel,
                            )}
                          />
                          <div className="min-w-0 flex-1">
                            <p className={cn(
                              'flex items-center gap-1 font-semibold text-foreground',
                              ehLider ? 'text-sm' : 'text-xs',
                            )}>
                              {ehLider
                                ? <Crown className="h-3.5 w-3.5 shrink-0 text-amber-500 dark:text-amber-300" />
                                : <Medal className={cn('h-3 w-3 shrink-0', cor.texto)} />}
                              <span className="truncate">{l.nome}</span>
                            </p>
                            <p className={cn('truncate text-[10px] font-bold uppercase tracking-wide', cor.texto)}>
                              {pos}º lugar
                              {mostrarEquipeNaLinha && nomeDaEquipe(l.operadorId) && (
                                <span className="font-medium normal-case tracking-normal text-muted-foreground">
                                  {' · '}{nomeDaEquipe(l.operadorId)}
                                </span>
                              )}
                            </p>
                          </div>
                          {l.requisitoAcordosOk && <SeloAcordos />}
                          {ehVoce && (
                            <Badge variant="outline" className="shrink-0 border-primary/40 px-1 py-0 text-[9px] text-primary">
                              você
                            </Badge>
                          )}
                        </div>

                        <div className="flex items-baseline gap-1.5">
                          <span className={cn(
                            'font-mono font-bold leading-none',
                            ehLider ? 'text-3xl' : 'text-xl',
                            cor.texto,
                          )}>
                            {l.acordos}
                          </span>
                          <span className="text-[10.5px] text-muted-foreground">acordos</span>
                        </div>

                        <div className={cn(
                          'overflow-hidden rounded-full bg-muted',
                          ehLider ? 'h-2' : 'h-1.5',
                        )}>
                          <motion.div
                            className={cn('h-full rounded-full', cor.barra)}
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.round((l.acordos / maximo) * 100)}%` }}
                            transition={{ delay: 0.1 + i * 0.05, duration: 0.5 }}
                          />
                        </div>

                        <div className="flex items-center justify-between text-[10.5px] tabular-nums">
                          <span className="text-muted-foreground">{formatCurrency(l.valor)}</span>
                          <span className="font-mono font-semibold text-primary">
                            {formatCurrency(l.comissao)}
                          </span>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>

                {/* ── Do 4º em diante: lista compacta ── */}
                {demais.length > 0 && (
                  <div className="border-t border-border/60 divide-y divide-border/30">
                    {demais.map((l, i) => {
                      const pos = i + 4;
                      const ehVoce = destacarOperadorId != null && l.operadorId === destacarOperadorId;
                      return (
                        <motion.div
                          key={l.operadorId}
                          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                          transition={{ delay: Math.min(i * 0.015, 0.25), duration: 0.2 }}
                          className={cn(
                            'flex items-center gap-3 px-4 py-2 hover:bg-accent/20 transition-colors',
                            ehVoce && 'bg-primary/[0.07]',
                          )}
                        >
                          <span className="w-6 text-[10.5px] font-bold text-muted-foreground tabular-nums shrink-0">
                            {pos}º
                          </span>
                          <span className="text-xs text-foreground/90 truncate flex-1 min-w-0">
                            {l.nome}
                            {mostrarEquipeNaLinha && nomeDaEquipe(l.operadorId) && (
                              <span className="hidden text-[10px] text-muted-foreground sm:inline">
                                {' · '}{nomeDaEquipe(l.operadorId)}
                              </span>
                            )}
                          </span>
                          {l.requisitoAcordosOk && <SeloAcordos />}
                          {ehVoce && (
                            <Badge variant="outline" className="text-[9px] px-1 py-0 border-primary/40 text-primary shrink-0">
                              você
                            </Badge>
                          )}
                          <div className="hidden sm:block w-24 h-1 rounded-full bg-muted overflow-hidden shrink-0">
                            <div className="h-full rounded-full bg-primary/60"
                              style={{ width: `${Math.round((l.acordos / maximo) * 100)}%` }} />
                          </div>
                          <span className="w-8 text-right text-xs font-mono font-bold text-foreground shrink-0">
                            {l.acordos}
                          </span>
                          <span className="w-24 text-right text-[10.5px] font-mono text-muted-foreground shrink-0 hidden sm:inline">
                            {formatCurrency(l.valor)}
                          </span>
                          <span className="w-20 text-right text-[10.5px] font-mono font-semibold text-primary shrink-0">
                            {formatCurrency(l.comissao)}
                          </span>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
                </>)}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}
