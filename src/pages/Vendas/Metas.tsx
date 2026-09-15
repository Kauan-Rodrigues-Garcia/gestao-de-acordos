/**
 * Metas do Comercial — duas réguas, e só uma decide.
 *
 * ## A régua é a primeira escolha, não a última
 *
 * «Tem setores que a meta são definidas por vendas — fez 10 vendas bateu a meta
 * — e tem setores que são divididos por valores.» Então a linha começa pela
 * pergunta «como este setor é medido?», e os dois campos ficam ao lado: o da
 * régua em destaque, o outro como segunda leitura.
 *
 * Os dois são gravados mesmo assim. Um setor medido por valor que bate o
 * dinheiro com metade das vendas está vendendo caro; um que bate a quantidade e
 * não o valor, barato. Guardar só a régua escolhida apagaria essa leitura.
 *
 * ## Tela própria, e não a Metas da cobrança
 *
 * A de lá tem quartis, dias úteis, metas extras, validação por setor e
 * treinamento de equipe — 1.573 linhas de vocabulário que não é de Vendas.
 * Aqui são três campos por linha.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Target, Building2, Users, TriangleAlert, Info } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { SeletorMes } from '@/components/AnalyticsPanel/SeletorMes';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { useMesGlobal } from '@/providers/MesProvider';
import { partesDoMes, rotuloDoMes } from '@/lib/mesReferencia';
import { formatBRL, parseBRL } from '@/lib/money';
import { cn } from '@/lib/utils';
import { REGUA_LABEL, type ReguaMeta } from '@/lib/vendasMeta';
import {
  buscarMetasDoMes, salvarMeta, type MetaDeRecorte,
} from '@/services/vendas/metasVendas.service';

/** O `Select` do shadcn recusa `value=""`; «sem régua» precisa de um valor. */
const SEM_REGUA = '__sem_regua__';

type Rascunho = { regua: ReguaMeta | null; quantidade: string; valor: string };

function chaveDe(m: Pick<MetaDeRecorte, 'tipo' | 'referencia_id'>): string {
  return `${m.tipo}:${m.referencia_id}`;
}

export default function MetasVendas() {
  const { empresa } = useEmpresa();
  const { temPermissao } = useCargoPermissoes();
  const { mes, setMes } = useMesGlobal();

  const empresaId = empresa?.id ?? null;
  const podeEditar = temPermissao('editar_metas_vendas');
  const { ano, mes: mesNum } = partesDoMes(mes);

  const [linhas, setLinhas] = useState<MetaDeRecorte[]>([]);
  const [rascunhos, setRascunhos] = useState<Record<string, Rascunho>>({});
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!empresaId) return;
    setCarregando(true);
    const r = await buscarMetasDoMes(empresaId, ano, mesNum);
    setCarregando(false);
    if (!r.ok) { setErro(r.erro); setLinhas([]); return; }
    setErro(null);
    setLinhas(r.dado ?? []);
    // O rascunho nasce do que está gravado: editar uma linha não deve exigir
    // redigitar o que já estava lá.
    const base: Record<string, Rascunho> = {};
    for (const l of r.dado ?? []) {
      base[chaveDe(l)] = {
        regua: l.regua,
        quantidade: l.quantidade > 0 ? String(l.quantidade) : '',
        valor: l.valor > 0 ? String(l.valor) : '',
      };
    }
    setRascunhos(base);
  }, [empresaId, ano, mesNum]);

  useEffect(() => { void carregar(); }, [carregar]);

  const setores = useMemo(() => linhas.filter(l => l.tipo === 'setor'), [linhas]);
  const equipes = useMemo(() => linhas.filter(l => l.tipo === 'equipe'), [linhas]);

  function mudar(k: string, campo: keyof Rascunho, v: string | ReguaMeta | null) {
    setRascunhos(r => ({ ...r, [k]: { ...r[k], [campo]: v } as Rascunho }));
  }

  async function gravar(l: MetaDeRecorte) {
    if (!empresaId) return;
    const k = chaveDe(l);
    const d = rascunhos[k];
    if (!d) return;

    const quantidade = d.quantidade.trim() === '' ? 0 : Math.trunc(parseBRL(d.quantidade));
    const valor      = d.valor.trim() === ''      ? 0 : parseBRL(d.valor);

    setSalvando(k);
    const r = await salvarMeta({
      empresaId, tipo: l.tipo, referenciaId: l.referencia_id,
      ano, mes: mesNum, regua: d.regua, quantidade, valor,
    });
    setSalvando(null);

    if (!r.ok) { toast.error(r.erro ?? 'Não foi possível salvar a meta.'); return; }
    toast.success(d.regua === null && quantidade === 0 && valor === 0
      ? `Meta de ${l.nome} removida.`
      : `Meta de ${l.nome} salva.`);
    await carregar();
  }

  function Linha({ l }: { l: MetaDeRecorte }) {
    const k = chaveDe(l);
    const d = rascunhos[k] ?? { regua: null, quantidade: '', valor: '' };
    const mudou =
      d.regua !== l.regua
      || (d.quantidade.trim() === '' ? 0 : Math.trunc(parseBRL(d.quantidade))) !== l.quantidade
      || (d.valor.trim() === '' ? 0 : parseBRL(d.valor)) !== l.valor;

    return (
      <div className="flex flex-wrap items-end gap-x-3 gap-y-2 border-b border-border/60 px-3 py-2.5 last:border-b-0">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium">{l.nome}</p>
          {l.tipo === 'equipe' && (
            <p className="truncate text-[11px] text-muted-foreground">
              {l.setor_nome ?? 'sem setor'}
            </p>
          )}
        </div>

        <div className="space-y-1">
          <label className="block text-[10px] uppercase tracking-wide text-muted-foreground"
            htmlFor={`regua-${k}`}>
            Medido por
          </label>
          <Select
            value={d.regua ?? SEM_REGUA}
            disabled={!podeEditar}
            onValueChange={v => mudar(k, 'regua', v === SEM_REGUA ? null : (v as ReguaMeta))}>
            <SelectTrigger id={`regua-${k}`} className="h-8 w-[190px] text-[12px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SEM_REGUA}>Não definido</SelectItem>
              <SelectItem value="quantidade">{REGUA_LABEL.quantidade}</SelectItem>
              <SelectItem value="valor">{REGUA_LABEL.valor}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <label className="block text-[10px] uppercase tracking-wide text-muted-foreground"
            htmlFor={`qtd-${k}`}>
            Vendas
          </label>
          <Input
            id={`qtd-${k}`} value={d.quantidade} inputMode="numeric" disabled={!podeEditar}
            onChange={e => mudar(k, 'quantidade', e.target.value)}
            placeholder="161"
            className={cn('h-8 w-24 text-[12px]',
              d.regua === 'quantidade' && 'border-primary/50 bg-primary/[0.04]')}
          />
        </div>

        <div className="space-y-1">
          <label className="block text-[10px] uppercase tracking-wide text-muted-foreground"
            htmlFor={`val-${k}`}>
            Faturamento
          </label>
          <Input
            id={`val-${k}`} value={d.valor} inputMode="decimal" disabled={!podeEditar}
            onChange={e => mudar(k, 'valor', e.target.value)}
            placeholder="962.136,00"
            className={cn('h-8 w-32 text-[12px]',
              d.regua === 'valor' && 'border-primary/50 bg-primary/[0.04]')}
          />
        </div>

        <div className="flex items-center gap-2">
          {podeEditar ? (
            <Button size="sm" className="h-8 text-[12px]"
              disabled={!mudou || salvando === k}
              onClick={() => void gravar(l)}>
              {salvando === k ? 'Salvando…' : 'Salvar'}
            </Button>
          ) : l.regua ? (
            <Badge variant="outline" className="text-[10px]">
              {l.regua === 'quantidade'
                ? `${l.quantidade} vendas`
                : formatBRL(l.valor)}
            </Badge>
          ) : (
            <Badge variant="outline"
              className="bg-warning/15 text-warning border-warning/30 text-[10px]">
              Sem meta
            </Badge>
          )}
        </div>
      </div>
    );
  }

  const semRegua = linhas.filter(l => !l.regua).length;

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="rounded-xl border border-border bg-card p-2">
            <Target className="h-5 w-5 text-muted-foreground" aria-hidden />
          </div>
          <div>
            <h1 className="text-lg font-semibold leading-tight">Metas de vendas</h1>
            <p className="text-[12px] text-muted-foreground">{rotuloDoMes(mes)}</p>
          </div>
        </div>
        <SeletorMes mes={mes} onChange={setMes} desabilitado={carregando} />
      </div>

      {erro && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-[12px]">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
          <div>{erro}</div>
        </div>
      )}

      <div className="flex items-start gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2 text-[12px] text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <div>
          <strong className="text-foreground">Só a régua escolhida decide</strong> se a meta
          bateu. A outra continua sendo calculada e aparece ao lado: um setor que bate o
          faturamento com metade das vendas está vendendo caro; um que bate a quantidade e não o
          valor, barato.
          {semRegua > 0 && (
            <p className="mt-1">
              <strong className="text-foreground">{semRegua}</strong>{' '}
              {semRegua === 1 ? 'recorte ainda não tem' : 'recortes ainda não têm'} régua
              definida — {semRegua === 1 ? 'ele não bate' : 'eles não batem'} meta nenhuma até
              alguém escolher.
            </p>
          )}
        </div>
      </div>

      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <header className="flex items-center gap-2 border-b border-border bg-muted/30 px-3 py-2">
          <Building2 className="h-4 w-4 text-muted-foreground" aria-hidden />
          <h2 className="text-[13px] font-semibold">Setores</h2>
          <Badge variant="outline" className="text-[10px]">{setores.length}</Badge>
        </header>
        {setores.length === 0 ? (
          <p className="py-6 text-center text-[12px] text-muted-foreground">
            {carregando ? 'Carregando…' : 'Nenhum setor ativo nesta empresa.'}
          </p>
        ) : setores.map(l => <Linha key={chaveDe(l)} l={l} />)}
      </section>

      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <header className="flex items-center gap-2 border-b border-border bg-muted/30 px-3 py-2">
          <Users className="h-4 w-4 text-muted-foreground" aria-hidden />
          <h2 className="text-[13px] font-semibold">Equipes</h2>
          <Badge variant="outline" className="text-[10px]">{equipes.length}</Badge>
        </header>
        {equipes.length === 0 ? (
          <p className="py-6 text-center text-[12px] text-muted-foreground">
            {carregando ? 'Carregando…' : 'Nenhuma equipe cadastrada ainda.'}
          </p>
        ) : equipes.map(l => <Linha key={chaveDe(l)} l={l} />)}
      </section>
    </div>
  );
}
