/**
 * ValidacaoRelatorioSetor — botão "Validar [setor]" da Fase 1 de validação.
 * Só admin/super_admin vê. Valida Analítico + Diário de uma vez (o caso comum);
 * cada um aparece com o próprio status pois no PaguePlay são imports separados
 * e podem divergir (ex.: esqueceram de importar o diário daquele mês).
 */
import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Loader2, ShieldCheck, Unlock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  getStatusValidacaoRelatorio, validarRelatorioSetor, reabrirRelatorioSetor,
  statusOrigemLabel, type StatusOrigem,
} from '@/services/relatorio/relatorioValidacao.service';

interface Props {
  empresaId: string;
  setorId: string | null;
  setorNome: string;
  /** 'yyyy-MM' */
  mes: string;
}

const LABELS: Record<ReturnType<typeof statusOrigemLabel>, { texto: string; cor: string }> = {
  sem_dados: { texto: 'sem dados no mês', cor: 'text-muted-foreground' },
  pendente:  { texto: 'pendente',          cor: 'text-amber-600' },
  parcial:   { texto: 'parcial',           cor: 'text-amber-600' },
  validado:  { texto: 'validado',          cor: 'text-emerald-600' },
};

export function ValidacaoRelatorioSetor({ empresaId, setorId, setorNome, mes }: Props) {
  const [status, setStatus]       = useState<StatusOrigem[]>([]);
  const [erro, setErro]           = useState<string | null>(null);
  const [loading, setLoading]     = useState(false);
  const [emCurso, setEmCurso]     = useState(false);
  const [mostrarReabrir, setMostrarReabrir] = useState(false);
  const [motivo, setMotivo]       = useState('');

  const [anoStr, mesStr] = mes.split('-');
  const ano = Number(anoStr);
  const mesNum = Number(mesStr);

  const fetchStatus = useCallback(async () => {
    if (!empresaId || !setorId) { setStatus([]); setErro(null); return; }
    setLoading(true);
    const r = await getStatusValidacaoRelatorio(empresaId, setorId, mesNum, ano);
    setStatus(r.status);
    setErro(r.erro);
    setLoading(false);
  }, [empresaId, setorId, mesNum, ano]);

  useEffect(() => { void fetchStatus(); }, [fetchStatus]);

  if (!setorId) return null;

  const analitico = status.find(s => s.origem === 'analitico');
  const diario    = status.find(s => s.origem === 'diario');
  // Só considera origens que TÊM dado no mês — "sem dados" não é "validado".
  const relevantes = [analitico, diario].filter((s): s is StatusOrigem => !!s && s.diasComDado > 0);
  const semDado      = relevantes.length === 0;
  const tudoValidado = !semDado && relevantes.every(s => statusOrigemLabel(s) === 'validado');

  async function handleValidar() {
    if (!empresaId || !setorId) return;
    setEmCurso(true);
    const { ok, erro } = await validarRelatorioSetor(empresaId, setorId, mesNum, ano);
    setEmCurso(false);
    if (!ok) { toast.error(erro === 'sem_permissao' ? 'Sem permissão para validar.' : 'Erro ao validar relatório.'); return; }
    toast.success(`Relatório de ${setorNome} validado com sucesso.`);
    await fetchStatus();
  }

  async function handleReabrir() {
    if (!empresaId || !setorId) return;
    if (!motivo.trim()) { toast.warning('Informe o motivo da reabertura.'); return; }
    setEmCurso(true);
    const { ok, erro } = await reabrirRelatorioSetor(empresaId, setorId, mesNum, ano, motivo.trim());
    setEmCurso(false);
    if (!ok) { toast.error(erro === 'motivo_obrigatorio' ? 'Informe o motivo.' : 'Erro ao reabrir.'); return; }
    toast.success('Validação do relatório removida.');
    setMostrarReabrir(false);
    setMotivo('');
    await fetchStatus();
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="font-medium text-foreground shrink-0">Validação do relatório — {setorNome}:</span>
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        ) : erro ? (
          <span className="text-destructive font-mono">{erro}</span>
        ) : (
          <>
            {analitico && (
              <span className={cn('shrink-0', LABELS[statusOrigemLabel(analitico)].cor)}>
                Analítico {analitico.diasValidados}/{analitico.diasComDado} dias {LABELS[statusOrigemLabel(analitico)].texto}
              </span>
            )}
            {diario && (
              <span className={cn('shrink-0', LABELS[statusOrigemLabel(diario)].cor)}>
                Diário {diario.diasValidados}/{diario.diasComDado} dias {LABELS[statusOrigemLabel(diario)].texto}
              </span>
            )}
          </>
        )}
        <div className="ml-auto flex items-center gap-2">
          {semDado ? (
            <span className="text-muted-foreground">sem recebimento importado ainda</span>
          ) : tudoValidado ? (
            !mostrarReabrir && (
              <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => setMostrarReabrir(true)}>
                <Unlock className="h-3.5 w-3.5" /> Reabrir
              </Button>
            )
          ) : (
            <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" disabled={emCurso} onClick={handleValidar}>
              <ShieldCheck className="h-3.5 w-3.5" /> Validar {setorNome}
            </Button>
          )}
          {tudoValidado && !semDado && !mostrarReabrir && (
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          )}
        </div>
      </div>
      {mostrarReabrir && (
        <div className="flex items-center gap-2">
          <Input
            className="h-7 text-xs flex-1"
            placeholder="Motivo da reabertura (obrigatório)"
            value={motivo}
            onChange={e => setMotivo(e.target.value)}
          />
          <Button size="sm" className="h-7 text-xs" disabled={emCurso || !motivo.trim()} onClick={handleReabrir}>
            Confirmar
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setMostrarReabrir(false); setMotivo(''); }}>
            Cancelar
          </Button>
        </div>
      )}
    </div>
  );
}
