/**
 * src/pages/AdminLogs/index.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Logs do Sistema 2.0 — a aba interna de Configurações.
 *
 * ## O que a versão 1.0 era
 * Uma tabela de sete colunas com as últimas 200 linhas, dois filtros (tabela e
 * empresa), a ação em maiúsculas sem tradução, `JSON.stringify(detalhes)`
 * truncado na última coluna, e um botão "Limpar Logs" que apagava a trilha
 * inteira da empresa com um `window.confirm` de uma linha. Como quase nada
 * gravava log, a tela costumava estar vazia — e quando não estava, dizia
 * "UPDATE em acordos" sem dizer o que mudou.
 *
 * ## O que esta é
 * Quatro camadas, de cima para baixo:
 *   1. **Painel** — números do período, atividade por dia, categorias, ações e
 *      autores mais frequentes. Tudo agregado no banco, clicável como filtro.
 *   2. **Filtros** — período, busca livre, severidade em destaque; categoria,
 *      ação, autor, tabela, origem e campo alterado atrás de "Mais filtros".
 *   3. **Lista** — linha do tempo (padrão) ou tabela, com paginação por
 *      demanda e chegada em tempo real opcional.
 *   4. **Detalhe** — painel lateral com diff campo a campo, contexto de
 *      requisição (IP, navegador, rota) e a linha de vida do registro.
 *
 * A cobertura do que é registrado não mora aqui: mora em triggers de banco
 * (migration 20260812a), que auditam 29 tabelas independentemente do caminho
 * que alterou a linha. Esta tela é o leitor daquela trilha.
 */
import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ClipboardList, RefreshCw, Download, Radio, List, Table2, ArrowUp,
  Loader2, ShieldCheck, Trash2, Info, Activity,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { Empresa, LogSistema } from '@/lib/supabase';
import { fetchEmpresas } from '@/services/empresas.service';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useLogs } from '@/hooks/useLogs';
import {
  exportarLogsCsv, baixarCsv, expurgarLogs, registrarLog,
} from '@/services/logs.service';
import { RETENCAO_LOGS_DIAS, RETENCAO_LOGS_MINIMA_DIAS } from '@/lib/logs-catalogo';
import LogsPainel from './LogsPainel';
import LogsFiltros from './LogsFiltros';
import LogsTimeline from './LogsTimeline';
import LogsTabela from './LogsTabela';
import LogDetalhe from './LogDetalhe';
import MonitoramentoUso from './MonitoramentoUso';
import { numeroBr, tempoRelativo } from './formatos';
import { useSubAbaUso } from '@/providers/RastreioUsoProvider';

type Vista = 'timeline' | 'tabela';
/** Trilha = o que mudou. Uso = quem está usando. Ver o comentário nas abas. */
type AbaInterna = 'trilha' | 'uso';

export default function AdminLogs() {
  const { perfil } = useAuth();
  const { empresa: tenantEmpresa } = useEmpresa();
  const isSuperAdmin = perfil?.perfil === 'super_admin';

  const {
    logs, resumo, opcoes, total, temMais,
    carregando, carregandoMais, carregandoResumo,
    filtros, filtrosAtivos, setFiltro, limparFiltros,
    carregarMais, recarregar,
    aoVivo, setAoVivo, novosDesdeCarga, atualizadoEm,
    filtrosServico,
  } = useLogs();

  const [vista, setVista] = useState<Vista>('timeline');
  const [abaInterna, setAbaInterna] = useState<AbaInterna>('trilha');
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [selecionado, setSelecionado] = useState<LogSistema | null>(null);
  const [exportando, setExportando] = useState(false);
  const [expurgoAberto, setExpurgoAberto] = useState(false);

  // A própria tela é medida: `admin/configuracoes:logs` ou `:uso`. Sem isto, as
  // duas abas internas apareceriam somadas como uma só no monitoramento.
  useSubAbaUso(abaInterna === 'uso' ? 'uso' : 'logs');

  /**
   * Empresa que o monitoramento de uso deve ler.
   *
   * Acompanha o seletor de empresa dos filtros quando há um (super_admin), e cai
   * no tenant atual quando não há. A RLS de `uso_telas` recusa a empresa alheia
   * de todo jeito — isto é só para a tela pedir o que ela pode ver.
   */
  const empresaDoPainel = filtros.empresaId ?? tenantEmpresa?.id ?? null;

  // Lista de empresas só para super_admin — os demais nem veem o seletor, e
  // buscar a lista para eles seria uma chamada que o RLS recusa.
  useEffect(() => {
    if (!isSuperAdmin) {
      setEmpresas(tenantEmpresa ? [tenantEmpresa] : []);
      return;
    }
    fetchEmpresas().then(setEmpresas).catch(() => setEmpresas([]));
  }, [isSuperAdmin, tenantEmpresa]);

  const mostrarEmpresa = isSuperAdmin && !filtros.empresaId;

  // ── Exportação ────────────────────────────────────────────────────────────
  /**
   * Exportar dado de auditoria é, ele mesmo, um evento de auditoria: alguém
   * levou o histórico da operação para fora do sistema. O log é gravado ANTES do
   * download para que o registro exista mesmo se o navegador engasgar no arquivo.
   */
  async function exportar() {
    setExportando(true);
    try {
      const { csv, linhas, truncado } = await exportarLogsCsv(filtrosServico);

      if (linhas === 0) {
        toast.info('Nada a exportar neste recorte.');
        return;
      }

      await registrarLog({
        acao: 'logs_exportados',
        categoria: 'seguranca',
        severidade: 'aviso',
        descricao: `Exportou ${linhas} registro(s) de log em CSV`,
        empresaId: filtros.empresaId ?? tenantEmpresa?.id ?? null,
        tabela: 'logs_sistema',
        alvoTipo: 'trilha de auditoria',
        detalhes: {
          linhas,
          truncado,
          periodo: filtros.periodo,
          de: filtrosServico.de,
          ate: filtrosServico.ate,
          filtros_aplicados: filtrosAtivos,
        },
      });

      const agora = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
      baixarCsv(csv, `logs-${agora}.csv`);

      if (truncado) {
        toast.warning(`Exportadas ${numeroBr(linhas)} linhas (teto do arquivo). Refine o período para o restante.`);
      } else {
        toast.success(`${numeroBr(linhas)} registro(s) exportado(s).`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível exportar os logs.');
    } finally {
      setExportando(false);
    }
  }

  const rodapeContagem = useMemo(() => {
    if (carregando) return 'Carregando…';
    if (total === 0) return 'Nenhum evento';
    return `Mostrando ${numeroBr(logs.length)} de ${numeroBr(total)} evento(s)`;
  }, [carregando, total, logs.length]);

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-[1600px] mx-auto">
      {/* ══ Cabeçalho ═══════════════════════════════════════════════════════ */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-foreground flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-primary" />
            Logs do Sistema
            <Badge variant="outline" className="text-[10px] h-5 px-1.5 font-mono">2.0</Badge>
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Trilha de auditoria de tudo que muda no sistema — quem, quando, o que era e o que
            virou.
          </p>
        </div>

        {/* A barra de ações pertence à TRILHA: "ao vivo", troca de vista,
            exportar CSV e retenção não têm significado no monitoramento de uso,
            e deixá-las visíveis ali convidaria a expurgar a trilha achando que
            está mexendo no dado de uso. */}
        {abaInterna === 'trilha' && (
        <div className="flex flex-wrap items-center gap-2">
          {/* Ao vivo */}
          <Button
            variant={aoVivo ? 'default' : 'outline'}
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={() => setAoVivo(!aoVivo)}
            title={
              aoVivo
                ? 'Novos eventos entram no topo automaticamente'
                : 'Ligar para receber novos eventos sem recarregar'
            }
          >
            <Radio className={cn('w-3.5 h-3.5', aoVivo && 'animate-pulse')} />
            Ao vivo
          </Button>

          {/* Alternância de vista */}
          <div className="flex items-center rounded-lg border border-border bg-card p-0.5">
            <button
              type="button"
              onClick={() => setVista('timeline')}
              aria-pressed={vista === 'timeline'}
              title="Linha do tempo"
              className={cn(
                'px-2 h-7 rounded-md transition-colors',
                vista === 'timeline'
                  ? 'bg-secondary text-secondary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <List className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setVista('tabela')}
              aria-pressed={vista === 'tabela'}
              title="Tabela"
              className={cn(
                'px-2 h-7 rounded-md transition-colors',
                vista === 'tabela'
                  ? 'bg-secondary text-secondary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Table2 className="w-3.5 h-3.5" />
            </button>
          </div>

          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={exportar}
            disabled={exportando || total === 0}
          >
            {exportando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            CSV
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={recarregar}
            disabled={carregando}
            title="Recarregar"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', carregando && 'animate-spin')} />
          </Button>

          {isSuperAdmin && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setExpurgoAberto(true)}
            >
              <Trash2 className="w-3.5 h-3.5" /> Retenção
            </Button>
          )}
        </div>
        )}
      </div>

      {/* ══ Abas internas ═══════════════════════════════════════════════════ */}
      {/* Trilha responde "o que mudou"; uso responde "quem está usando". São
          perguntas diferentes sobre dados diferentes — `logs_sistema` registra
          escrita, `uso_telas` registra abertura de tela. Ficam juntas porque a
          trava de acesso é a mesma. */}
      <div className="flex items-center gap-1 border-b border-border">
        {([
          { key: 'trilha', label: 'Trilha de auditoria', Icon: ClipboardList },
          { key: 'uso',    label: 'Monitoramento de uso', Icon: Activity },
        ] as const).map(({ key, label, Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setAbaInterna(key)}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap',
              abaInterna === key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
            )}
          >
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
      </div>

      {abaInterna === 'uso' && (
        empresaDoPainel
          ? <MonitoramentoUso empresaId={empresaDoPainel} />
          : (
            <p className="text-sm text-muted-foreground text-center py-10">
              Selecione uma empresa para ver o monitoramento de uso.
            </p>
          )
      )}

      {abaInterna === 'trilha' && (
      <>
      {/* ══ Painel ══════════════════════════════════════════════════════════ */}
      <LogsPainel
        resumo={resumo}
        carregando={carregandoResumo}
        categoriaAtiva={filtros.categoria}
        severidadeAtiva={filtros.severidade}
        onCategoria={(c) => setFiltro('categoria', c)}
        onSeveridade={(s) => setFiltro('severidade', s)}
        onAcao={(a) => setFiltro('acao', a)}
        onUsuario={(id) => setFiltro('usuarioId', id)}
      />

      {/* ══ Filtros ═════════════════════════════════════════════════════════ */}
      <LogsFiltros
        filtros={filtros}
        opcoes={opcoes}
        filtrosAtivos={filtrosAtivos}
        isSuperAdmin={isSuperAdmin}
        empresas={empresas}
        setFiltro={setFiltro}
        limparFiltros={limparFiltros}
      />

      {/* ══ Lista ═══════════════════════════════════════════════════════════ */}
      <Card className="border-border overflow-hidden">
        {/* Aviso de novos eventos com "ao vivo" desligado: a lista não se move
            sob os olhos de quem investiga, mas também não esconde que chegou
            coisa nova. */}
        {!aoVivo && novosDesdeCarga > 0 && (
          <button
            type="button"
            onClick={recarregar}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-primary/10 hover:bg-primary/15 border-b border-primary/20 text-xs text-primary font-medium transition-colors"
          >
            <ArrowUp className="w-3.5 h-3.5" />
            {numeroBr(novosDesdeCarga)} novo(s) evento(s) desde que esta lista carregou — clique para ver
          </button>
        )}

        {carregando ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-12 rounded-md" />
            ))}
          </div>
        ) : vista === 'timeline' ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }}>
            <LogsTimeline
              logs={logs}
              onAbrir={setSelecionado}
              idDestacado={selecionado?.id ?? null}
            />
          </motion.div>
        ) : (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }}>
            <LogsTabela
              logs={logs}
              onAbrir={setSelecionado}
              idDestacado={selecionado?.id ?? null}
              mostrarEmpresa={mostrarEmpresa}
            />
          </motion.div>
        )}

        {/* Rodapé da lista */}
        <Separator />
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-muted/20">
          <span className="text-[11px] text-muted-foreground">
            {rodapeContagem}
            {atualizadoEm && (
              <span className="text-muted-foreground/60">
                {' · '}atualizado {tempoRelativo(atualizadoEm.toISOString())}
              </span>
            )}
          </span>

          {temMais && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-[11px] gap-1.5"
              onClick={carregarMais}
              disabled={carregandoMais}
            >
              {carregandoMais && <Loader2 className="w-3 h-3 animate-spin" />}
              Carregar mais
            </Button>
          )}
        </div>
      </Card>

      {/* ══ Nota sobre a cobertura ══════════════════════════════════════════ */}
      <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg border border-border bg-muted/20">
        <Info className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          O registro é feito pelo próprio banco de dados, por gatilho: qualquer alteração em
          acordos, usuários, cargos, permissões, metas, setores, equipes, tags, Pix automático,
          lixeira, solicitações de WhatsApp, ouvidoria e configurações entra aqui — independente da
          tela ou do caminho que a fez. Entradas e saídas do sistema, tentativas de acesso
          recusadas, importações e exportações são registradas pela aplicação.{' '}
          <span className="text-foreground">A trilha é somente-acréscimo:</span> nenhum evento pode
          ser editado ou apagado individualmente, nem por administrador.
        </p>
      </div>

      {/* ══ Detalhe ═════════════════════════════════════════════════════════ */}
      <LogDetalhe
        log={selecionado}
        aberto={Boolean(selecionado)}
        onFechar={() => setSelecionado(null)}
        onFiltrarCampo={(campo) => setFiltro('campo', campo)}
        onFiltrarAutor={(id) => setFiltro('usuarioId', id)}
      />

      </>
      )}

      {/* ══ Retenção ════════════════════════════════════════════════════════ */}
      <DialogRetencao
        aberto={expurgoAberto}
        onFechar={() => setExpurgoAberto(false)}
        empresaId={filtros.empresaId ?? tenantEmpresa?.id ?? null}
        empresaNome={
          filtros.empresaId
            ? empresas.find((e) => e.id === filtros.empresaId)?.nome ?? 'a empresa selecionada'
            : tenantEmpresa?.nome ?? 'a empresa atual'
        }
        onConcluido={recarregar}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Retenção
// ═══════════════════════════════════════════════════════════════════════════
/**
 * Apaga eventos ANTIGOS, por idade — não "todos os logs".
 *
 * O botão anterior prometia apagar tudo e não apagava nada; o consumidor da
 * promessa era o próprio administrador, que acreditava ter limpado. Agora o
 * caminho é a RPC `fn_logs_expurgar`, que exige super_admin, recusa retenção
 * abaixo de 30 dias e registra o expurgo na própria trilha.
 *
 * A confirmação é digitada. Para uma ação irreversível sobre a trilha de
 * auditoria, um "OK" acidental é o risco a evitar.
 */
function DialogRetencao({
  aberto, onFechar, empresaId, empresaNome, onConcluido,
}: {
  aberto: boolean;
  onFechar: () => void;
  empresaId: string | null;
  empresaNome: string;
  onConcluido: () => void;
}) {
  /*
   * O campo já vem com a POLÍTICA, não com um número solto.
   *
   * Era `'180'` fixo, de antes de existir política de retenção. Um diálogo que
   * sugere 180 dias quando a política é 730 convida o administrador a apagar
   * ano e meio de trilha sem perceber que está contrariando a decisão.
   */
  const [dias, setDias] = useState(String(RETENCAO_LOGS_DIAS));
  const [confirmacao, setConfirmacao] = useState('');
  const [processando, setProcessando] = useState(false);

  const diasNum = Number(dias);
  const diasValido = Number.isInteger(diasNum) && diasNum >= RETENCAO_LOGS_MINIMA_DIAS;
  const podeExecutar = diasValido && confirmacao.trim().toUpperCase() === 'EXPURGAR' && !processando;

  useEffect(() => {
    if (aberto) {
      setDias(String(RETENCAO_LOGS_DIAS));
      setConfirmacao('');
    }
  }, [aberto]);

  async function executar() {
    setProcessando(true);
    const { removidos, erro } = await expurgarLogs(diasNum, empresaId);
    setProcessando(false);

    if (erro) {
      toast.error(erro);
      return;
    }
    toast.success(
      removidos === 0
        ? `Nenhum evento com mais de ${diasNum} dias — nada foi apagado.`
        : `${numeroBr(removidos)} evento(s) com mais de ${diasNum} dias foram apagados.`,
    );
    onFechar();
    onConcluido();
  }

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="max-w-md" aria-describedby="retencao-desc">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="w-4 h-4 text-destructive" />
            Retenção da trilha de auditoria
          </DialogTitle>
          <DialogDescription id="retencao-desc" className="text-xs">
            Apaga definitivamente os eventos mais antigos que o prazo informado, em{' '}
            <span className="font-medium text-foreground">{empresaNome}</span>. O expurgo é
            irreversível e fica registrado na própria trilha, com o seu nome.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label className="text-xs">Manter os últimos … dias</Label>
            <Input
              type="number"
              min={RETENCAO_LOGS_MINIMA_DIAS}
              value={dias}
              onChange={(e) => setDias(e.target.value)}
              className="h-9 text-sm"
            />
            {!diasValido && (
              <p className="text-[11px] text-destructive">
                O mínimo é 30 dias. Uma trilha de auditoria que se apaga a qualquer momento não
                serve como auditoria.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">
              Digite <span className="font-mono font-bold">EXPURGAR</span> para confirmar
            </Label>
            <Input
              value={confirmacao}
              onChange={(e) => setConfirmacao(e.target.value)}
              placeholder="EXPURGAR"
              className="h-9 text-sm font-mono"
              autoComplete="off"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onFechar} disabled={processando}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            size="sm"
            className="gap-1.5"
            onClick={executar}
            disabled={!podeExecutar}
          >
            {processando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            Expurgar eventos antigos
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
