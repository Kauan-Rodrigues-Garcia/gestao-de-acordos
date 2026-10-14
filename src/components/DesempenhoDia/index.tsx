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
import { motion, AnimatePresence } from 'framer-motion';
import { useMovimentoPreferido } from '@/hooks/useMovimentoPreferido';
import {
  BarChart2, RefreshCw, X, Users, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useEquipesDoPerfil } from '@/hooks/useEquipesDoPerfil';
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
  const { principal: equipePrincipal } = useEquipesDoPerfil();
  const { tags } = useEmpresaTags();
  const tenant = useTenant();
  const { isAtivoParaUsuario } = useDiretoExtraConfig();
  const { semMovimento } = useMovimentoPreferido();

  const [dia, setDia] = useState(getTodayISO());
  const [equipeId, setEquipeId] = useState<string | null>(null);
  const [unidade, setUnidade] = useState<UnidadeValor>(() => lerUnidade(perfil?.id));

  const ehHoje = dia === getTodayISO();

  const temLogicaDiretoExtra = tenant.isPaguePlay && isAtivoParaUsuario(
    perfil?.id ?? '',
    perfil?.setor_id ?? null,
    equipePrincipal,
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

  /*
   * Esqueleto só na PRIMEIRA carga.
   *
   * `carregando` sobe de novo a cada troca de dia ou de equipe, e trocar o
   * conteúdo pelo esqueleto nessas releituras era metade do salto de altura:
   * a caixa esvaziava e voltava a encher, duas vezes por consulta. Da segunda
   * vez em diante o conteúdo anterior fica no lugar, apagado, até o novo
   * chegar — o botão de atualizar já gira para dizer que há consulta em curso.
   */
  const [jaCarregou, setJaCarregou] = useState(false);
  useEffect(() => { if (!dados.carregando) setJaCarregou(true); }, [dados.carregando]);
  const mostrarEsqueleto = dados.carregando && !jaCarregou;

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

  return (
    <AnimatePresence>
      {aberto && (
        <>
          {/*
            Fundo invisível: só fecha o painel com um clique fora.

            Já foi um véu escuro com desfoque. Em 14/10/2026 saiu a pedido —
            «pequeno e que não trave»: o painel é consultado no meio de outra
            tarefa, e escurecer e borrar a tela inteira para mostrar uma caixa
            pequena era custo de pintura sem ganho de leitura.
          */}
          <div className="fixed inset-0 z-30" onClick={onClose} aria-hidden="true" />

          <motion.div
            role="dialog"
            aria-label="Desempenho do dia"
            initial={semMovimento ? { opacity: 0 } : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            // Curta e sem mola: a mola rodava ~400ms de quadros a cada abertura.
            // Só `y` e `opacity`, que não saem do compositor.
            transition={{ duration: 0.14, ease: 'easeOut' }}
            /*
             * Altura FIXA, e não «a que o conteúdo pedir».
             *
             * O painel é ancorado embaixo (`bottom-4`), então toda mudança de
             * altura empurra o conteúdo para cima: o esqueleto encolhia a caixa,
             * o conteúdo a esticava de volta, e o número que a pessoa estava
             * lendo saltava de lugar a cada consulta.
             *
             * Não existe altura de conteúdo que sirva sempre — as três faixas
             * variam por natureza (meta que existe ou não, tags que são zero ou
             * seis). Com altura fixa a caixa não se mexe nunca, e o que passar
             * dela rola na área de conteúdo, que já é `overflow-y-auto`.
             *
             * O `max-h` continua: em tela baixa ele é quem manda, e aí os dois
             * limites concordam.
             *
             * 360 × 500 desde 14/10/2026 (era 420 × 620): o conteúdo é o mesmo,
             * sem caixas dentro de caixas, e cabe sem rolar num dia comum.
             */
            className={cn(
              'fixed bottom-4 left-4 z-40 flex h-[500px] max-h-[85vh] w-[360px] max-w-[calc(100vw-2rem)]',
              'flex-col overflow-hidden rounded-xl border border-border bg-card shadow-lg',
            )}
          >
            {/* ── Cabeçalho ── */}
            <header className="flex shrink-0 items-center justify-between gap-2 px-3.5 pb-2 pt-3">
              <div className="flex min-w-0 items-center gap-2">
                <BarChart2 className="h-4 w-4 shrink-0 text-violet-500" />
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
            <div className="shrink-0 space-y-2 border-b border-border/60 px-3.5 pb-2.5">
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost" size="icon" className="h-7 w-7 shrink-0 rounded-md"
                  onClick={() => andar(-1)} title="Dia anterior (←)"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="flex-1">
                  <DatePickerField value={dia} onChange={setDia} size="sm" />
                </div>
                <Button
                  variant="ghost" size="icon" className="h-7 w-7 shrink-0 rounded-md"
                  onClick={() => andar(1)} disabled={ehHoje} title="Próximo dia (→)"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                {!ehHoje && (
                  <Button
                    variant="ghost" size="sm"
                    className="h-7 shrink-0 rounded-md px-2 text-xs font-semibold text-violet-500 hover:bg-violet-500/10 hover:text-violet-500"
                    onClick={() => setDia(getTodayISO())}
                  >
                    Hoje
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
            {/*
              Faixas separadas por um fio, não por caixas: três cartões com
              borda dentro de um painel com borda era moldura sobre moldura.

              Sem animação de troca entre esqueleto e conteúdo, nem entrada
              escalonada por faixa — eram quadros a mais em toda troca de dia.
              (Os atalhos ← → Esc ficam nos títulos dos botões.)
            */}
            <div className="flex-1 overflow-y-auto px-3.5">
              {mostrarEsqueleto ? (
                // Do tamanho das faixas de verdade: um esqueleto menor que o
                // conteúdo é a própria troca de altura, em miniatura.
                <div className="space-y-3 py-3">
                  <div className="h-[120px] animate-pulse rounded-lg bg-muted/40" />
                  <div className="h-[96px] animate-pulse rounded-lg bg-muted/40" />
                </div>
              ) : (
                <div
                  className={cn(
                    'divide-y divide-border/60 transition-opacity [&>*]:py-3',
                    // Releitura: o conteúdo antigo fica no lugar, apagado.
                    dados.carregando && 'opacity-50',
                  )}
                >
                  <FaixaDinheiro
                    recebido={dados.recebido}
                    recebidoOposto={dados.recebidoOposto}
                    meta={dados.meta}
                    vsOntem={dados.vsOntem}
                    vsMedia={dados.vsMedia}
                    unidade={tenant.isPaguePlay ? unidade : null}
                    onUnidade={trocarUnidade}
                  />
                  <FaixaOperacao
                    estados={dados.barra}
                    formalizados={dados.formalizados}
                    valorPago={dados.valorPagoAcordos}
                  />
                  <FaixaContexto
                    diretoExtra={dados.diretoExtra}
                    pix={dados.pix}
                    tags={dados.tags}
                  />
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
