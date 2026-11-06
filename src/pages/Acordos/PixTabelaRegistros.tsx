/**
 * PixTabelaRegistros — a lista de registros do mês, com as ações de cada
 * linha (editar, avaliar, pagar, corrigir valor, excluir) e as páginas.
 *
 * A edição em linha e os «processando» de cada botão são estado daqui:
 * digitar o NR novo de uma linha não redesenha o resto da tela.
 */
import { useMemo, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import {
  AlertTriangle, Banknote, Check, Copy, Eraser, Gift, Pencil, RefreshCw, Save, Scale,
  Sparkles, Trash2, Undo2, X, XCircle, Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { LinhaViva } from '@/components/LinhaViva';
import { formatCurrency, parseCurrencyInput } from '@/lib/index';
import { cn } from '@/lib/utils';
import { copiarTexto } from '@/lib/clipboard';
import { ehSoNumeros, propsSoNumeros } from '@/lib/soNumeros';
import { dataLocalPix } from '@/lib/mesPix';
import { useEstadoLembrado } from '@/hooks/useEstadoLembrado';
import {
  PIX_AUTO_PCT_PADRAO, PIX_LINHAS_POR_PAGINA, aplicarSaldoNoAcordo, avaliarAcordoPix,
  comissaoDe, editarAcordoPix, excluirAcordoPix, marcarComissaoPaga, normalizarNr,
  comissaoFixaDaLinha, pctDaLinha, quemJaDecidiuPix, reavaliarAcordoPix, retirarSaldoDoAcordo,
  valorAPagarDe, valorFixoDoSetor,
  type PixAutoAcordo, type PixAutoSaldo,
} from '@/services/pix_automatico.service';
import { textoPrazoExpurgo } from './pixAutomaticoView';
import { fmtPct, SO_MEMORIA, STATUS_INFO } from './pixTelaComum';
import type { PixTela } from './usePixAutomatico';
import { useTemaNatal } from '@/components/Natal/tema';
import { corPixNatal } from '@/components/Natal/pix/corPixNatal';

export function PixTabelaRegistros({ pix }: { pix: PixTela }) {
  /** Natal: Pago dourado e EXTRA vermelho de fita (`Natal/pix/PixNatal.tsx`). */
  const natal = useTemaNatal();
  const {
    perfil, temPermissao, podeAprovar, podeVerDeOutros, podeAgirSobreOutros, podeAjustarSaldo,
    fechamento, nrsBloqueados, itens, visiveis, daPagina, paginaAtual, totalPaginas, setPagina,
    pctPorSetor, saldoPorOperador, selecionados, setSelecionados, quemExclui, loading,
    jaPintouPix, carregar, chaveAba,
  } = pix;
  const [ajustandoId, setAjustandoId] = useState<string | null>(null);
  const [avaliandoId, setAvaliandoId] = useState<string | null>(null);
  // Edição de um registro pendente (dono ou líder+). Lembrada só em memória: a
  // linha aberta e o valor digitado sobrevivem a trocar de sub-aba e voltar,
  // como quando este estado morava na tela (ver `SO_MEMORIA`).
  const [editandoId, setEditandoId]     = useEstadoLembrado<string | null>(`${chaveAba}|edicao|id`, null, SO_MEMORIA);
  const [editNr, setEditNr]             = useEstadoLembrado(`${chaveAba}|edicao|nr`, '', SO_MEMORIA);
  const [editValor, setEditValor]       = useEstadoLembrado(`${chaveAba}|edicao|valor`, '', SO_MEMORIA);
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);

  /** Quanto falta para este desaprovado ser excluído. `null` = sem prazo. */
  function prazoDesaprovado(item: PixAutoAcordo): string | null {
    return textoPrazoExpurgo(item.avaliado_em);
  }

  /**
   * Esta linha pode receber a correção?
   *
   * As três condições são as mesmas que `fn_pix_saldo_aplicar` cobra. Repetir a
   * régra aqui não é desconfiança da RPC: é o que faz o botão sumir em vez de
   * aparecer e devolver erro.
   */
  function saldoAplicavelNa(item: PixAutoAcordo): PixAutoSaldo | null {
    if (!podeAjustarSaldo) return null;
    if (item.status !== 'aprovado' || item.pago) return null;
    if (item.ajuste_valor != null) return null;
    const s = saldoPorOperador[item.operador_id];
    if (!s || s.acordo_id) return null;   // sem saldo, ou já reservado alhures
    return s;
  }

  async function aplicarCorrecao(item: PixAutoAcordo) {
    setAjustandoId(item.id);
    try {
      const { ok, error } = await aplicarSaldoNoAcordo(item.id);
      if (!ok) { toast.error(error ?? 'Não foi possível aplicar a correção.'); return; }
      toast.success('Correção aplicada. Ela some quando este acordo for marcado como pago.');
      await carregar();
    } finally {
      setAjustandoId(null);
    }
  }

  async function retirarCorrecao(item: PixAutoAcordo) {
    setAjustandoId(item.id);
    try {
      const { ok, error } = await retirarSaldoDoAcordo(item.id);
      if (!ok) { toast.error(error ?? 'Não foi possível retirar a correção.'); return; }
      toast.success('Correção retirada — o saldo voltou a ficar pendente.');
      await carregar();
    } finally {
      setAjustandoId(null);
    }
  }

  async function avaliar(item: PixAutoAcordo, aprovar: boolean) {
    if (!perfil?.id) return;
    // Aprovar Pix decide comissão — é permissão separada de "ver o painel".
    if (!temPermissao('aprovar_pix_automatico')) {
      toast.error('Você não tem permissão para aprovar ou desaprovar Pix.');
      return;
    }
    setAvaliandoId(item.id);
    try {
      const pctDaLinha = item.setor_id != null
        ? (pctPorSetor[item.setor_id] ?? PIX_AUTO_PCT_PADRAO)
        : PIX_AUTO_PCT_PADRAO;
      const { ok, error, jaDecidido } = await avaliarAcordoPix({
        id: item.id,
        aprovar,
        pctAtual: pctDaLinha,
        // Setor que paga por Pix (regra do Jornada): o valor fixo trava junto.
        fixoAtual: valorFixoDoSetor(pctPorSetor, item.setor_id),
        avaliadorId: perfil.id,
        avaliadorNome: perfil.nome ?? perfil.email ?? '—',
      });
      if (!ok) {
        // Outro líder (o do setor de origem ou o do clone) decidiu antes: a
        // frase diz quem, e a lista se atualiza para o botão sumir.
        if (jaDecidido) { toast.error(error); await carregar(); return; }
        toast.error('Erro ao avaliar: ' + error);
        return;
      }
      toast.success(aprovar ? 'Acordo aprovado!' : 'Acordo desaprovado.');
      await carregar();
    } finally {
      setAvaliandoId(null);
    }
  }

  async function voltarPendente(item: PixAutoAcordo) {
    setAvaliandoId(item.id);
    try {
      const { ok, error } = await reavaliarAcordoPix(item.id, item.comissao_fixa != null);
      if (!ok) { toast.error('Erro: ' + error); return; }
      toast.success('Acordo voltou para pendente.');
      await carregar();
    } finally {
      setAvaliandoId(null);
    }
  }

  // ── Edição de um registro pendente ────────────────────────────────────────
  // Só enquanto pendente: depois de avaliado, o NR e o valor são a base da
  // comissão que o líder já conferiu, e mudá-los por baixo apagaria a conferência.
  function podeEditarLinha(item: PixAutoAcordo): boolean {
    if (item.status !== 'pendente') return false;
    return podeAgirSobreOutros || item.operador_id === perfil?.id;
  }

  function abrirEdicao(item: PixAutoAcordo) {
    setEditandoId(item.id);
    setEditNr(item.nr_cliente);
    setEditValor(Number(item.valor).toLocaleString('pt-BR', {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    }));
  }

  function fecharEdicao() {
    setEditandoId(null);
    setEditNr('');
    setEditValor('');
  }

  async function salvarEdicao(item: PixAutoAcordo) {
    if (fechamento.impedirData(dataLocalPix(item.criado_em), 'editar este registro de Pix')) return;
    const nr = editNr.trim();
    const valor = parseCurrencyInput(editValor);
    if (!nr) { toast.error('Informe o NR do acordo'); return; }
    // Só quando mudou: o registro antigo com NR sujo ainda pode ter o valor editado.
    if (nr !== item.nr_cliente.trim() && !ehSoNumeros(nr)) { toast.error('O NR só aceita números'); return; }
    if (isNaN(valor) || valor <= 0) { toast.error('Valor inválido'); return; }
    // NR novo já usado por OUTRO acordo: o registro histórico do próprio acordo
    // fica na lista de bloqueados, então trocar por ele mesmo não é conflito.
    const chave = normalizarNr(nr);
    if (chave !== normalizarNr(item.nr_cliente) && nrsBloqueados.has(chave)) {
      toast.error(`O NR ${nr} já registrou um acordo no Pix automático.`);
      return;
    }
    setSalvandoEdicao(true);
    try {
      const { ok, error } = await editarAcordoPix({ id: item.id, nrCliente: nr, valor });
      if (!ok) { toast.error('Erro ao salvar: ' + error); return; }
      toast.success('Acordo atualizado.');
      fecharEdicao();
      await carregar();
    } finally {
      setSalvandoEdicao(false);
    }
  }

  // ── Pagamento da comissão (líder+) ────────────────────────────────────────
  async function alternarPago(item: PixAutoAcordo) {
    if (!perfil?.id) return;
    setAvaliandoId(item.id);
    try {
      const { ok, count, error } = await marcarComissaoPaga({
        ids: [item.id],
        pago: !item.pago,
        responsavelId: perfil.id,
        responsavelNome: perfil.nome ?? perfil.email ?? '—',
      });
      if (!ok) { toast.error('Erro ao marcar pagamento: ' + error); return; }
      if (count === 0) {
        // A tela estava velha: outro líder pagou, desfez ou mudou a avaliação
        // no meio do caminho. Nada foi gravado; a frase diz quem mexeu.
        toast.error(await quemJaDecidiuPix(item.id));
        await carregar();
        return;
      }
      toast.success(item.pago ? 'Pagamento desfeito.' : 'Comissão marcada como paga.');
      await carregar();
    } finally {
      setAvaliandoId(null);
    }
  }

  async function excluir(item: PixAutoAcordo) {
    const { ok, error } = await excluirAcordoPix(item.id, quemExclui);
    if (!ok) { toast.error('Erro ao excluir: ' + error); return; }
    toast.success('Registro movido para a lixeira. Fica 3 dias lá.');
    await carregar();
  }

  // ── Seleção + copiar (líder) ──────────────────────────────────────────────
  function toggleSelecionado(id: string) {
    setSelecionados(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  const idsVisiveis = useMemo(() => visiveis.map(i => i.id), [visiveis]);
  const todosVisiveisSelecionados = idsVisiveis.length > 0 && idsVisiveis.every(id => selecionados.has(id));

  function toggleTodosVisiveis() {
    setSelecionados(prev => {
      if (todosVisiveisSelecionados) {
        const n = new Set(prev);
        idsVisiveis.forEach(id => n.delete(id));
        return n;
      }
      return new Set([...prev, ...idsVisiveis]);
    });
  }

  return (
    <Card className="border-border">
      <CardContent className="p-0">
        {loading ? (
          <div className="p-5 space-y-2.5">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-11 w-full rounded-lg" />)}
          </div>
        ) : visiveis.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
            <Zap className="w-8 h-8 opacity-20" />
            <p className="text-sm">
              {itens.length === 0 ? 'Nenhum acordo Pix registrado ainda.' : 'Nenhum resultado para os filtros.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/60 bg-muted/20">
                  {podeVerDeOutros && (
                    <th className="px-3 py-3 w-8">
                      <Checkbox checked={todosVisiveisSelecionados} onCheckedChange={toggleTodosVisiveis}
                        aria-label="Selecionar todos os visíveis" />
                    </th>
                  )}
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground/80 uppercase tracking-wider text-[10px]">NR</th>
                  {podeVerDeOutros && <th className="text-left px-4 py-3 font-semibold text-muted-foreground/80 uppercase tracking-wider text-[10px]">Operador</th>}
                  <th className="text-right px-4 py-3 font-semibold text-muted-foreground/80 uppercase tracking-wider text-[10px]">Valor</th>
                  <th className="text-right px-4 py-3 font-semibold text-muted-foreground/80 uppercase tracking-wider text-[10px]">Comissão Pix</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground/80 uppercase tracking-wider text-[10px]">Status</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground/80 uppercase tracking-wider text-[10px]">Pagamento</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground/80 uppercase tracking-wider text-[10px]">Registrado em</th>
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody>
                {/* A tabela nao e mais refeita a cada acao: a releitura
                    reconcilia e so a linha que mudou troca de objeto. O que
                    resta animar e a ENTRADA de quem chega e a SAIDA de quem
                    some — sem escalonamento por indice, que redesenhava as
                    100 linhas em cascata a cada clique. */}
                <AnimatePresence initial={false}>
                {daPagina.map((item) => {
                  const comissao = comissaoDe(item, pctPorSetor);
                  const pctLinha = pctDaLinha(item, pctPorSetor);
                  const fixaLinha = comissaoFixaDaLinha(item, pctPorSetor);
                  const sInfo = STATUS_INFO[item.status];
                  const desaprovado = item.status === 'desaprovado';
                  const emEdicao = editandoId === item.id;
                  return (
                    <LinhaViva key={item.id} nova={jaPintouPix.current}
                      className={cn(
                        'border-b border-border/30 group transition-colors hover:bg-accent/20',
                        desaprovado && 'opacity-60',
                      )}>
                      {podeVerDeOutros && (
                        <td className="px-3 py-3 w-8">
                          <Checkbox checked={selecionados.has(item.id)}
                            onCheckedChange={() => toggleSelecionado(item.id)}
                            aria-label={`Selecionar NR ${item.nr_cliente}`} />
                        </td>
                      )}
                      <td className="px-4 py-3 font-mono font-bold text-foreground">
                        {emEdicao ? (
                          <Input value={editNr} {...propsSoNumeros(setEditNr, 'NR')}
                            className="h-8 w-28 text-xs font-mono" aria-label="NR do acordo"
                            onKeyDown={e => {
                              if (e.key === 'Enter')  salvarEdicao(item);
                              if (e.key === 'Escape') fecharEdicao();
                            }} />
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <span>{item.nr_cliente}</span>
                            {/* A etiqueta EXTRA fica colada no NR porque é do
                                NR que ela fala: «este número pode ter sido
                                lançado por mais de um setor». Só chama a
                                atenção — não muda comissão, não libera
                                duplicidade, não pula autorização. */}
                            {item.extra && (
                              <span
                                title="Marcado como Extra por quem lançou — confira se este Pix não foi lançado também por outro setor"
                                className={cn(
                                  'inline-flex shrink-0 items-center gap-0.5 rounded px-1 py-px text-[9px] font-bold uppercase leading-none tracking-wide',
                                  natal ? corPixNatal.extra : 'bg-fuchsia-500/15 text-fuchsia-600 ring-1 ring-fuchsia-500/30 dark:text-fuchsia-400',
                                )}
                              >
                                <Sparkles className="h-2.5 w-2.5" /> extra
                              </span>
                            )}
                            {/* Carimbado pelo banco: o acordo entrou num
                                período de bônus do setor. */}
                            {Number(item.bonus_pct) > 0 && (
                              <span
                                title={`Acordo no período de bônus: +${fmtPct(Number(item.bonus_pct))} sobre a comissão do setor`}
                                className="inline-flex shrink-0 items-center gap-0.5 rounded px-1 py-px text-[9px] font-bold uppercase leading-none tracking-wide bg-success/15 text-success ring-1 ring-success/30"
                              >
                                <Gift className="h-2.5 w-2.5" /> bônus +{fmtPct(Number(item.bonus_pct))}
                              </span>
                            )}
                            <button title="Copiar NR" onClick={() => copiarTexto(item.nr_cliente, 'NR copiado.')}
                              className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground/60 hover:text-primary">
                              <Copy className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </td>
                      {podeVerDeOutros && (
                        <td className="px-4 py-3 text-foreground/80 max-w-[160px]">
                          <span className="truncate block">{item.operador_nome ?? '—'}</span>
                        </td>
                      )}
                      <td className="px-4 py-3 text-right font-mono font-semibold text-foreground">
                        {emEdicao ? (
                          <Input value={editValor} onChange={e => setEditValor(e.target.value)}
                            className="h-8 w-28 text-xs font-mono text-right ml-auto" aria-label="Valor do acordo"
                            onKeyDown={e => {
                              if (e.key === 'Enter')  salvarEdicao(item);
                              if (e.key === 'Escape') fecharEdicao();
                            }} />
                        ) : formatCurrency(item.valor)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={cn('font-mono font-bold', desaprovado ? 'text-muted-foreground line-through' : 'text-primary')}>
                          {formatCurrency(comissao)}
                        </span>
                        <span className="text-[10px] text-muted-foreground ml-1">
                          ({fixaLinha != null ? 'fixo' : fmtPct(pctLinha)})
                        </span>
                        {/* A correção fica ao lado da comissão, e não somada
                            dentro dela: quem confere precisa ver os dois
                            números para saber por que o total mudou. */}
                        {item.ajuste_valor != null && (
                          <p
                            className={cn(
                              'text-[10px] font-mono font-semibold mt-0.5',
                              Number(item.ajuste_valor) > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400',
                            )}
                            title={item.ajuste_motivo ?? 'Correção de valor divergente'}
                          >
                            {Number(item.ajuste_valor) > 0 ? '+' : '−'}
                            {formatCurrency(Math.abs(Number(item.ajuste_valor)))} correção
                            <span className="block text-muted-foreground font-normal">
                              a pagar {formatCurrency(valorAPagarDe(item, pctPorSetor))}
                            </span>
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={cn('text-[10px] font-semibold', sInfo.cls)}>{sInfo.label}</Badge>
                        {item.status !== 'pendente' && item.avaliado_por_nome && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">por {item.avaliado_por_nome}</p>
                        )}
                        {/* Prazo do desaprovado: ele some sozinho depois de
                            PIX_DIAS_UTEIS_EXPURGO dias úteis, e quem registrou
                            precisa ver quanto tempo ainda tem para conferir. */}
                        {desaprovado && prazoDesaprovado(item) && (
                          <p className="text-[10px] text-red-700/90 dark:text-red-400/90 mt-0.5 inline-flex items-center gap-1">
                            <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                            {prazoDesaprovado(item)}
                          </p>
                        )}
                      </td>
                      {/* Pagamento da comissão — estado separado da aprovação.
                          Aprovado diz que a comissão é devida; pago diz que ela
                          saiu. O operador vê os dois e para de perguntar. */}
                      <td className="px-4 py-3">
                        {item.pago ? (
                          <>
                            <Badge variant="outline" className={cn('text-[10px] font-semibold', natal ? corPixNatal.pagoSelo : 'bg-teal-500/10 text-teal-700 dark:text-teal-400 border-teal-500/30')}>
                              Pago
                            </Badge>
                            {item.pago_por_nome && (
                              <p className="text-[10px] text-muted-foreground mt-0.5">
                                por {item.pago_por_nome}
                                {item.pago_em && ` · ${new Date(item.pago_em).toLocaleDateString('pt-BR')}`}
                              </p>
                            )}
                          </>
                        ) : item.status === 'aprovado' ? (
                          <Badge variant="outline" className="text-[10px] font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-500 border-amber-500/30">
                            A pagar
                          </Badge>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-muted-foreground">
                        {new Date(item.criado_em).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="px-3 py-3">
                        {emEdicao ? (
                          <div className="flex items-center justify-end gap-1">
                            <button title="Salvar" disabled={salvandoEdicao}
                              onClick={() => salvarEdicao(item)}
                              className="h-7 px-2 rounded-lg flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 disabled:opacity-50">
                              {salvandoEdicao ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                              Salvar
                            </button>
                            <button title="Cancelar" disabled={salvandoEdicao} onClick={fecharEdicao}
                              className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent/60 disabled:opacity-50">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {/* Editar: só enquanto pendente. Depois de avaliado, NR e
                              valor são a base da comissão que o líder já conferiu. */}
                          {podeEditarLinha(item) && (
                            <button title="Editar NR e valor" onClick={() => abrirEdicao(item)}
                              className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {podeAgirSobreOutros && podeAprovar && item.status === 'pendente' && (
                            <>
                              <button title="Aprovar" disabled={avaliandoId === item.id}
                                onClick={() => avaliar(item, true)}
                                className="h-7 px-2 rounded-lg flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 disabled:opacity-50">
                                <Check className="w-3 h-3" /> Aprovar
                              </button>
                              <button title="Desaprovar" disabled={avaliandoId === item.id}
                                onClick={() => avaliar(item, false)}
                                className="h-7 px-2 rounded-lg flex items-center gap-1 text-[11px] font-semibold text-red-700 dark:text-red-400 border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 disabled:opacity-50">
                                <XCircle className="w-3 h-3" /> Desaprovar
                              </button>
                            </>
                          )}
                          {/* Corrigir valor divergente. Só aparece quando há
                              saldo LIVRE da pessoa e o acordo está aprovado e
                              não pago — as mesmas três condições que a RPC
                              cobra, para o botão não prometer o que o banco
                              vai recusar. */}
                          {saldoAplicavelNa(item) && (
                            <button
                              title={`Aplicar ${formatCurrency(saldoAplicavelNa(item)!.valor)} de correção neste pagamento`}
                              disabled={ajustandoId === item.id}
                              onClick={() => aplicarCorrecao(item)}
                              className="h-7 px-2 rounded-lg flex items-center gap-1 text-[11px] font-semibold text-primary border border-primary/30 bg-primary/10 hover:bg-primary/20 disabled:opacity-50">
                              {ajustandoId === item.id
                                ? <RefreshCw className="w-3 h-3 animate-spin" />
                                : <Scale className="w-3 h-3" />}
                              Corrigir valor
                            </button>
                          )}
                          {/* Retirar a correção só faz sentido antes do
                              pagamento: depois dele o carimbo é histórico, e
                              o caminho de volta é desfazer o pagamento. */}
                          {podeAjustarSaldo && item.ajuste_valor != null && !item.pago && (
                            <button
                              title="Retirar a correção deste acordo"
                              disabled={ajustandoId === item.id}
                              onClick={() => retirarCorrecao(item)}
                              className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-amber-400 hover:bg-amber-500/10 disabled:opacity-50">
                              <Eraser className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {/* Pagar só o que está aprovado — é o que o banco aceita. */}
                          {podeAgirSobreOutros && item.status === 'aprovado' && (
                            <button title={item.pago ? 'Desfazer pagamento' : 'Marcar comissão como paga'}
                              disabled={avaliandoId === item.id}
                              onClick={() => alternarPago(item)}
                              className={cn(
                                'h-7 px-2 rounded-lg flex items-center gap-1 text-[11px] font-semibold border disabled:opacity-50',
                                item.pago
                                  ? 'text-muted-foreground border-border hover:text-foreground hover:bg-accent/60'
                                  : natal ? corPixNatal.pagar : 'text-teal-700 dark:text-teal-400 border-teal-500/30 bg-teal-500/10 hover:bg-teal-500/20',
                              )}>
                              <Banknote className="w-3 h-3" /> {item.pago ? 'Desfazer' : 'Pagar'}
                            </button>
                          )}
                          {/* Pago não volta para pendente: ficaria uma linha
                              pendente com pagamento feito, estado que a regra
                              do NR não sabe ler. Desfaz-se o pagamento
                              primeiro — o botão ao lado faz isso. */}
                          {podeAgirSobreOutros && item.status !== 'pendente' && !item.pago && (
                            <button title="Voltar para pendente" disabled={avaliandoId === item.id}
                              onClick={() => voltarPendente(item)}
                              className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent/60 disabled:opacity-50">
                              <Undo2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {/* Linha paga não se exclui: o pagamento é o que
                              tranca o NR desde a 20260811a, e apagar a linha
                              destrancaria. O banco recusa de qualquer jeito
                              (trg_pix_a_impede_pago) — aqui é só não oferecer
                              um botão que vai dar erro. */}
                          {!item.pago && (podeAgirSobreOutros || (desaprovado && item.operador_id === perfil?.id)) && (
                            <button title="Excluir registro" onClick={() => excluir(item)}
                              className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                        )}
                      </td>
                    </LinhaViva>
                  );
                })}
                </AnimatePresence>
              </tbody>
            </table>

            {/* Rodapé de páginas. Só aparece quando há mais de uma — numa
                lista curta seria ruído fixo dizendo "1 de 1". */}
            {totalPaginas > 1 && (
              <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-border">
                <p className="text-[11px] text-muted-foreground">
                  {(paginaAtual - 1) * PIX_LINHAS_POR_PAGINA + 1}
                  {'–'}
                  {Math.min(paginaAtual * PIX_LINHAS_POR_PAGINA, visiveis.length)}
                  {' de '}
                  <span className="font-semibold text-foreground">{visiveis.length}</span>
                  {' registros'}
                </p>
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline" size="sm"
                    className="h-7 px-2 text-xs rounded-lg"
                    disabled={paginaAtual <= 1}
                    onClick={() => setPagina(p => Math.max(1, p - 1))}
                  >
                    Anterior
                  </Button>
                  <span className="text-[11px] text-muted-foreground tabular-nums px-1">
                    {paginaAtual} / {totalPaginas}
                  </span>
                  <Button
                    variant="outline" size="sm"
                    className="h-7 px-2 text-xs rounded-lg"
                    disabled={paginaAtual >= totalPaginas}
                    onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))}
                  >
                    Próxima
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
