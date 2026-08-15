/**
 * DesempenhoDia — o painel do dia, versão 2.0.
 *
 * Substitui `PainelDesempenhoDiario`, que era uma grade de seis a oito cards de
 * peso visual idêntico: nada se destacava, e a resposta que a pessoa abriu o
 * painel para ver disputava atenção com cinco números secundários.
 *
 * Agora são três faixas, separadas por PERGUNTA — e cada uma diz de onde vem o
 * seu número:
 *
 *   A · quanto entrou      analitico_recebimentos (o ERP)
 *   B · como vai meu dia   acordos (a tabulação)
 *   C · contexto           só o que existe hoje
 *
 * ## Por que continua flutuante
 *
 * O painel é consultado NO MEIO de outra tarefa — conferindo uma lista, editando
 * um acordo. Virar página faria perder o lugar, e o custo de voltar é maior que
 * o de ler. Ele abre por cima e fecha no `Esc`.
 *
 * ## Teclado
 *
 * `←` `→` andam de dia, `Esc` fecha. A versão 1.0 só tinha botões, e trocar três
 * dias exigia três miras com o mouse num alvo de 28 pixels.
 */

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  BarChart2, RefreshCw, X, Users, ChevronLeft, ChevronRight, CalendarDays,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresaTags } from '@/hooks/useEmpresaTags';
import { useDiretoExtraConfig } from '@/hooks/useDiretoExtraConfig';
import { useDesempenhoDia } from '@/hooks/useDesempenhoDia';
import { useTenant } from '@/lib/tenant-config';
import { DatePickerField } from '@/components/DatePickerField';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { getTodayISO } from '@/lib/index';
import { lerUnidade, gravarUnidade, type UnidadeValor } from '@/lib/unidadeValor';
import { cn } from '@/lib/utils';
import type { Perfil } from '@/lib/supabase';
import { FaixaDinheiro } from './FaixaDinheiro';
import { FaixaOperacao } from './FaixaOperacao';
import { FaixaContexto } from './FaixaContexto';

interface DesempenhoDiaProps {
  aberto: boolean;
  onClose: () => void;
}

/** Anda `delta` dias a partir de uma data ISO. */
function deslocarDia(iso: string, delta: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const alvo = new Date(y, m - 1, d + delta);
  return `${alvo.getFullYear()}-${String(alvo.getMonth() + 1).padStart(2, '0')}-${String(alvo.getDate()).padStart(2, '0')}`;
}

export function DesempenhoDia({ aberto, onClose }: DesempenhoDiaProps) {
  const { perfil } = useAuth();
  const { tags } = useEmpresaTags();
  const tenant = useTenant();
  const { isAtivoParaUsuario } = useDiretoExtraConfig();
  const semMovimento = useReducedMotion();

  const [dia, setDia] = useState(getTodayISO());
  const [equipeId, setEquipeId] = useState<string | null>(null);
  const [unidade, setUnidade] = useState<UnidadeValor>(() => lerUnidade(perfil?.id));

  const ehHoje = dia === getTodayISO();

  const temLogicaDiretoExtra = tenant.isPaguePlay && isAtivoParaUsuario(
    perfil?.id ?? '',
    perfil?.setor_id ?? null,
    (perfil as (Perfil & { equipe_id?: string | null }) | null)?.equipe_id ?? null,
  );

  const dados = useDesempenhoDia({
    aberto,
    dia,
    equipeId,
    unidade,
    temLogicaDiretoExtra,
    isPaguePlay: tenant.isPaguePlay,
    tags,
  });

  const trocarUnidade = useCallback((u: UnidadeValor) => {
    setUnidade(u);
    gravarUnidade(perfil?.id, u);
  }, [perfil?.id]);

  const andar = useCallback((delta: number) => {
    setDia(atual => {
      const proximo = deslocarDia(atual, delta);
      // O futuro não tem desempenho: o dia seguinte a hoje não existe como
      // resposta, e deixar avançar mostraria zeros que parecem dado real.
      return proximo > getTodayISO() ? atual : proximo;
    });
  }, []);

  // ── Teclado ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!aberto) return;

    function aoPressionar(e: KeyboardEvent) {
      // Não sequestra as setas de quem está digitando numa caixa de texto ou
      // navegando num select — o painel tem os dois.
      const alvo = e.target as HTMLElement | null;
      const digitando = alvo?.tagName === 'INPUT'
        || alvo?.tagName === 'TEXTAREA'
        || alvo?.getAttribute('role') === 'combobox'
        || alvo?.isContentEditable;

      if (e.key === 'Escape') { onClose(); return; }
      if (digitando) return;
      if (e.key === 'ArrowLeft')  { e.preventDefault(); andar(-1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); andar(1); }
    }

    window.addEventListener('keydown', aoPressionar);
    return () => window.removeEventListener('keydown', aoPressionar);
  }, [aberto, onClose, andar]);

  /** Entrada escalonada por faixa. Com movimento reduzido, tudo aparece junto. */
  const faixa = (indice: number) => (semMovimento ? {} : {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    transition: { delay: 0.06 + indice * 0.05, duration: 0.25 },
  });

  return (
    <AnimatePresence>
      {aberto && (
        <>
          {/*
            O desfoque voltou, agora em camada promovida — ver `.veu-desfocado`
            em `index.css` para o porquê de cada propriedade.

            Ele nunca foi a causa principal do engasgo: era um de cinco itens, e
            o que pesava de verdade era o hook consultar 15 dias de analítico em
            toda página com o painel fechado. Corrigido aquilo, um desfoque de
            2px numa camada própria cabe no orçamento do quadro.

            Se um dia voltar a pesar, trocar a classe por `bg-black/30` puro
            resolve numa linha — e é só isso que se perde.
          */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="veu-desfocado fixed inset-0 z-30 bg-black/25"
            onClick={onClose}
          />

          <motion.div
            role="dialog"
            aria-label="Desempenho do dia"
            initial={semMovimento ? { opacity: 0 } : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            // Saída mais rápida que a entrada: fechar deve parecer imediato.
            exit={semMovimento ? { opacity: 0 } : { opacity: 0, y: 10 }}
            // Só `y` e `opacity`. O `scale` que havia aqui obrigava o navegador a
            // rasterizar de novo, a cada quadro, um painel de 420px com sombra
            // grande e cantos arredondados — caro, e imperceptível ao lado do
            // deslizamento.
            transition={{ type: 'spring', stiffness: 400, damping: 34, mass: 0.7 }}
            style={{ willChange: 'transform, opacity' }}
            className={cn(
              'fixed bottom-4 left-4 z-40 flex max-h-[85vh] w-[420px] max-w-[calc(100vw-2rem)]',
              'flex-col overflow-hidden rounded-2xl border border-border/80 bg-card shadow-xl',
            )}
          >
            {/* ── Cabeçalho ── */}
            <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-violet-500/10">
                  <BarChart2 className="h-4 w-4 text-violet-500" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold leading-none">Desempenho do Dia</p>
                  {/*
                    O escopo é dito, não escolhido. Ele sai do cargo — equipe
                    para líder, setor para gerência — e a regra inteira mora em
                    `resolverEscopoDoDia`.
                  */}
                  <p className="mt-1 flex items-center gap-1 truncate text-[11px] leading-none text-muted-foreground">
                    <Users className="h-3 w-3 shrink-0" />
                    {dados.escopoRotulo || '—'}
                  </p>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                <Button
                  variant="ghost" size="icon" className="h-7 w-7 rounded-lg"
                  onClick={() => void dados.refetch()}
                  disabled={dados.carregando}
                  title="Atualizar"
                >
                  <RefreshCw className={cn(
                    'h-3.5 w-3.5 text-muted-foreground',
                    dados.carregando && 'animate-spin',
                  )} />
                </Button>
                <Button
                  variant="ghost" size="icon" className="h-7 w-7 rounded-lg"
                  onClick={onClose}
                  title="Fechar (Esc)"
                >
                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </div>
            </header>

            {/* ── Controles ── */}
            {/*
              Data e, para quem alcança mais de uma, equipe. O seletor de PESSOA
              que havia aqui não volta: obrigava a responder «o dia de quem?»
              toda vez, para uma resposta quase sempre igual, e quem precisa
              desse recorte tem a aba Analítico.
            */}
            <div className="shrink-0 space-y-2 border-b border-border/60 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline" size="icon" className="h-7 w-7 shrink-0 rounded-lg"
                  onClick={() => andar(-1)} title="Dia anterior (←)"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <div className="flex-1">
                  <DatePickerField value={dia} onChange={setDia} size="sm" />
                </div>
                <Button
                  variant="outline" size="icon" className="h-7 w-7 shrink-0 rounded-lg"
                  onClick={() => andar(1)} disabled={ehHoje} title="Próximo dia (→)"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
                {!ehHoje && (
                  <Button
                    variant="outline" size="sm"
                    className="h-7 shrink-0 gap-1 rounded-lg border-violet-500/30 px-2.5 text-xs text-violet-500 hover:bg-violet-500/10"
                    onClick={() => setDia(getTodayISO())}
                  >
                    <CalendarDays className="h-3 w-3" /> Hoje
                  </Button>
                )}
              </div>

              {/*
                Com uma equipe só não há escolha a fazer, e um seletor de opção
                única é um controle que promete recorte e não entrega.
              */}
              {dados.equipes.length > 1 && (
                <Select
                  value={equipeId ?? '__todas'}
                  onValueChange={v => setEquipeId(v === '__todas' ? null : v)}
                >
                  <SelectTrigger className="h-7 w-full rounded-lg border-border/70 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__todas">Todas as equipes</SelectItem>
                    {dados.equipes.map(e => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.nome}
                        <span className="ml-1.5 text-muted-foreground">
                          · {e.membros.length}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* ── Conteúdo ── */}
            <div className="flex-1 overflow-y-auto px-4 py-3.5">
              <AnimatePresence mode="wait">
                {dados.carregando ? (
                  <motion.div
                    key="carregando"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="space-y-3"
                  >
                    <div className="h-16 animate-pulse rounded-xl bg-muted/30" />
                    <div className="h-24 animate-pulse rounded-xl bg-muted/30" />
                    <div className="h-16 animate-pulse rounded-xl bg-muted/30" />
                  </motion.div>
                ) : (
                  <motion.div
                    key="conteudo"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="space-y-3.5"
                  >
                    <motion.div {...faixa(0)}>
                      <FaixaDinheiro
                        recebido={dados.recebido}
                        recebidoOposto={dados.recebidoOposto}
                        meta={dados.meta}
                        vsOntem={dados.vsOntem}
                        vsMedia={dados.vsMedia}
                        unidade={tenant.isPaguePlay ? unidade : null}
                        onUnidade={trocarUnidade}
                      />
                    </motion.div>

                    <motion.div {...faixa(1)}>
                      <FaixaOperacao
                        estados={dados.barra}
                        formalizados={dados.formalizados}
                        valorPago={dados.valorPagoAcordos}
                      />
                    </motion.div>

                    <motion.div {...faixa(2)}>
                      <FaixaContexto
                        diretoExtra={dados.diretoExtra}
                        pix={dados.pix}
                        tags={dados.tags}
                      />
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <footer className="shrink-0 border-t border-border/60 px-4 py-1.5">
              <p className="text-center text-[10px] text-muted-foreground">
                <kbd className="rounded border border-border px-1">←</kbd>
                {' '}
                <kbd className="rounded border border-border px-1">→</kbd>
                {' muda o dia · '}
                <kbd className="rounded border border-border px-1">Esc</kbd>
                {' fecha'}
              </p>
            </footer>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
