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
 * O card pode ser FECHADO: é informação de acompanhamento, não de operação, e
 * o líder que confere acordo por acordo quer a tabela na tela. A escolha — e a
 * aba — ficam guardadas no navegador para não serem refeitas a cada visita.
 *
 * A ordenação e as somas moram em `rankingPixSetor` (pura, com teste).
 */
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Crown, Medal, Zap, ChevronDown, Eye, EyeOff } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/index';
import { cn } from '@/lib/utils';
import type { LinhaRankingPix } from './pixAutomaticoView';

const CHAVE_ABERTO = 'pix-ranking-aberto';
const CHAVE_SETOR  = 'pix-ranking-setor';

/** Lê `localStorage` sem derrubar a aba na navegação privada. */
function lido(chave: string): string | null {
  try { return window.localStorage.getItem(chave); } catch { return null; }
}
function grava(chave: string, valor: string): void {
  try { window.localStorage.setItem(chave, valor); } catch { /* modo privado */ }
}

/** Cor de cada lugar do pódio. Do 4º em diante, tudo neutro de propósito. */
const PODIO: Record<number, {
  chip: string; barra: string; texto: string; cartao: string;
}> = {
  1: {
    chip:   'border-amber-500/50 bg-amber-500/20 text-amber-500 dark:text-amber-300',
    barra:  'bg-gradient-to-r from-amber-500 to-amber-300',
    texto:  'text-amber-500 dark:text-amber-300',
    cartao: 'border-amber-500/45 bg-gradient-to-br from-amber-500/[0.14] to-amber-500/[0.03] shadow-[0_0_28px_-12px_rgb(245_158_11_/_0.55)]',
  },
  2: {
    chip:   'border-slate-400/45 bg-slate-400/15 text-slate-500 dark:text-slate-300',
    barra:  'bg-slate-400',
    texto:  'text-slate-500 dark:text-slate-300',
    cartao: 'border-slate-400/30 bg-slate-400/[0.06]',
  },
  3: {
    chip:   'border-orange-600/45 bg-orange-600/15 text-orange-600 dark:text-orange-400',
    barra:  'bg-orange-500',
    texto:  'text-orange-600 dark:text-orange-400',
    cartao: 'border-orange-600/30 bg-orange-600/[0.06]',
  },
};

/** Um setor e o ranking dele, já calculado por quem chama. */
export interface AbaRankingPix {
  setorId: string;
  nome: string;
  linhas: LinhaRankingPix[];
}

export interface PixRankingSetorProps {
  /** Um item por setor. Nunca contém uma aba «todos» — ver o cabeçalho. */
  abas: AbaRankingPix[];
  /** Aba em que o card abre na primeira visita. Normalmente o próprio setor. */
  setorInicial?: string | null;
  /** Destaca a linha de quem está olhando. */
  destacarOperadorId?: string | null;
}

/** 'Ana Paula Souza' → 'AS'. Só para o disco de identidade do pódio. */
function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '—';
  const primeira = partes[0][0] ?? '';
  const ultima   = partes.length > 1 ? (partes[partes.length - 1][0] ?? '') : '';
  return (primeira + ultima).toUpperCase();
}

/** Selo de "cumpriu os 18 acordos" — não afirma que a comissão dobrou. */
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
  abas, setorInicial, destacarOperadorId,
}: PixRankingSetorProps) {
  const [aberto, setAberto] = useState<boolean>(() => lido(CHAVE_ABERTO) !== 'nao');

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

  const aba = abas.find(a => a.setorId === ativo) ?? abas[0];
  if (!aba || aba.linhas.length === 0) return null;

  const { linhas } = aba;
  const podio  = linhas.slice(0, 3);
  const demais = linhas.slice(3);
  const maximo = Math.max(linhas[0].acordos, 1);
  const totalAcordos = linhas.reduce((s, l) => s + l.acordos, 0);

  return (
    <Card className="border-border overflow-hidden">
      <CardContent className="p-0">
        {/* ── Cabeçalho: sempre visível, é ele que abre e fecha ── */}
        <button
          onClick={alternar}
          aria-expanded={aberto}
          className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-accent/20 transition-colors"
        >
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-500/25 to-orange-600/10 border border-amber-500/30 flex items-center justify-center shrink-0">
            <Trophy className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-xs font-bold text-foreground truncate">
              Ranking Pix Automático · {aba.nome}
            </h3>
            <p className="text-[10.5px] text-muted-foreground">
              {linhas.length} operador{linhas.length !== 1 ? 'es' : ''} · {totalAcordos} acordo
              {totalAcordos !== 1 ? 's' : ''} no mês
            </p>
          </div>
          <span className="text-[10.5px] text-muted-foreground inline-flex items-center gap-1 shrink-0">
            {aberto ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            {aberto ? 'Ocultar' : 'Mostrar'}
          </span>
          <ChevronDown className={cn('w-4 h-4 text-muted-foreground shrink-0 transition-transform',
            aberto && 'rotate-180')} />
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
                        <span className="ml-1.5 tabular-nums text-[10px] text-muted-foreground/70">
                          {a.linhas.length}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

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
                          ehVoce && 'ring-1 ring-violet-500/50',
                        )}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={cn(
                            'flex shrink-0 items-center justify-center rounded-lg border font-bold tabular-nums',
                            ehLider ? 'h-9 w-9 text-xs' : 'h-7 w-7 text-[10px]',
                            cor.chip,
                          )}>
                            {iniciais(l.nome)}
                          </span>
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
                            <p className={cn('text-[10px] font-bold uppercase tracking-wide', cor.texto)}>
                              {pos}º lugar
                            </p>
                          </div>
                          {l.requisitoAcordosOk && <SeloAcordos />}
                          {ehVoce && (
                            <Badge variant="outline" className="shrink-0 border-violet-500/40 px-1 py-0 text-[9px] text-violet-500 dark:text-violet-400">
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
                          <span className="font-mono font-semibold text-violet-500 dark:text-violet-400">
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
                            ehVoce && 'bg-violet-500/[0.07]',
                          )}
                        >
                          <span className="w-6 text-[10.5px] font-bold text-muted-foreground tabular-nums shrink-0">
                            {pos}º
                          </span>
                          <span className="text-xs text-foreground/90 truncate flex-1 min-w-0">{l.nome}</span>
                          {l.requisitoAcordosOk && <SeloAcordos />}
                          {ehVoce && (
                            <Badge variant="outline" className="text-[9px] px-1 py-0 border-violet-500/40 text-violet-500 dark:text-violet-400 shrink-0">
                              você
                            </Badge>
                          )}
                          <div className="hidden sm:block w-24 h-1 rounded-full bg-muted overflow-hidden shrink-0">
                            <div className="h-full rounded-full bg-violet-400/70"
                              style={{ width: `${Math.round((l.acordos / maximo) * 100)}%` }} />
                          </div>
                          <span className="w-8 text-right text-xs font-mono font-bold text-foreground shrink-0">
                            {l.acordos}
                          </span>
                          <span className="w-24 text-right text-[10.5px] font-mono text-muted-foreground shrink-0 hidden sm:inline">
                            {formatCurrency(l.valor)}
                          </span>
                          <span className="w-20 text-right text-[10.5px] font-mono font-semibold text-violet-500 dark:text-violet-400 shrink-0">
                            {formatCurrency(l.comissao)}
                          </span>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}
