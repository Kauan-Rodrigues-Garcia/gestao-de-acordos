/**
 * CardDiasUteisSetor — os dias úteis do setor em tela, na aba Metas.
 *
 * O mês tem a configuração GERAL (o cartão «Dias úteis do mês», ao lado). O
 * setor que trabalha diferente liga aqui a exceção dele: feriados e «contar o
 * dia de hoje» próprios. Ver `lib/diasUteisDoSetor.ts`.
 *
 * Ligar a exceção COPIA a configuração geral e grava na hora: o setor parte
 * do calendário de todo mundo e tira ou põe dias. Daí em diante grava sozinho,
 * 800 ms depois da última mexida — o mesmo gatilho do cartão geral. «Voltar a
 * seguir a geral» apaga a linha do setor.
 *
 * O componente é montado de novo a cada leitura da config (a `key` vem de
 * quem usa): o rascunho nasce do banco e não precisa ser reconciliado com ele.
 *
 * `automatico` (22/10/2026): quem não é da gestão (super admin, administrador)
 * vê só este cartão, no lugar do geral. Não há botão «trabalha diferente»:
 * marcar «contar o dia de hoje» já grava a exceção do setor, e voltar a ficar
 * igual à geral apaga a exceção sozinho. Os feriados aparecem, mas só a gestão
 * os muda («até segunda ordem») — inclusive os de uma exceção que ela criou.
 */
import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Loader2, Plus, Undo2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { diasUteisDecorridos, diasUteisDoMes } from '@/lib/diasUteis';
import type { DiasUteisSetor } from '@/lib/diasUteisDoSetor';
import { getTodayISO } from '@/lib/index';
import { cn } from '@/lib/utils';
import {
  removerDiasUteisSetor, upsertDiasUteisSetor,
} from '@/services/metas/metasConfig.service';

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

interface Regua {
  feriados: string[];
  contarDiaAtual: boolean;
}

interface Props {
  empresaId: string;
  perfilId: string;
  setorId: string;
  setorNome: string;
  mes: number;
  ano: number;
  /** A configuração geral do mês, como está na tela agora. */
  geral: Regua;
  /** A exceção gravada do setor. `null` = segue a geral. */
  excecao: DiasUteisSetor | null;
  /** Avisa quem guarda o mapa de exceções: gravou (ou apagou, com `null`). */
  onExcecao: (setorId: string, excecao: DiasUteisSetor | null) => void;
  podeEditar: boolean;
  podeExcluir: boolean;
  /** `useFechamentoMes().impedir` — mês fechado não muda. */
  impedir: (acao?: string) => boolean;
  /** Mexer já vira exceção do setor; igual à geral, a exceção some. Ver o topo. */
  automatico?: boolean;
  className?: string;
}

const dataBR = (iso: string) => iso.split('-').reverse().join('/');
const chave = (r: Regua) => `${r.contarDiaAtual}|${[...r.feriados].sort().join(',')}`;

export function CardDiasUteisSetor({
  empresaId, perfilId, setorId, setorNome, mes, ano, geral, excecao, onExcecao,
  podeEditar, podeExcluir, impedir, automatico = false, className,
}: Props) {
  const podeMexerFeriados = podeEditar && !automatico;
  const copiaDaGeral = (): Regua => ({ feriados: [...geral.feriados].sort(), contarDiaAtual: geral.contarDiaAtual });
  const inicial: Regua | null = excecao
    ? { feriados: [...excecao.feriados].sort(), contarDiaAtual: excecao.contar_dia_atual }
    : null;
  const [original, setOriginal] = useState<Regua | null>(inicial);
  // No automático o rascunho sempre existe: sem exceção, ele começa na geral.
  const [rascunho, setRascunho] = useState<Regua | null>(inicial ?? (automatico ? copiaDaGeral() : null));
  const [feriadoNovo, setFeriadoNovo] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const hojeISO = getTodayISO();
  const hoje = new Date();
  const mesAtual = mes === hoje.getMonth() + 1 && ano === hoje.getFullYear();
  const vale = rascunho ?? geral;
  const total = diasUteisDoMes(ano, mes, vale.feriados);
  const trabalhados = mesAtual
    ? diasUteisDecorridos(ano, mes, vale.feriados, hojeISO, undefined, vale.contarDiaAtual)
    : null;

  // O que o setor faz diferente de todo mundo — a frase que justifica a exceção.
  const diferencas = useMemo(() => {
    if (!rascunho) return null;
    const doSetor = new Set(rascunho.feriados);
    const gerais = new Set(geral.feriados);
    return {
      trabalha: geral.feriados.filter(f => !doSetor.has(f)).sort(),
      folga: rascunho.feriados.filter(f => !gerais.has(f)).sort(),
      contarHoje: rascunho.contarDiaAtual !== geral.contarDiaAtual,
    };
  }, [rascunho, geral]);

  // No automático, sem exceção gravada, a base de comparação é a geral.
  const base = original ?? (automatico ? geral : null);
  const alterado = !!rascunho && !!base && chave(rascunho) !== chave(base);
  const igualAGeral = !!rascunho && chave(rascunho) === chave(geral);
  const proprio = automatico ? !!original : !!rascunho;

  async function gravar(regua: Regua): Promise<boolean> {
    const { error } = await upsertDiasUteisSetor({
      empresaId, setorId, mes, ano,
      feriados: regua.feriados, contarDiaAtual: regua.contarDiaAtual,
      atualizadoPor: perfilId,
    });
    if (error) {
      toast.error('Erro ao salvar os dias úteis do setor', { description: error });
      return false;
    }
    setOriginal(regua);
    onExcecao(setorId, { feriados: regua.feriados, contar_dia_atual: regua.contarDiaAtual });
    return true;
  }

  // Grava sozinho, como o cartão geral: 800 ms depois da última mexida.
  useEffect(() => {
    if (!alterado || !rascunho || !podeEditar) return;
    const t = window.setTimeout(() => {
      if (impedir('alterar os dias úteis do setor neste mês')) return;
      // Voltou a ficar igual à geral: a exceção não tem mais razão de existir.
      if (automatico && igualAGeral && original && podeExcluir) { void voltarAGeral(); return; }
      void gravar(rascunho);
    }, 800);
    return () => window.clearTimeout(t);
    // `gravar` é recriada a cada render; o gatilho é o rascunho mudar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alterado, rascunho, podeEditar]);

  async function ligar() {
    if (impedir('alterar os dias úteis do setor neste mês')) return;
    const copia: Regua = { feriados: [...geral.feriados].sort(), contarDiaAtual: geral.contarDiaAtual };
    setOcupado(true);
    const ok = await gravar(copia);
    setOcupado(false);
    if (ok) setRascunho(copia);
  }

  async function voltarAGeral() {
    if (impedir('alterar os dias úteis do setor neste mês')) return;
    setOcupado(true);
    const { excluiu, error } = await removerDiasUteisSetor({ setorId, mes, ano });
    setOcupado(false);
    if (error) {
      toast.error('Erro ao voltar à configuração geral', { description: error });
      return;
    }
    if (!excluiu) {
      toast.warning('O setor continua com os dias úteis próprios.', {
        description: 'Seu cargo não pode excluir dias úteis.',
      });
      return;
    }
    setOriginal(null);
    setRascunho(automatico ? copiaDaGeral() : null);
    onExcecao(setorId, null);
  }

  function adicionarFeriado() {
    if (!rascunho || !feriadoNovo) return;
    const [y, m] = feriadoNovo.split('-').map(Number);
    if (y !== ano || m !== mes) {
      toast.warning(`O dia deve estar em ${MESES[mes - 1]}/${ano}.`);
      return;
    }
    if (!rascunho.feriados.includes(feriadoNovo)) {
      setRascunho({ ...rascunho, feriados: [...rascunho.feriados, feriadoNovo].sort() });
    }
    setFeriadoNovo('');
  }

  return (
    <Card className={cn('border border-border shadow-sm', className)}>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <span className="text-primary"><CalendarDays className="h-4 w-4" /></span>
          <CardTitle className="text-base">Dias úteis do setor {setorNome}</CardTitle>
          <Badge variant={proprio ? 'default' : 'secondary'} className="text-xs ml-auto">
            {proprio ? 'Próprios do setor' : 'Segue a geral'}
          </Badge>
        </div>
        <CardDescription className="text-xs">
          {automatico
            ? 'Segunda a sexta, menos os feriados. Usado para a meta diária, a projeção e os quartis deste setor. «Contar o dia de hoje» vale só para ele; os feriados são definidos pela gestão.'
            : rascunho
              ? 'Este setor trabalha diferente: a meta diária, a projeção e os quartis dele usam os dias abaixo, e não os da configuração geral.'
              : 'Este setor usa os dias úteis da configuração geral do mês. Se ele trabalha diferente (num feriado, ou folga num dia em que os outros trabalham), dá para trocar só para ele.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        <div className="flex items-center gap-3">
          <div className="flex-1 rounded-lg border border-border bg-muted/30 px-3 py-2 text-center">
            <p className="text-lg font-bold tabular-nums">{total}</p>
            <p className="text-[11px] text-muted-foreground">dias úteis do setor em {MESES[mes - 1]}</p>
          </div>
          <div className="flex-1 rounded-lg border border-border bg-muted/30 px-3 py-2 text-center">
            <p className="text-lg font-bold tabular-nums">{trabalhados !== null ? trabalhados : '—'}</p>
            <p className="text-[11px] text-muted-foreground">
              {trabalhados !== null ? 'já trabalhados' : 'mês não atual'}
            </p>
          </div>
        </div>

        {!rascunho ? (
          podeEditar && (
            <Button size="sm" variant="outline" className="gap-1.5" disabled={ocupado} onClick={ligar}>
              {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CalendarDays className="h-3.5 w-3.5" />}
              Este setor trabalha diferente
            </Button>
          )
        ) : (
          <>
            <label className="flex items-start gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rascunho.contarDiaAtual}
                disabled={!podeEditar}
                onChange={e => setRascunho({ ...rascunho, contarDiaAtual: e.target.checked })}
                className="mt-0.5 h-3.5 w-3.5 accent-primary cursor-pointer disabled:cursor-not-allowed"
              />
              <span className="text-[11px] leading-tight">
                <span className="font-medium text-foreground">Contar o dia de hoje</span>
                <span className="block text-muted-foreground">
                  Só para este setor. Desmarcado, os dias trabalhados consideram só os dias já fechados.
                </span>
              </span>
            </label>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                {automatico ? 'Feriados (definidos pela gestão)' : 'Feriados do setor (o setor não trabalha)'}
              </Label>
              {podeMexerFeriados && <div className="flex items-center gap-2">
                <Input
                  type="date"
                  className="h-8 text-sm max-w-[170px]"
                  value={feriadoNovo}
                  onChange={e => setFeriadoNovo(e.target.value)}
                />
                <Button size="sm" variant="outline" className="h-8 gap-1 text-xs"
                  onClick={adicionarFeriado} disabled={!feriadoNovo}>
                  <Plus className="h-3.5 w-3.5" /> Adicionar
                </Button>
              </div>}
              {rascunho.feriados.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {rascunho.feriados.map(f => (
                    <Badge key={f} variant="secondary" className="gap-1 text-xs font-normal">
                      {dataBR(f)}
                      {podeMexerFeriados && (
                        <button type="button" className="hover:text-destructive"
                          aria-label={`Tirar ${dataBR(f)}`}
                          onClick={() => setRascunho({ ...rascunho, feriados: rascunho.feriados.filter(x => x !== f) })}>
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground">Nenhum feriado: o setor trabalha todos os dias de segunda a sexta.</p>
              )}
            </div>

            {diferencas && (diferencas.trabalha.length > 0 || diferencas.folga.length > 0 || diferencas.contarHoje) ? (
              <ul className="text-[11px] text-muted-foreground space-y-0.5 rounded-lg border border-dashed border-border px-3 py-2">
                {diferencas.trabalha.length > 0 && (
                  <li>Trabalha no feriado geral de {diferencas.trabalha.map(dataBR).join(', ')}.</li>
                )}
                {diferencas.folga.length > 0 && (
                  <li>Folga em {diferencas.folga.map(dataBR).join(', ')}, dia em que os outros setores trabalham.</li>
                )}
                {diferencas.contarHoje && (
                  <li>{rascunho.contarDiaAtual ? 'Conta' : 'Não conta'} o dia de hoje (a geral {geral.contarDiaAtual ? 'conta' : 'não conta'}).</li>
                )}
              </ul>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                {automatico ? 'Igual à configuração geral do mês.' : 'Por enquanto igual à configuração geral.'}
              </p>
            )}

            {/* No automático não há «voltar»: desmarcar já volta, e a exceção
                que a gestão criou (com feriados próprios) não é do líder apagar. */}
            {podeExcluir && !automatico && (
              <Button size="sm" variant="ghost" className="gap-1.5 text-xs text-muted-foreground"
                disabled={ocupado} onClick={voltarAGeral}>
                {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />}
                Voltar a seguir a configuração geral
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
