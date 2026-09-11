/**
 * AbaComissao — a comissão do mês, na tela de Metas.
 *
 * ## Competência própria
 *
 * Cada mês tem os próprios registros. Mês novo começa vazio e nada é copiado
 * sozinho. «Importar configuração de agosto» copia agosto para setembro como
 * linhas novas; depois disso tudo continua editável, e mudar setembro não
 * alcança agosto.
 *
 * ## O que a aba reúne
 *
 *   • o padrão do setor: percentuais das faixas, regra de quando o setor bate a
 *     meta e, na PaguePlay, o modo da meta indireta;
 *   • as exceções por equipe;
 *   • a confirmação da meta do setor, com o mesmo acumulado do card de setor;
 *   • a consulta da comissão de cada operador.
 *
 * A trava da meta do setor vale aqui também: com o setor validado, configurar,
 * importar e mexer em exceção ficam bloqueados. Confirmar a meta continua possível.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { CopyPlus, Lock, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { ehMesAtual } from '@/lib/mesReferencia';
import { configDoOperador, type ConfigComissao } from '@/services/comissao/comissao';
import {
  excluirExcecao, importarMesAnterior, mesAnterior, salvarConfig,
} from '@/services/comissao/comissao.service';
import { lerMetasExtras, type MetaLinhaBruta } from '@/services/comissao/entradaDoOperador';
import { useAcumuladoDoSetorNoMes } from '@/services/comissao/useAcumuladoDoSetorNoMes';
import { useConfigsComissao } from '@/services/comissao/useConfigsComissao';
import { lerMetaIndiretaDaLinha } from '@/services/metas/metaIndireta';
import {
  buscarRecebimentoIndireto, type MapaRecebimentoIndireto,
} from '@/services/metas/recebimentoIndireto.service';
import { FormConfigComissao } from './FormConfigComissao';
import { ListaComissaoOperadores, type OperadorComissao } from './ListaComissaoOperadores';
import { MetaDoSetorComissao } from './MetaDoSetorComissao';
import { payloadDe, rascunhoParaExcecao } from './rascunhoConfig';

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

export interface AbaComissaoProps {
  empresaId: string;
  setorId: string;
  setorNome: string;
  ano: number;
  /** 1 a 12. */
  mes: number;
  isPaguePlay: boolean;
  /** A meta do setor está validada neste mês. */
  metaTravada: boolean;
  equipes: { id: string; nome: string }[];
  operadores: OperadorComissao[];
  /** As linhas de `metas` do mês (operadores e setor), cruas. */
  metas: MetaLinhaBruta[];
}

function Secao({ titulo, descricao, children }: { titulo: string; descricao?: string; children: ReactNode }) {
  return (
    <Card className="border border-border shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{titulo}</CardTitle>
        {descricao && <CardDescription className="text-xs">{descricao}</CardDescription>}
      </CardHeader>
      <CardContent className="pt-0">{children}</CardContent>
    </Card>
  );
}

export function AbaComissao({
  empresaId, setorId, setorNome, ano, mes, isPaguePlay, metaTravada, equipes, operadores, metas,
}: AbaComissaoProps) {
  const { temPermissao } = useCargoPermissoes();
  const podeEditar = temPermissao('metas_comissao_editar');
  const podeConfirmar = temPermissao('metas_comissao_confirmar_setor');

  const mesISO = `${ano}-${String(mes).padStart(2, '0')}`;
  const anterior = mesAnterior(ano, mes);
  const nomeMes = MESES[mes - 1];
  const nomeMesAnterior = MESES[anterior.mes - 1];

  const atual = useConfigsComissao({ empresaId, ano, mes, ativo: true });
  const doMesAnterior = useConfigsComissao({ empresaId, ano: anterior.ano, mes: anterior.mes, ativo: true });
  const setor = useAcumuladoDoSetorNoMes({ empresaId, mes: mesISO, setorId, isPaguePlay, ativo: true });

  const [importando, setImportando] = useState(false);
  const [perguntarSubstituicao, setPerguntarSubstituicao] = useState(false);
  const [removendo, setRemovendo] = useState<ConfigComissao | null>(null);
  const [indiretos, setIndiretos] = useState<MapaRecebimentoIndireto>({});

  const doSetor = atual.configs.filter(c => c.setorId === setorId);
  const padrao = doSetor.find(c => c.equipeId === null) ?? null;
  const excecoes = doSetor.filter(c => c.equipeId !== null);
  const temMesAnterior = doMesAnterior.configs.some(c => c.setorId === setorId);
  const bloqueado = !podeEditar || metaTravada;

  const nomeDaEquipe = (id: string | null) => equipes.find(e => e.id === id)?.nome ?? 'Equipe';
  const equipesSemExcecao = equipes.filter(e => !excecoes.some(x => x.equipeId === e.id));

  const metaDoSetor = Number(
    metas.find(m => m.tipo === 'setor' && m.referencia_id === setorId)?.meta_valor,
  ) || null;

  // ── Recebimento indireto [PP]: só de quem tem meta indireta ligada ─────────
  const alvosIndireto = useMemo(() => {
    if (!isPaguePlay) return '';
    const ids = new Set(operadores.map(o => o.id));
    return metas
      .filter(m => m.tipo === 'operador' && m.referencia_id && ids.has(m.referencia_id)
        && lerMetaIndiretaDaLinha(m) !== null)
      .map(m => m.referencia_id as string)
      .sort()
      .join(',');
  }, [isPaguePlay, operadores, metas]);

  useEffect(() => {
    if (!alvosIndireto) { setIndiretos({}); return; }
    let vivo = true;
    void buscarRecebimentoIndireto({ empresaId, mes: mesISO, operadores: alvosIndireto.split(',') })
      .then(m => { if (vivo) setIndiretos(m); });
    return () => { vivo = false; };
  }, [empresaId, mesISO, alvosIndireto]);

  // ── Quem tem mais metas do que faixas com percentual ──────────────────────
  const alemDasFaixas = useMemo(() => {
    const metaDe = new Map(metas.filter(m => m.tipo === 'operador').map(m => [m.referencia_id, m]));
    return operadores.filter(op => {
      if (op.setorOrigemId !== setorId) return false;
      const meta = metaDe.get(op.id);
      if (!meta || !(Number(meta.meta_valor) > 0)) return false;
      const { config } = configDoOperador({
        configs: atual.configs, setorId: op.setorOrigemId, equipeId: op.equipeOrigemId,
      });
      return !!config && 1 + lerMetasExtras(meta.metas_extras).length > config.faixas.length;
    }).length;
  }, [metas, operadores, setorId, atual.configs]);

  async function importar(substituir: boolean) {
    setImportando(true);
    const r = await importarMesAnterior({ empresaId, setorId, ano, mes, substituir });
    setImportando(false);
    setPerguntarSubstituicao(false);
    if (!r.ok) {
      toast.error('A configuração não foi importada', { description: r.erro });
      return;
    }
    toast.success(`Configuração de ${nomeMesAnterior} importada para ${nomeMes}. Ajuste o que mudou.`);
    atual.recarregar();
  }

  async function criarExcecao(equipeId: string) {
    const payload = payloadDe(rascunhoParaExcecao(padrao), { empresaId, setorId, equipeId, ano, mes });
    if (!payload) {
      toast.warning('Complete os percentuais do padrão antes de criar uma exceção.');
      return;
    }
    const r = await salvarConfig(payload);
    if (!r.ok) {
      toast.error('A exceção não foi criada', { description: r.erro });
      return;
    }
    toast.success(`Exceção de ${nomeDaEquipe(equipeId)} criada com os percentuais do padrão. Ajuste abaixo.`);
    atual.recarregar();
  }

  async function remover(config: ConfigComissao) {
    const r = await excluirExcecao(config.id);
    setRemovendo(null);
    if (!r.ok) {
      toast.error('A exceção não foi removida', { description: r.erro });
      return;
    }
    toast.success(`${nomeDaEquipe(config.equipeId)} voltou ao padrão do setor.`);
    atual.recarregar();
  }

  if (!atual.dbAtiva) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          A comissão ainda não está disponível: o banco precisa receber a atualização da comissão por meta.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Cabeçalho do mês ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold">{`Comissão de ${nomeMes}/${ano}`}</h2>
          <p className="text-xs text-muted-foreground">
            {`${setorNome} · faixas medidas em ${isPaguePlay ? 'H.O.' : 'bruto'}`}
          </p>
        </div>
        {podeEditar && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={!temMesAnterior || metaTravada || importando}
            title={!temMesAnterior ? `${nomeMesAnterior} não tem configuração neste setor` : undefined}
            onClick={() => (doSetor.length > 0 ? setPerguntarSubstituicao(true) : void importar(false))}
          >
            <CopyPlus className="h-3.5 w-3.5" aria-hidden="true" />
            {`Importar configuração de ${nomeMesAnterior}`}
          </Button>
        )}
      </div>

      {metaTravada && (
        <div role="status" className="flex items-start gap-2 rounded-lg border border-emerald-600/30 bg-emerald-600/10 px-3 py-2 text-xs">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden="true" />
          <span>
            Meta do setor validada neste mês: a configuração da comissão está bloqueada até a
            validação ser reaberta. Confirmar a meta do setor continua possível.
          </span>
        </div>
      )}

      {atual.carregado && !padrao && (
        <p className="rounded-lg border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
          {`A comissão de ${nomeMes} ainda não foi configurada. Preencha o padrão do setor abaixo${
            temMesAnterior ? ` ou importe ${nomeMesAnterior} como ponto de partida` : ''}.`}
        </p>
      )}

      {/* ── Padrão do setor ──────────────────────────────────────────────── */}
      <Secao titulo="Padrão do setor" descricao="Vale para todas as equipes do setor, menos as que têm exceção.">
        <FormConfigComissao
          key={`padrao-${padrao?.id ?? 'novo'}-${mesISO}`}
          config={padrao}
          alvo={{ empresaId, setorId, equipeId: null, ano, mes }}
          ehPadrao
          isPaguePlay={isPaguePlay}
          regraDoSetor={padrao?.regraSetor ?? 'nenhuma'}
          desabilitado={bloqueado}
          onSalvo={atual.recarregar}
        />
        {alemDasFaixas > 0 && (
          <p className="mt-3 text-xs text-amber-700 dark:text-amber-400">
            {`${alemDasFaixas} ${alemDasFaixas === 1 ? 'operador tem' : 'operadores têm'} mais metas do que faixas com % neste mês — as faixas sem % não pagam comissão.`}
          </p>
        )}
      </Secao>

      {/* ── Exceções por equipe ──────────────────────────────────────────── */}
      {padrao && (
        <Secao
          titulo="Exceções por equipe"
          descricao="Equipes com percentuais próprios. Quando o setor bate a meta, vale a regra do padrão."
        >
          <div className="space-y-2">
            {excecoes.length === 0 && (
              <p className="text-xs text-muted-foreground">Nenhuma equipe com exceção neste mês.</p>
            )}
            {excecoes.map(ex => (
              <details key={ex.id} className="group rounded-lg border border-border">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm font-medium">
                  {nomeDaEquipe(ex.equipeId)}
                  {!bloqueado && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 gap-1 text-xs text-muted-foreground"
                      onClick={e => { e.preventDefault(); setRemovendo(ex); }}
                    >
                      <Undo2 className="h-3.5 w-3.5" aria-hidden="true" /> Voltar ao padrão
                    </Button>
                  )}
                </summary>
                <div className="border-t border-border px-3 py-3">
                  <FormConfigComissao
                    key={ex.id}
                    config={ex}
                    alvo={{ empresaId, setorId, equipeId: ex.equipeId, ano, mes }}
                    ehPadrao={false}
                    isPaguePlay={isPaguePlay}
                    regraDoSetor={padrao.regraSetor}
                    desabilitado={bloqueado}
                    onSalvo={atual.recarregar}
                  />
                </div>
              </details>
            ))}
            {!bloqueado && equipesSemExcecao.length > 0 && (
              <Select value="" onValueChange={v => void criarExcecao(v)}>
                <SelectTrigger className="h-8 w-64 text-xs" aria-label="Criar exceção para uma equipe">
                  <SelectValue placeholder="+ Exceção para uma equipe" />
                </SelectTrigger>
                <SelectContent>
                  {equipesSemExcecao.map(e => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>
        </Secao>
      )}

      {/* ── Meta do setor ────────────────────────────────────────────────── */}
      {padrao && padrao.regraSetor !== 'nenhuma' && (
        <Secao
          titulo="Meta do setor"
          descricao="Confirmar liga o benefício da comissão para os operadores do setor neste mês."
        >
          <MetaDoSetorComissao
            empresaId={empresaId}
            setorId={setorId}
            ano={ano}
            mes={mes}
            metaDoSetor={metaDoSetor}
            acumulado={setor.acumulado}
            carregando={!setor.carregado}
            doSetor={padrao}
            podeConfirmar={podeConfirmar}
            onMudou={atual.recarregar}
          />
        </Secao>
      )}

      {/* ── Comissão dos operadores ──────────────────────────────────────── */}
      <Secao
        titulo="Comissão dos operadores"
        descricao={`Com as regras de ${nomeMes}/${ano}. Clique numa pessoa para ver a progressão das faixas.`}
      >
        <ListaComissaoOperadores
          operadores={operadores}
          equipes={equipes}
          metas={metas}
          resumos={setor.resumos}
          indiretos={indiretos}
          configs={atual.configs}
          isPaguePlay={isPaguePlay}
          mes={mesISO}
          mesFechado={!ehMesAtual(mesISO)}
          carregando={!setor.carregado || !atual.carregado}
        />
      </Secao>

      <AlertDialog open={perguntarSubstituicao} onOpenChange={setPerguntarSubstituicao}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{`Substituir a comissão de ${nomeMes}?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {`${nomeMes[0].toUpperCase()}${nomeMes.slice(1)} já tem configuração neste setor. Importar apaga o padrão e as exceções de ${nomeMes} e copia os de ${nomeMesAnterior}. ${nomeMesAnterior[0].toUpperCase()}${nomeMesAnterior.slice(1)} não muda.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={importando} onClick={() => void importar(true)}>
              {`Substituir por ${nomeMesAnterior}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={removendo !== null} onOpenChange={aberto => { if (!aberto) setRemovendo(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{`${nomeDaEquipe(removendo?.equipeId ?? null)} volta ao padrão?`}</AlertDialogTitle>
            <AlertDialogDescription>
              Os percentuais próprios desta equipe neste mês são apagados, e ela passa a usar o padrão do setor.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (removendo) void remover(removendo); }}>
              Voltar ao padrão
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
