/**
 * pages/Acordos/PixAutomatico.tsx — a tela "Pix Automático" (BookPlay)
 * ─────────────────────────────────────────────────────────────────────────
 * Desde 16/10/2026 é tela própria no menu (`/pix-automatico`, ver
 * `pages/PixAutomatico`), dividida em sub-abas — Registros, NRs divergentes,
 * Premiação dobrada e Ranking. O porquê está em `PixSubAbas`.
 *
 * Acompanhamento de comissão de acordos fechados no Pix automático, SEM
 * vínculo com a tabela `acordos`.
 *
 * Operador: registra NR + valor (nasce pendente) — se o registro manual do
 * setor estiver LIGADO —, vê os próprios registros, a comissão por linha,
 * totais pendente/aprovado e o card de bônus por meta (comissão aprovada do
 * mês é paga de novo se bater a meta; estado do card segue meta + quartis).
 * Líder+: vê tudo, filtra por operador/equipe (e por setor para gerência+),
 * aprova/desaprova, registra vinculando a um operador, e configura o setor:
 * % de comissão (com confirmação) e interruptor do registro manual.
 * Cada NR só pode ter UM registro vivo por empresa, em qualquer status; excluir
 * a linha libera o NR (migration 20260811c). Todo movimento — registro, edição,
 * avaliação, pagamento, exclusão e restauração — vai para `pix_automatico_log`,
 * que o botão "Histórico" mostra.
 *
 * ## A aba segue o mês do sistema
 *
 * Todas as contas daqui — dobra, ranking, meta por equipe, premiação — são "no
 * mês". Até 01/09/2026 esse mês era `mesAtual()` fixo, em sete lugares: virou
 * setembro e a meta de agosto sumiu da tela (continuava no banco, só ninguém
 * pedia por ela), o card de comissão dobrada desapareceu para quem ainda não
 * tinha acordo no mês novo, e a premiação de agosto ficou inalcançável.
 *
 * Agora o mês vem do `MesProvider`, o mesmo do Dashboard e do Analítico. Olhar
 * agosto aqui mostra agosto inteiro — e continua sendo possível registrar,
 * editar e avaliar ali, porque o Pix é conferência de comissão e ela não fecha
 * junto com o mês do relatório. O que muda é que o registro lançado com agosto
 * na tela nasce COM DATA DE AGOSTO (ver `dia` em `criarAcordoPix`).
 */
import { AlertTriangle, ArrowRight, ListChecks, Medal, ShieldAlert, ShieldCheck, Trophy } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { formatCurrency } from '@/lib/index';
import { rotuloDoMes } from '@/lib/mesReferencia';
import { PixBarraSetores } from './PixBarraSetores';
import { PixSubAbas, type OpcaoSubAbaPix } from './PixSubAbas';
import { usePixAutomatico } from './usePixAutomatico';
import { TODOS_SETORES } from './pixTelaComum';
import { PixCabecalho } from './PixCabecalho';
import { PixAbaRegistros } from './PixAbaRegistros';
import { PixAbaDivergencias } from './PixAbaDivergencias';
import { PixAbaPremiacao } from './PixAbaPremiacao';
import { PixAbaRanking } from './PixAbaRanking';

export function PixAutomatico() {
  const pix = usePixAutomatico();
  const {
    loading, mes, noMesAtual, doRetrato, podeVerDeOutros, podeVerTodosSetores, setoresDoFiltro,
    setorFoco, setFiltroSetor, resumoPorSetor, pedidosSemSetor, subAba, trocarSubAba,
    totais, divergenciasAbertas, resumoPremiacao, pedidosNr, acordosSemPix,
  } = pix;

  const opcoesSubAba: OpcaoSubAbaPix[] = [
    {
      key: 'registros', label: 'Registros', Icon: ListChecks,
      resumo: loading
        ? 'Carregando…'
        : `${totais.pendente.qtd} pendente${totais.pendente.qtd !== 1 ? 's' : ''} · ${totais.aprovado.qtd} aprovado${totais.aprovado.qtd !== 1 ? 's' : ''}`,
    },
    {
      key: 'divergencias', label: 'NRs divergentes', Icon: divergenciasAbertas > 0 ? ShieldAlert : ShieldCheck,
      resumo: divergenciasAbertas > 0
        ? `${divergenciasAbertas} ${divergenciasAbertas === 1 ? 'pendência' : 'pendências'} a resolver`
        : 'Nada divergente',
      contador: divergenciasAbertas,
      alerta: divergenciasAbertas > 0,
    },
    // Premiação e Ranking só para quem vê o Pix dos outros: a comissão dobrada
    // do operador fica em Registros (16/10/2026).
    ...(podeVerDeOutros ? [{
      key: 'premiacao' as const, label: 'Premiação dobrada', Icon: Trophy,
      resumo: !resumoPremiacao || resumoPremiacao.pessoas === 0
        ? 'Ninguém dobrou ainda'
        : resumoPremiacao.falta >= 0.005
          ? `${formatCurrency(resumoPremiacao.falta)} a pagar`
          : 'Tudo quitado',
      contador: resumoPremiacao?.aPagar ?? 0,
    }, {
      key: 'ranking' as const, label: 'Ranking', Icon: Medal,
      resumo: 'Pódio do setor no mês',
    }] : []),
  ];

  return (
    <div className="space-y-4">
      <PixCabecalho pix={pix} />

      {/* ── O setor em foco ──
          Governa painéis, fila de NRs e tabela de uma vez. Fica no TOPO porque
          é navegação, não refinamento — escondido na barra de filtros da tabela,
          era invisível justamente para o que ele mais rege. */}
      {podeVerTodosSetores && (
        <PixBarraSetores
          setores={setoresDoFiltro}
          setorFoco={setorFoco}
          onEscolher={id => setFiltroSetor(id ?? TODOS_SETORES)}
          resumo={resumoPorSetor}
          pedidosSemSetor={pedidosSemSetor}
        />
      )}

      {/* ── Fora do mês corrente: a tela inteira mudou de assunto ──
          O Pix continua editável em mês passado de propósito: ele é conferência
          de comissão, e ela costuma fechar depois da virada. O que não pode é
          alguém lançar achando que está lançando em hoje. */}
      {!noMesAtual && (
        <Card className="border-amber-500/30 bg-amber-500/[0.06]">
          <CardContent className="p-3 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-700 dark:text-amber-500 shrink-0 mt-0.5" />
            <div className="min-w-0 space-y-0.5">
              <p className="text-xs font-semibold text-foreground">
                Você está vendo {rotuloDoMes(mes)}
              </p>
              <p className="text-[11px] text-muted-foreground">
                Lista, metas, comissão dobrada, ranking e premiação são deste mês.
                Registrar e avaliar continua liberado — o acordo novo entra com a
                data escolhida no formulário, dentro de {rotuloDoMes(mes)}.
              </p>
              {/* Sem esta frase, quem vê uma equipe com o nome antigo — ou
                  alguém numa equipe de que já saiu — conclui que a tela está
                  errada, quando é exatamente o contrário. */}
              {doRetrato && (
                <p className="text-[11px] text-muted-foreground">
                  Equipes, setores e quem estava em cada um são os de{' '}
                  {rotuloDoMes(mes)}, congelados no fim daquele mês — não os de
                  hoje. Quem mudou de equipe depois aparece onde estava.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── As sub-abas ── ver `PixSubAbas` */}
      <PixSubAbas abas={opcoesSubAba} ativa={subAba} onTrocar={trocarSubAba} />

      {/* ── A divergência não sai da tela até ser resolvida ──
          Em qualquer outra sub-aba, uma faixa fixa — sem botão de fechar, de
          propósito — leva até a fila. Some sozinha quando a contagem zera. */}
      {!loading && divergenciasAbertas > 0 && subAba !== 'divergencias' && (
        <button
          type="button"
          onClick={() => trocarSubAba('divergencias')}
          className="flex w-full items-center gap-3 rounded-lg border border-warning/40 bg-warning/[0.08] px-4 py-2 text-left transition-colors hover:bg-warning/[0.12]"
        >
          <ShieldAlert className="h-4 w-4 shrink-0 text-warning" />
          <span className="min-w-0 flex-1 text-xs">
            <strong className="text-foreground">
              {divergenciasAbertas} {divergenciasAbertas === 1 ? 'divergência esperando' : 'divergências esperando'} resolução
            </strong>
            <span className="text-muted-foreground">
              {[
                pedidosNr.length > 0
                  ? `${pedidosNr.length} NR${pedidosNr.length !== 1 ? 's' : ''} em disputa`
                  : null,
                acordosSemPix.length > 0
                  ? `${acordosSemPix.length} acordo${acordosSemPix.length !== 1 ? 's' : ''} sem registro no Pix`
                  : null,
              ].filter(Boolean).map(t => ` · ${t}`).join('')}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-1 text-[11px] font-semibold text-warning">
            Resolver <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </button>
      )}

      {/* ════════════════ Sub-aba: Registros ════════════════ */}
      {subAba === 'registros' && <PixAbaRegistros pix={pix} />}

      {/* ════════════════ Sub-aba: NRs divergentes ════════════════
          Tudo o que precisa de ação para o Pix bater com a realidade, na ordem
          de urgência: o NR em disputa (espera decisão de líder), o acordo que
          ficou só na lista de acordos (espera registro) e, para quem pode, a
          correção de valor de um Pix que saiu errado. */}
      {subAba === 'divergencias' && <PixAbaDivergencias pix={pix} />}

      {subAba === 'premiacao' && podeVerDeOutros && <PixAbaPremiacao pix={pix} />}

      {subAba === 'ranking' && podeVerDeOutros && <PixAbaRanking pix={pix} />}
    </div>
  );
}
