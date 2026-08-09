/**
 * PixRankingSetor.tsx — ranking de Pix automático do setor no mês.
 *
 * Considera o SETOR inteiro (ex.: Receptivo): o líder já carrega apenas os
 * acordos do próprio setor, então o que chega aqui é o recorte certo — o
 * ranking do Receptivo não mistura Play 1 nem Digital.
 *
 * ## O desenho
 *
 * Era uma tabela crua de cinco colunas, em que o 1º lugar tinha exatamente o
 * mesmo peso visual do 9º e nada dizia a distância entre eles. Agora o pódio
 * aparece em destaque (três cartões, com a barra de cada um proporcional ao
 * líder) e o resto vira uma lista compacta — dá para ler quem está na frente
 * sem percorrer números.
 *
 * O ranking também pode ser FECHADO: é informação de acompanhamento, não de
 * operação, e o líder que está conferindo acordo por acordo quer a tabela na
 * tela, não o pódio. A escolha fica guardada no navegador para não ter de ser
 * refeita a cada visita.
 *
 * A ordenação e as somas moram em `rankingPixSetor` (pura, com teste).
 */
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Medal, Zap, ChevronDown, Eye, EyeOff } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/index';
import { cn } from '@/lib/utils';
import type { LinhaRankingPix } from './pixAutomaticoView';

const CHAVE_ABERTO = 'pix-ranking-aberto';

/** Cor de cada lugar do pódio. Do 4º em diante, tudo neutro de propósito. */
const PODIO: Record<number, { chip: string; barra: string; texto: string }> = {
  1: { chip: 'bg-amber-500/15 text-amber-400 border-amber-500/40',  barra: 'bg-amber-400',  texto: 'text-amber-400' },
  2: { chip: 'bg-slate-400/15 text-slate-300 border-slate-400/40',  barra: 'bg-slate-300',  texto: 'text-slate-300' },
  3: { chip: 'bg-orange-600/15 text-orange-400 border-orange-600/40', barra: 'bg-orange-400', texto: 'text-orange-400' },
};

const NEUTRO = { chip: 'bg-muted/40 text-muted-foreground border-border', barra: 'bg-violet-400/70', texto: 'text-foreground' };

export interface PixRankingSetorProps {
  linhas: LinhaRankingPix[];
  /** Nome do setor no cabeçalho. */
  nomeSetor?: string;
  /** Destaca a linha de quem está olhando. */
  destacarOperadorId?: string | null;
}

/** Selo de "cumpriu os 18 acordos" — não afirma que a comissão dobrou. */
function SeloAcordos() {
  return (
    <span
      title="Cumpriu o requisito de 18 acordos Pix no mês (a dobra exige também a meta do mês)"
      className="shrink-0 inline-flex items-center gap-0.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-1 py-0.5 text-[9px] font-bold text-amber-400"
    >
      <Zap className="w-2.5 h-2.5" /> 18
    </span>
  );
}

export function PixRankingSetor({ linhas, nomeSetor, destacarOperadorId }: PixRankingSetorProps) {
  // Leitura e escrita protegidas: `localStorage` estoura em navegação privada de
  // alguns navegadores, e um ranking recolhível não pode derrubar a aba inteira.
  const [aberto, setAberto] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(CHAVE_ABERTO) !== 'nao';
    } catch {
      return true;
    }
  });

  function alternar() {
    setAberto(a => {
      try { window.localStorage.setItem(CHAVE_ABERTO, a ? 'nao' : 'sim'); } catch { /* modo privado */ }
      return !a;
    });
  }

  if (linhas.length === 0) return null;

  const lider   = linhas[0];
  const podio   = linhas.slice(0, 3);
  const demais  = linhas.slice(3);
  const maximo  = Math.max(lider.acordos, 1);
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
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-600/10 border border-amber-500/25 flex items-center justify-center shrink-0">
            <Trophy className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-xs font-bold text-foreground truncate">
              Ranking Pix Automático{nomeSetor ? ` · ${nomeSetor}` : ''}
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
                {/* ── Pódio ── */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 p-3">
                  {podio.map((l, i) => {
                    const pos  = i + 1;
                    const cor  = PODIO[pos] ?? NEUTRO;
                    const ehVoce = destacarOperadorId != null && l.operadorId === destacarOperadorId;
                    return (
                      <motion.div
                        key={l.operadorId}
                        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05, duration: 0.25 }}
                        className={cn(
                          'rounded-xl border p-3 flex flex-col gap-2',
                          ehVoce ? 'border-violet-500/40 bg-violet-500/[0.07]' : 'border-border bg-muted/20',
                        )}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={cn(
                            'w-6 h-6 rounded-lg border flex items-center justify-center shrink-0',
                            cor.chip,
                          )}>
                            <Medal className="w-3 h-3" />
                          </span>
                          <span className="text-xs font-semibold text-foreground truncate flex-1">{l.nome}</span>
                          {l.requisitoAcordosOk && <SeloAcordos />}
                          {ehVoce && (
                            <Badge variant="outline" className="text-[9px] px-1 py-0 border-violet-500/40 text-violet-400 shrink-0">
                              você
                            </Badge>
                          )}
                        </div>

                        <div className="flex items-baseline gap-1.5">
                          <span className={cn('text-xl font-mono font-bold leading-none', cor.texto)}>
                            {l.acordos}
                          </span>
                          <span className="text-[10.5px] text-muted-foreground">acordos</span>
                        </div>

                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div className={cn('h-full rounded-full transition-all duration-500', cor.barra)}
                            style={{ width: `${Math.round((l.acordos / maximo) * 100)}%` }} />
                        </div>

                        <div className="flex items-center justify-between text-[10.5px] tabular-nums">
                          <span className="text-muted-foreground">{formatCurrency(l.valor)}</span>
                          <span className="font-mono font-semibold text-violet-400">{formatCurrency(l.comissao)}</span>
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
                            <Badge variant="outline" className="text-[9px] px-1 py-0 border-violet-500/40 text-violet-400 shrink-0">
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
                          <span className="w-20 text-right text-[10.5px] font-mono font-semibold text-violet-400 shrink-0">
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
