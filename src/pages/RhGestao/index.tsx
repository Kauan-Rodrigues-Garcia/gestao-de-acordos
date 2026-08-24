/**
 * RH Gestão — Controle de Premiação e Comissão.
 *
 * ## Uma área, três leituras
 *
 * Não há três telas. Há uma, e o que ela mostra primeiro depende do alcance que
 * a pessoa tem na aba:
 *
 *   • alcance de EQUIPE (liderança) → as equipes que ela lidera, abertas;
 *   • alcance de SETOR (gerência)   → as equipes do setor, para conferir e enviar;
 *   • alcance de EMPRESA (RH)       → a visão consolidada por cidade e setor,
 *                                     que abre para o detalhe quando ela clica.
 *
 * Quem decide isso é o painel de permissões, nunca um `if (cargo === …)` escrito
 * aqui. É a regra do projeto, e é o que permite conceder a visão de RH a uma
 * pessoa sem inventar um cargo novo para ela.
 *
 * ## O que a tela NÃO faz
 *
 * Ela não valida o fluxo. Concluir, validar, enviar, aprovar e devolver são
 * RPCs que conferem permissão, escopo e estado atual no banco. A tela esconde
 * botões — o que é conforto, não segurança —, e traduz a recusa quando ela vem.
 *
 * ## Percentual
 *
 * Vem de `useRhGestao`, que chama `calcularPercentualRh`, que chama
 * `calcularProjecao` — a mesma conta da aba Quartis. Não existe aritmética de
 * desempenho neste arquivo, e é de propósito.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Users, ChevronLeft, CheckCircle2, Send, ShieldCheck, Undo2, Loader2,
  ClipboardList, AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/index';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useRhGestao, comPercentual, type LancamentoComPercentual } from '@/hooks/useRhGestao';
import { montarArvore } from '@/services/rh/rhAgregacao';
import { GRUPO_META } from '@/services/rh/rhEstados';
import { gerarPlanilhaRh } from '@/services/rh/rhExportacao';
import {
  salvarLancamento, congelarPercentual, concluirEquipe, validarEquipe,
  enviarSetor, aprovarOperador, aprovarEquipe, devolverOperador, devolverEquipe,
  dispensarOperador,
  finalizarCompetencia, reabrirCompetencia,
} from '@/services/rh/rhGestao.service';
import { registrarLog } from '@/services/logs.service';
import TabelaOperadores from './TabelaOperadores';
import VisaoConsolidada from './VisaoConsolidada';
import CabecalhoCompetencia from './CabecalhoCompetencia';
import DialogoMotivo from './DialogoMotivo';
import DialogoCompetencia from './DialogoCompetencia';
import DialogoCracha from './DialogoCracha';
import PainelConfiguracao from './PainelConfiguracao';
import HistoricoRh from './HistoricoRh';

type AlvoMotivo =
  | { tipo: 'operador'; lancamento: LancamentoComPercentual }
  | { tipo: 'equipe'; equipeId: string; equipeNome: string }
  | { tipo: 'reabrir' }
  /*
   * Tirar da folha também pede motivo, e pelo mesmo motivo que devolver pede:
   * o número que some da folha é o tipo de coisa que alguém audita depois, e
   * «por que essa pessoa não recebeu» precisa ter resposta escrita.
   */
  | { tipo: 'dispensar'; lancamento: LancamentoComPercentual };

export default function RhGestao() {
  const { perfil }  = useAuth();
  const { empresa } = useEmpresa();
  const [params] = useSearchParams();

  const {
    carregando, atualizando, permissoes, celulas, fechamentos, fechamento,
    lancamentos, percentuais, selecionarFechamento, recarregar,
  } = useRhGestao();

  const [setorAberto, setSetorAberto] = useState<string | null>(null);
  const [motivoAlvo, setMotivoAlvo]   = useState<AlvoMotivo | null>(null);
  const [salvandoMotivo, setSalvando] = useState(false);
  const [novaAberta, setNovaAberta]   = useState(false);
  const [prazoAberto, setPrazoAberto] = useState(false);
  const [configAberta, setConfigAberta] = useState(false);
  const [historicoAberto, setHistorico] = useState(false);
  const [crachaAlvo, setCrachaAlvo]   = useState<LancamentoComPercentual | null>(null);
  const [ocupado, setOcupado]         = useState<string | null>(null);

  // A notificação de devolução leva `?fechamento=…&equipe=…`: quem clica cai no
  // registro, e não numa lista onde ainda teria que procurar do que se tratava.
  useEffect(() => {
    const alvo = params.get('fechamento');
    if (alvo && fechamentos.some(f => f.id === alvo)) selecionarFechamento(alvo);
  }, [params, fechamentos, selecionarFechamento]);

  const linhas = useMemo(
    () => lancamentos.map(l => comPercentual(l, percentuais)),
    [lancamentos, percentuais],
  );

  const ordemCelulas = useMemo(() => celulas.map(c => c.nome), [celulas]);
  const arvore = useMemo(() => montarArvore(linhas, ordemCelulas), [linhas, ordemCelulas]);

  /** O RH começa consolidado; quem tem alcance menor já cai no detalhe. */
  const modoConsolidado = permissoes.escopoTodos && !setorAberto;

  const setoresVisiveis = useMemo(
    () => arvore.celulas.flatMap(c => c.setores),
    [arvore],
  );
  const setorEmFoco = useMemo(
    () => setoresVisiveis.find(s => s.setorId === setorAberto) ?? null,
    [setoresVisiveis, setorAberto],
  );

  /**
   * Os setores desenhados agora.
   *
   * A lista é por SETOR, e não por equipe, porque «enviar ao RH» é ato de setor.
   * A gerência não passa pela visão consolidada (ela não tem alcance de empresa)
   * e nunca «abre» um setor — se o botão dependesse de um setor aberto, ela
   * simplesmente não teria como enviar.
   */
  const setoresParaDesenhar = useMemo(
    () => (setorEmFoco ? [setorEmFoco] : setoresVisiveis),
    [setorEmFoco, setoresVisiveis],
  );

  const totalDeEquipes = useMemo(
    () => setoresParaDesenhar.reduce((n, s) => n + s.equipes.length, 0),
    [setoresParaDesenhar],
  );

  const competenciaAberta = fechamento?.status === 'aberto';
  const jaEnviouTudo = arvore.resumo.total > 0
    && (arvore.resumo.estado === 'enviado' || arvore.resumo.estado === 'aprovado');

  // A primeira pintura não anima; só quem chega depois se move.
  const jaPintou = useRef(false);
  useEffect(() => { if (!carregando) jaPintou.current = true; }, [carregando]);

  // ── Ações ────────────────────────────────────────────────────────────────

  const avisar = useCallback((ok: boolean, erro: string | undefined, sucesso: string) => {
    if (ok) toast.success(sucesso);
    else toast.error(erro ?? 'Não foi possível concluir a ação.');
  }, []);

  const salvarValor = useCallback(async (
    lancamentoId: string, valor: number, observacao: string | null,
  ): Promise<boolean> => {
    const r = await salvarLancamento({ lancamentoId, valor, observacao });
    if (!r.ok) { toast.error(r.erro ?? 'Não foi possível salvar.'); return false; }
    await recarregar();
    return true;
  }, [recarregar]);

  /**
   * Concluir a equipe: congela a fotografia e muda o estado.
   *
   * O congelamento vem ANTES da transição de propósito. Se a ordem fosse a
   * inversa e algo falhasse no meio, a equipe ficaria concluída com percentual
   * nulo — e o número que a gerência confere teria voltado a acompanhar o mês.
   * Falhando o congelamento, nada é concluído e a mensagem explica.
   */
  const concluir = useCallback(async (equipeId: string, doEscopo: LancamentoComPercentual[]) => {
    if (!fechamento) return;
    setOcupado(equipeId);
    try {
      for (const l of doEscopo) {
        // Já congelado e não devolvido: a fotografia é da primeira conclusão e
        // não se retira sozinha. O DEVOLVIDO é a exceção — a devolução pode ter
        // sido justamente porque o percentual estava errado, e corrigi-lo sem
        // refazer a foto devolveria o mesmo número que causou a devolução.
        if (l.percentual_snapshot != null && l.status !== 'devolvido_rh') continue;
        const p = percentuais[l.operador_id];
        if (!p) continue;
        const r = await congelarPercentual({
          lancamentoId: l.id,
          percentual: p.percentual ?? 0,
          meta: p.meta ?? 0,
          recebido: p.recebido,
        });
        if (!r.ok) {
          toast.error(r.erro ?? 'Não foi possível congelar o percentual.');
          return;
        }
      }
      const r = await concluirEquipe(fechamento.id, equipeId);
      avisar(r.ok, r.erro, 'Equipe concluída — pronta para a conferência da gerência.');
      if (r.ok) await recarregar();
    } finally {
      setOcupado(null);
    }
  }, [fechamento, percentuais, avisar, recarregar]);

  const validar = useCallback(async (equipeId: string) => {
    if (!fechamento) return;
    setOcupado(equipeId);
    try {
      const r = await validarEquipe(fechamento.id, equipeId);
      avisar(r.ok, r.erro, 'Equipe validada.');
      if (r.ok) await recarregar();
    } finally { setOcupado(null); }
  }, [fechamento, avisar, recarregar]);

  const enviar = useCallback(async (setorId: string) => {
    if (!fechamento) return;
    setOcupado(setorId);
    try {
      const r = await enviarSetor(fechamento.id, setorId);
      avisar(r.ok, r.erro, 'Setor enviado ao RH.');
      if (r.ok) await recarregar();
    } finally { setOcupado(null); }
  }, [fechamento, avisar, recarregar]);

  const aprovarUm = useCallback(async (lancamentoId: string) => {
    setOcupado(lancamentoId);
    try {
      const r = await aprovarOperador(lancamentoId);
      avisar(r.ok, r.erro, 'Aprovado.');
      if (r.ok) await recarregar();
    } finally { setOcupado(null); }
  }, [avisar, recarregar]);

  const aprovarTime = useCallback(async (equipeId: string) => {
    if (!fechamento) return;
    setOcupado(equipeId);
    try {
      const r = await aprovarEquipe(fechamento.id, equipeId);
      avisar(r.ok, r.erro, `${r.dados ?? 0} lançamento(s) aprovado(s).`);
      if (r.ok) await recarregar();
    } finally { setOcupado(null); }
  }, [fechamento, avisar, recarregar]);

  const confirmarMotivo = useCallback(async (motivo: string) => {
    if (!motivoAlvo || !fechamento) return;
    setSalvando(true);
    try {
      if (motivoAlvo.tipo === 'operador') {
        const r = await devolverOperador(motivoAlvo.lancamento.id, motivo);
        avisar(r.ok, r.erro, `${motivoAlvo.lancamento.nome_snapshot} foi devolvido para correção.`);
        if (r.ok) { setMotivoAlvo(null); await recarregar(); }
      } else if (motivoAlvo.tipo === 'equipe') {
        const r = await devolverEquipe(fechamento.id, motivoAlvo.equipeId, motivo);
        avisar(r.ok, r.erro, `Equipe ${motivoAlvo.equipeNome} devolvida.`);
        if (r.ok) { setMotivoAlvo(null); await recarregar(); }
      } else if (motivoAlvo.tipo === 'dispensar') {
        const r = await dispensarOperador(motivoAlvo.lancamento.id, true, motivo);
        avisar(r.ok, r.erro,
          `${motivoAlvo.lancamento.nome_snapshot} ficou fora da folha desta competência.`);
        if (r.ok) { setMotivoAlvo(null); await recarregar(); }
      } else {
        const r = await reabrirCompetencia(fechamento.id, motivo);
        avisar(r.ok, r.erro, 'Competência reaberta.');
        if (r.ok) { setMotivoAlvo(null); await recarregar(); }
      }
    } finally { setSalvando(false); }
  }, [motivoAlvo, fechamento, avisar, recarregar]);

  /**
   * Tirar da folha, ou devolver para ela.
   *
   * Tirar passa pelo diálogo de motivo; devolver para a folha é imediato — ele
   * não retira nada de ninguém, e exigir uma justificativa para desfazer um
   * engano só faz o engano demorar mais para ser corrigido.
   */
  const alternarDispensa = useCallback(async (
    l: LancamentoComPercentual, dispensar: boolean,
  ) => {
    if (dispensar) { setMotivoAlvo({ tipo: 'dispensar', lancamento: l }); return; }
    const r = await dispensarOperador(l.id, false);
    avisar(r.ok, r.erro, `${l.nome_snapshot} voltou para a folha.`);
    if (r.ok) await recarregar();
  }, [avisar, recarregar]);

  const finalizar = useCallback(async () => {
    if (!fechamento) return;
    const r = await finalizarCompetencia(fechamento.id);
    avisar(r.ok, r.erro, 'Competência finalizada.');
    if (r.ok) await recarregar();
  }, [fechamento, avisar, recarregar]);

  /**
   * Exportação — e o log dela.
   *
   * `registrarLog` aqui não é redundância com a auditoria por trigger: o banco
   * não vê ninguém baixar arquivo. Exportar folha de pagamento é exatamente o
   * tipo de evento que a trilha existe para guardar.
   */
  const exportar = useCallback(() => {
    if (!fechamento || linhas.length === 0) {
      toast.error('Nada para exportar nesta competência.');
      return;
    }
    const { blob, nomeArquivo, abas } = gerarPlanilhaRh(
      linhas, String(fechamento.competencia), ordemCelulas);

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = nomeArquivo; a.click();
    URL.revokeObjectURL(url);

    void registrarLog({
      acao: 'rh_fechamento_exportado',
      categoria: 'financeiro',
      severidade: 'aviso',
      descricao: `Exportou o fechamento de RH de ${String(fechamento.competencia).slice(0, 7)}`,
      empresaId: empresa?.id ?? null,
      tabela: 'rh_lancamentos',
      registroId: fechamento.id,
      alvoTipo: 'rh_fechamento',
      alvoRotulo: String(fechamento.competencia).slice(0, 7),
      detalhes: {
        pessoas: linhas.length,
        total: arvore.resumo.valorTotal,
        blocos: abas.map(x => x.nome),
      },
    });
    toast.success('Planilha gerada.');
  }, [fechamento, linhas, ordemCelulas, empresa?.id, arvore.resumo.valorTotal]);

  // ── Render ───────────────────────────────────────────────────────────────

  if (carregando) {
    return (
      <div className="p-4 md:p-6 space-y-4">
        <Skeleton className="h-8 w-56" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (!permissoes.podeVer) {
    return (
      <div className="max-w-md mx-auto text-center py-16 px-6 space-y-2">
        <ClipboardList className="w-8 h-8 mx-auto opacity-40" />
        <p className="text-sm font-medium">O RH Gestão não está liberado para você.</p>
        <p className="text-xs text-muted-foreground">
          Peça a um administrador para ligar a aba e o alcance em
          Configurações › Permissões.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <CabecalhoCompetencia
        fechamentos={fechamentos}
        fechamento={fechamento}
        permissoes={permissoes}
        jaEnviou={jaEnviouTudo}
        atualizando={atualizando}
        onSelecionar={id => { setSetorAberto(null); selecionarFechamento(id); }}
        onAbrirNova={() => setNovaAberta(true)}
        onEditarPrazo={() => setPrazoAberto(true)}
        onFinalizar={finalizar}
        onReabrir={() => setMotivoAlvo({ tipo: 'reabrir' })}
        onExportar={exportar}
        onHistorico={() => setHistorico(true)}
        onConfigurar={() => setConfigAberta(true)}
        onRecarregar={() => void recarregar()}
      />

      {!fechamento ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center space-y-2">
            <ClipboardList className="w-8 h-8 mx-auto opacity-40" />
            <p className="text-sm font-medium">Nenhuma competência aberta.</p>
            <p className="text-xs text-muted-foreground">
              {permissoes.podeGerenciarFechamento
                ? 'Abra a competência do mês para começar o controle.'
                : 'O RH ainda não abriu a competência deste mês.'}
            </p>
            {permissoes.podeGerenciarFechamento && (
              <Button size="sm" className="mt-2" onClick={() => setNovaAberta(true)}>
                Abrir competência
              </Button>
            )}
          </CardContent>
        </Card>
      ) : modoConsolidado ? (
        <VisaoConsolidada arvore={arvore} onAbrirSetor={setSetorAberto} />
      ) : (
        <div className="space-y-4">
          {/* Caminho de volta. Só existe para quem entrou por uma visão de
              cima — quem já abre no detalhe não tem para onde voltar. */}
          {permissoes.escopoTodos && setorEmFoco && (
            <button
              onClick={() => setSetorAberto(null)}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              Todos os setores
              <span className="text-foreground font-medium ml-1">· {setorEmFoco.setorNome}</span>
            </button>
          )}

          {totalDeEquipes === 0 && (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center space-y-1">
                <Users className="w-8 h-8 mx-auto opacity-40" />
                <p className="text-sm font-medium">Nenhuma equipe no seu escopo.</p>
                <p className="text-xs text-muted-foreground">
                  As equipes aparecem aqui quando você é registrado como líder delas
                  em Usuários › Equipes.
                </p>
              </CardContent>
            </Card>
          )}

          {setoresParaDesenhar.map(setor => (
            <div key={setor.setorId} className="space-y-3">
              {/* Cabeçalho do setor. Quem enxerga mais de um precisa saber a
                  qual deles pertence a equipe logo abaixo. */}
              {setoresParaDesenhar.length > 1 && (
                <div className="flex items-center gap-2 pt-1">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    {setor.setorNome}
                  </h3>
                  <span className="text-[11px] text-muted-foreground font-mono ml-auto">
                    {formatCurrency(setor.resumo.valorTotal)}
                  </span>
                </div>
              )}

              {/* Enviar é ato de SETOR: exige todas as equipes dele validadas. */}
              {permissoes.podeEnviar && competenciaAberta && (
                <div className="flex items-center gap-2">
                  {setor.resumo.estado === 'validado' ? (
                    <Button size="sm" className="h-8 text-xs gap-1.5"
                            disabled={ocupado === setor.setorId}
                            onClick={() => void enviar(setor.setorId)}>
                      <Send className="w-3.5 h-3.5" /> Enviar {setor.setorNome} ao RH
                    </Button>
                  ) : (
                    <p className="text-[11px] text-muted-foreground inline-flex items-center gap-1.5">
                      <AlertTriangle className="w-3 h-3 shrink-0" />
                      {setor.setorNome}: o envio ao RH libera quando todas as equipes
                      estiverem validadas.
                    </p>
                  )}
                </div>
              )}

            {setor.equipes.map(eq => {
              const g = GRUPO_META[eq.resumo.estado];
              const emAcao = ocupado === (eq.equipeId ?? '');

              return (
                <Card key={eq.equipeId ?? 'sem-equipe'} className="border-border/70 overflow-hidden">
                  <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-border/50 bg-muted/20">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">
                        {eq.equipeNome}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {eq.resumo.total} operador{eq.resumo.total !== 1 ? 'es' : ''} ·{' '}
                        {eq.resumo.total - eq.resumo.pendentes} preenchido
                        {eq.resumo.total - eq.resumo.pendentes !== 1 ? 's' : ''} ·{' '}
                        {eq.resumo.pendentes} pendente{eq.resumo.pendentes !== 1 ? 's' : ''}
                      </p>
                    </div>

                    <div className="ml-auto flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-bold text-foreground">
                        {formatCurrency(eq.resumo.valorTotal)}
                      </span>
                      <Badge variant="outline" className={cn('text-[10px] font-semibold', g.cls)}>
                        {g.label}
                      </Badge>

                      {emAcao && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}

                      {/* Concluir: só quando falta a conclusão, e nunca em
                          silêncio — a RPC recusa com a lista de quem falta. */}
                      {permissoes.podePreencher && competenciaAberta && eq.equipeId
                        && (eq.resumo.estado === 'em_preenchimento'
                            || eq.resumo.estado === 'nao_iniciado'
                            || eq.resumo.estado === 'com_devolucao') && (
                        <Button
                          size="sm" variant="outline" className="h-7 text-[11px] gap-1"
                          disabled={emAcao}
                          onClick={() => void concluir(eq.equipeId!, eq.linhas)}
                        >
                          <CheckCircle2 className="w-3 h-3" /> Concluir equipe
                        </Button>
                      )}

                      {permissoes.podeValidar && competenciaAberta && eq.equipeId
                        && eq.resumo.estado === 'concluido' && (
                        <Button
                          size="sm" variant="outline" className="h-7 text-[11px] gap-1"
                          disabled={emAcao}
                          onClick={() => void validar(eq.equipeId!)}
                        >
                          <ShieldCheck className="w-3 h-3" /> Validar
                        </Button>
                      )}

                      {permissoes.podeAprovar && competenciaAberta && eq.equipeId
                        && eq.resumo.estado === 'enviado' && (
                        <Button
                          size="sm" className="h-7 text-[11px] gap-1"
                          disabled={emAcao}
                          onClick={() => void aprovarTime(eq.equipeId!)}
                        >
                          <CheckCircle2 className="w-3 h-3" /> Aprovar equipe
                        </Button>
                      )}

                      {permissoes.podeDevolver && competenciaAberta && eq.equipeId
                        && (eq.resumo.estado === 'enviado' || eq.resumo.estado === 'aprovado') && (
                        <Button
                          size="sm" variant="outline"
                          className="h-7 text-[11px] gap-1 text-red-400 border-red-500/30 hover:bg-red-500/10"
                          disabled={emAcao}
                          onClick={() => setMotivoAlvo({
                            tipo: 'equipe', equipeId: eq.equipeId!, equipeNome: eq.equipeNome,
                          })}
                        >
                          <Undo2 className="w-3 h-3" /> Devolver equipe
                        </Button>
                      )}
                    </div>
                  </div>

                  <CardContent className="p-0">
                    <TabelaOperadores
                      linhas={eq.linhas}
                      permissoes={permissoes}
                      competenciaAberta={!!competenciaAberta}
                      jaPintou={jaPintou.current}
                      onSalvarValor={salvarValor}
                      onAprovar={aprovarUm}
                      onDispensar={(l, d) => { void alternarDispensa(l, d); }}
                      onDevolver={l => setMotivoAlvo({ tipo: 'operador', lancamento: l })}
                      onEditarCracha={setCrachaAlvo}
                    />
                  </CardContent>
                </Card>
              );
            })}
            </div>
          ))}
        </div>
      )}

      {/* ── Diálogos ── */}
      <DialogoMotivo
        aberto={!!motivoAlvo}
        titulo={
          motivoAlvo?.tipo === 'operador' ? `Devolver ${motivoAlvo.lancamento.nome_snapshot}`
          : motivoAlvo?.tipo === 'dispensar' ? `Tirar ${motivoAlvo.lancamento.nome_snapshot} da folha`
          : motivoAlvo?.tipo === 'equipe' ? `Devolver a equipe ${motivoAlvo.equipeNome}`
          : 'Reabrir a competência'
        }
        descricao={
          motivoAlvo?.tipo === 'operador'
            ? 'Só este operador volta para correção. Os demais da equipe mantêm o estado atual.'
          : motivoAlvo?.tipo === 'dispensar'
            ? 'Ele sai da folha desta competência e deixa de ser exigido para concluir a equipe. '
              + 'Nenhum valor é pago. O motivo fica registrado e dá para desfazer.'
          : motivoAlvo?.tipo === 'equipe'
            ? 'A equipe inteira volta para correção. As outras equipes já aprovadas não são afetadas.'
            : 'A folha desta competência já foi fechada. Reabrir permite alterar valores que já circularam.'
        }
        rotuloConfirmar={
          motivoAlvo?.tipo === 'reabrir'   ? 'Reabrir'
          : motivoAlvo?.tipo === 'dispensar' ? 'Tirar da folha'
          : 'Devolver'
        }
        destrutivo={motivoAlvo?.tipo !== 'reabrir'}
        salvando={salvandoMotivo}
        onConfirmar={confirmarMotivo}
        onFechar={() => setMotivoAlvo(null)}
      />

      <DialogoCompetencia
        aberto={novaAberta || prazoAberto}
        modo={prazoAberto ? 'prazo' : 'nova'}
        empresaId={empresa?.id ?? ''}
        fechamento={prazoAberto ? fechamento : null}
        onFechar={() => { setNovaAberta(false); setPrazoAberto(false); }}
        onSalvo={async id => {
          setNovaAberta(false); setPrazoAberto(false);
          await recarregar();
          if (id) selecionarFechamento(id);
        }}
      />

      <DialogoCracha
        lancamento={crachaAlvo}
        empresaId={empresa?.id ?? ''}
        onFechar={() => setCrachaAlvo(null)}
        onSalvo={async () => { setCrachaAlvo(null); await recarregar(); }}
      />

      <PainelConfiguracao
        aberto={configAberta}
        empresaId={empresa?.id ?? ''}
        autorId={perfil?.id ?? ''}
        autorNome={perfil?.nome ?? perfil?.email ?? '—'}
        onFechar={() => setConfigAberta(false)}
        onMudou={() => void recarregar()}
      />

      <HistoricoRh
        aberto={historicoAberto}
        fechamentoId={fechamento?.id ?? null}
        onFechar={() => setHistorico(false)}
      />
    </div>
  );
}
