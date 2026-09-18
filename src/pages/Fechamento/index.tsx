/**
 * Fechamento — a planilha de fechamento da gerência, como aba do Gestão.
 *
 * ## O que a gerência faz aqui
 *
 * Informa DUAS coisas por operador: os dias úteis trabalhados e a situação no
 * fechamento. Todo o resto — fechamento, meta, meta atingida, alcance, quartil,
 * médias, cards e gráficos — vem do que o Gestão já sabe e se recalcula sozinho
 * quando o Analítico muda. As fórmulas estão em `calculoFechamento.ts`, cada uma
 * com a célula da planilha que ela reproduz.
 *
 * ## O que esta aba NÃO mexe
 *
 * A situação daqui não é `perfis.situacao`: não bloqueia login, não tira do
 * ranking, não muda o quartil nem o cadastro. Metas e quartis são lidos, nunca
 * gravados. A única escrita é `fn_fechamento_salvar`, em `fechamento_operadores`.
 *
 * ## Quem vê o quê
 *
 * `ver_fechamento` abre a aba; os níveis `setor` e `todos_setores` decidem o
 * recorte, como no Painel Líder; `fechamento_editar` libera as duas colunas. A
 * RLS (`fn_fechamento_alcanca`) cumpre o mesmo recorte no banco.
 *
 * ## Premiações e Comissões (18/09/2026)
 *
 * A segunda aba (`?aba=premiacoes`) é o relatório de pagamento: crachá, setor e
 * a premiação (Birigui) ou comissão (Marília) de quem bateu. Usa o mesmo mês,
 * o mesmo setor em foco e o mesmo alcance desta página. Ver `PremiacoesComissoes`.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ClipboardCheck, Building2, RefreshCw, Wallet, CalendarDays, Users, TriangleAlert, Info,
  FileSpreadsheet, FileCode2, Loader2, Award,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { KpiTile } from '@/components/KpiTile';
import { AbasSegmentadas, type AbaSegmentada } from '@/components/AbasSegmentadas';
import { SeletorMes } from '@/components/AnalyticsPanel/SeletorMes';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { useFechamentoOperadores } from '@/hooks/useFechamentoOperadores';
import { useTenant } from '@/lib/tenant-config';
import { useMesGlobal } from '@/providers/MesProvider';
import { niveisLiberados } from '@/lib/permissoes-escopo';
import { supabase } from '@/lib/supabase';
import { aplicarOrdemSetores } from '@/lib/setores-ordem';
import { formatBRL } from '@/lib/money';
import { ehMesAtual, rotuloDoMes } from '@/lib/mesReferencia';
import { cn } from '@/lib/utils';
import type { ManualFechamento } from '@/services/fechamentoOperadores/fechamentoOperadores.service';
import {
  baixarFechamentoOperadores, type FormatoFechamento,
} from '@/services/fechamentoOperadores/baixarFechamentoOperadores';
import { TabelaFechamento } from './TabelaFechamento';
import { GraficosFechamento } from './GraficosFechamento';
import { PremiacoesComissoes } from './PremiacoesComissoes';

/** O `Select` do shadcn recusa `value=""`; o "todos" precisa de um valor. */
const TODOS_SETORES = '__todos__';

type AbaFechamento = 'fechamento' | 'premiacoes';

const ABAS: readonly AbaSegmentada<AbaFechamento>[] = [
  { key: 'fechamento', label: 'Fechamento', Icon: ClipboardCheck },
  { key: 'premiacoes', label: 'Premiações e Comissões', Icon: Award },
];

function Aviso({ tom, children }: { tom: 'alerta' | 'info'; children: React.ReactNode }) {
  const Icone = tom === 'alerta' ? TriangleAlert : Info;
  return (
    <div className={cn(
      'flex items-start gap-2 rounded-xl border px-3 py-2 text-[12px]',
      tom === 'alerta'
        ? 'border-amber-500/40 bg-amber-500/5 text-foreground'
        : 'border-border bg-muted/30 text-muted-foreground',
    )}>
      <Icone className={cn('mt-0.5 h-4 w-4 shrink-0',
        tom === 'alerta' ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground')} aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export default function PaginaFechamento() {
  // ── Todos os hooks ANTES de qualquer return condicional ──────────────────
  const { perfil }  = useAuth();
  const { empresa } = useEmpresa();
  const tenant      = useTenant();
  const { temPermissao, loading: carregandoPermissoes } = useCargoPermissoes();
  const { mes, setMes } = useMesGlobal();

  const niveis        = niveisLiberados('fechamento', temPermissao);
  const veTodosSetores = niveis.includes('todos_setores');
  const veSetor        = niveis.includes('setor');
  const podeEditar     = temPermissao('fechamento_editar');
  const setorProprio   = perfil?.setor_id ?? null;

  const [setores, setSetores] = useState<{ id: string; nome: string }[]>([]);
  const [filtroSetorId, setFiltroSetorId] = useState<string | null>(null);

  // A aba fica na URL: recarregar a página ou mandar o link abre na mesma.
  const [params, setParams] = useSearchParams();
  const aba: AbaFechamento = params.get('aba') === 'premiacoes' ? 'premiacoes' : 'fechamento';
  const trocarAba = useCallback((k: AbaFechamento) => {
    setParams(p => {
      const n = new URLSearchParams(p);
      if (k === 'fechamento') n.delete('aba'); else n.set('aba', k);
      return n;
    }, { replace: true });
  }, [setParams]);

  /*
   * O setor em foco. Quem enxerga todos escolhe (e começa em «todos»); quem
   * enxerga só o próprio fica nele. Sem nível nenhum, nada é buscado.
   */
  const setorEmFoco = veTodosSetores ? filtroSetorId : setorProprio;
  const temAlcance  = veTodosSetores || (veSetor && !!setorProprio);

  const fechamento = useFechamentoOperadores({
    empresaId: empresa?.id ?? null,
    mes,
    setorId: setorEmFoco,
    // Na aba de premiações a tabela do fechamento não aparece: não busca.
    ativo: !tenant.isPaguePlay && temAlcance && aba === 'fechamento',
  });

  useEffect(() => {
    if (!empresa?.id) return;
    let cancelado = false;
    void supabase
      .from('setores')
      .select('id, nome')
      .eq('empresa_id', empresa.id)
      .order('nome')
      .then(({ data }) => {
        if (cancelado) return;
        setSetores(aplicarOrdemSetores((data as { id: string; nome: string }[]) ?? [], empresa.id));
      });
    return () => { cancelado = true; };
  }, [empresa?.id]);

  const { salvar } = fechamento;
  const aoSalvar = useCallback((operadorId: string, manual: ManualFechamento) => {
    void salvar(operadorId, manual).then(r => {
      if (!r.ok) toast.error('Não foi possível salvar o fechamento', { description: r.erro ?? undefined });
    });
  }, [salvar]);

  const aoInvalido = useCallback((mensagem: string) => { toast.error(mensagem); }, []);

  const [baixando, setBaixando] = useState<FormatoFechamento | null>(null);
  const nomeDoSetorEmFoco = setores.find(s => s.id === setorEmFoco)?.nome;
  const nomesDosSetores = useMemo(() => new Map(setores.map(s => [s.id, s.nome])), [setores]);
  const baixar = useCallback(async (formato: FormatoFechamento) => {
    if (!empresa?.id) return;
    setBaixando(formato);
    const r = await baixarFechamentoOperadores({
      empresaNome: empresa.nome ?? '',
      // Sem setor em foco é «todos» — e quem só vê o próprio sempre tem foco.
      setorNome: setorEmFoco ? (nomeDoSetorEmFoco ?? 'Setor') : null,
      mes,
      mesRotulo: rotuloDoMes(mes),
      parcial: ehMesAtual(mes),
      geradoEm: new Date(),
      linhas: fechamento.linhas,
      resumo: fechamento.resumo,
    }, formato, empresa.id);
    setBaixando(null);
    if (!r.ok) toast.error('Não foi possível gerar o arquivo', { description: r.erro });
  }, [empresa?.id, empresa?.nome, setorEmFoco, nomeDoSetorEmFoco, mes, fechamento.linhas, fechamento.resumo]);

  // ── Guards (após todos os hooks) ─────────────────────────────────────────
  if (tenant.isPaguePlay) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        Esta seção não está disponível para esta empresa.
      </div>
    );
  }

  if (!empresa?.id || !perfil?.id) return null;

  const { linhas, resumo, carregando, atualizando, erro } = fechamento;
  const noMesAtual = ehMesAtual(mes);
  const nomeDoSetor = nomeDoSetorEmFoco;
  const preenchidos = linhas.filter(l => l.duTrabalhado !== null && l.situacao !== null).length;

  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto space-y-5">

      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <ClipboardCheck className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold text-foreground">Fechamento</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {aba === 'fechamento' ? 'Fechamento mensal por operador' : 'Premiações e comissões por pessoa'} · {rotuloDoMes(mes)}
            </p>
          </div>
        </div>
        {aba === 'fechamento' && (
          <div className="flex flex-wrap items-center gap-2">
            {/* Baixar: a mesma tabela e os mesmos cards da tela, na mesma ordem.
                Quem vê a aba baixa — o arquivo não traz nada além do que está
                aqui. Ver `exportarFechamento.ts`. */}
            {(['xlsx', 'html'] as const).map(formato => (
              <Button
                key={formato}
                variant="outline" size="sm" className="h-8 gap-1.5 text-xs"
                onClick={() => void baixar(formato)}
                disabled={carregando || !temAlcance || linhas.length === 0 || baixando !== null}
              >
                {baixando === formato
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : formato === 'xlsx'
                    ? <FileSpreadsheet className="h-3.5 w-3.5" />
                    : <FileCode2 className="h-3.5 w-3.5" />}
                {formato === 'xlsx' ? 'Baixar Excel' : 'Baixar HTML'}
              </Button>
            ))}
            <Button
              variant="outline" size="sm" className="h-8 gap-1.5 text-xs"
              onClick={() => void fechamento.recarregar()}
              disabled={carregando || atualizando || !temAlcance}
            >
              <RefreshCw className={cn('h-3.5 w-3.5', atualizando && 'animate-spin')} />
              Atualizar
            </Button>
          </div>
        )}
      </div>

      <AbasSegmentadas abas={ABAS} ativa={aba} onTrocar={trocarAba} rotulo="Seção do Fechamento" />

      {/* Mês + setor */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/30 px-2 py-1">
          <SeletorMes mes={mes} onChange={setMes} desabilitado={aba === 'fechamento' && carregando && temAlcance} />
        </div>

        {veTodosSetores && setores.length > 0 && (
          <div className="flex items-center gap-2">
            <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <Select
              value={filtroSetorId ?? TODOS_SETORES}
              onValueChange={v => setFiltroSetorId(v === TODOS_SETORES ? null : v)}
            >
              <SelectTrigger className="h-8 w-48 rounded-lg text-xs">
                <SelectValue placeholder="Todos os setores" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS_SETORES}>Todos os setores</SelectItem>
                {setores.map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {!veTodosSetores && veSetor && setorProprio && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/40 border border-border px-3 py-1.5 rounded-lg">
            <Building2 className="w-3.5 h-3.5" />
            {nomeDoSetor ?? 'Meu setor'}
          </span>
        )}
      </div>

      {/* Sem alcance: dizer o motivo é melhor do que uma página em branco. */}
      {!carregandoPermissoes && !temAlcance && (
        <div className="p-6 text-center text-sm text-muted-foreground border border-dashed border-border rounded-xl">
          {veSetor && !setorProprio
            ? 'Seu usuário não está em nenhum setor, e o alcance do Fechamento liberado para o seu cargo é o do próprio setor.'
            : 'Nenhum alcance de dados está liberado para o seu cargo no Fechamento.'}
        </div>
      )}

      {temAlcance && aba === 'premiacoes' && (
        <PremiacoesComissoes
          empresaId={empresa.id}
          empresaNome={empresa.nome ?? ''}
          mes={mes}
          setorId={setorEmFoco}
          setorNome={setorEmFoco ? (nomeDoSetor ?? 'Setor') : null}
          nomesDosSetores={nomesDosSetores}
          podeEditar={podeEditar}
        />
      )}

      {temAlcance && aba === 'fechamento' && (
        <>
          {!fechamento.manuaisDisponivel && (
            <Aviso tom="alerta">
              <strong>D.U. trabalhado e situação ainda não podem ser salvos</strong> — a estrutura
              do Fechamento não foi instalada neste banco. Os valores do Analítico aparecem normalmente.
            </Aviso>
          )}
          {erro && fechamento.manuaisDisponivel && (
            <Aviso tom="alerta">Parte dos dados não pôde ser lida: {erro}</Aviso>
          )}
          {noMesAtual && (
            <Aviso tom="info">
              {rotuloDoMes(mes)} ainda está aberto: o fechamento é parcial, e o quartil segue o
              ritmo até hoje, como no Analítico.
            </Aviso>
          )}
          {!fechamento.temConfig && (
            <Aviso tom="info">
              Quartis e feriados não foram configurados em Metas para este mês — valem as faixas padrão.
            </Aviso>
          )}

          {/* Os cards da planilha */}
          {carregando ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-[78px] rounded-xl" />)}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <KpiTile
                rotulo="Faturamento total"
                valor={formatBRL(resumo.faturamentoTotal)}
                valorNumerico={resumo.faturamentoTotal}
                formatar={formatBRL}
                sub="Fechamento de quem tem situação, sem licença e férias"
                Icon={Wallet}
                tom="primario"
              />
              <KpiTile
                rotulo="Média por dia útil"
                valor={resumo.mediaPorDiaUtil !== null ? formatBRL(resumo.mediaPorDiaUtil) : '—'}
                sub="Soma dos fechamentos ÷ média de D.U. trabalhado"
                Icon={CalendarDays}
                tom="neutro"
              />
              <KpiTile
                rotulo="Média por funcionário"
                valor={resumo.mediaPorFuncionario !== null ? formatBRL(resumo.mediaPorFuncionario) : '—'}
                sub={`Faturamento total ÷ ${resumo.comSituacao} com situação`}
                Icon={Users}
                tom="neutro"
              />
              <KpiTile
                rotulo="Preenchidos"
                valor={`${preenchidos} de ${linhas.length}`}
                sub="Operadores com D.U. e situação informados"
                Icon={ClipboardCheck}
                tom={linhas.length > 0 && preenchidos === linhas.length ? 'sucesso' : 'alerta'}
              />
            </div>
          )}

          {/* A tabela */}
          {carregando ? (
            <div className="space-y-2 animate-pulse">
              {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-9 bg-muted rounded-lg" />)}
            </div>
          ) : linhas.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground border border-dashed border-border rounded-xl">
              Nenhum operador {setorEmFoco ? `em ${nomeDoSetor ?? 'este setor'}` : 'nesta empresa'} em {rotuloDoMes(mes)}.
            </div>
          ) : (
            <div className={cn('space-y-2 transition-opacity', atualizando && 'opacity-80')}>
              {!podeEditar && (
                <p className="text-[11px] text-muted-foreground">
                  Somente leitura — preencher D.U. e situação depende da permissão
                  «Fechamento: preencher D.U. e situação».
                </p>
              )}
              <TabelaFechamento
                linhas={linhas}
                podeEditar={podeEditar && fechamento.manuaisDisponivel}
                salvandoId={fechamento.salvandoId}
                onSalvar={aoSalvar}
                onInvalido={aoInvalido}
              />
            </div>
          )}

          {/* Os gráficos da planilha */}
          {!carregando && linhas.length > 0 && <GraficosFechamento resumo={resumo} />}
        </>
      )}
    </div>
  );
}
