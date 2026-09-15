/**
 * LixeiraVendas — a lixeira do Comercial.
 *
 * ## É outra lixeira, e não a mesma com outro filtro
 *
 * `/admin/lixeira` restaura acordo: ela conhece parcela, tabulação, vínculo com
 * o operador e o mês de fechamento, e o botão dela reinsere numa tabela que não
 * existe aqui. `lixeira_vendas` é outra tabela, criada na Fase 1 junto com
 * `vendas`, e `fn_venda_restaurar` é outra função.
 *
 * Fazer a mesma URL trocar de tela por produto criaria um componente com dois
 * modos e um `if` de produto no meio — que é exatamente o que a lista branca
 * de `menuLateral` existe para não precisar.
 *
 * ## Sete dias, e o prazo aparece
 *
 * `expira_em` vem do banco. Mostrar «expira em 3 dias» é o que diferencia uma
 * lixeira de um arquivo morto: quem excluiu por engano precisa saber que tem
 * pressa, e quem excluiu de propósito precisa saber que aquilo some sozinho.
 *
 * A expiração é do banco, não desta tela — o que está aqui é a contagem, e ela
 * pode mostrar «expirou» numa linha que a limpeza ainda não passou. Dizer
 * «expirou» é mais honesto do que esconder: a linha existe, e restaurá-la
 * ainda funciona enquanto existir.
 *
 * ## Restaurar é o único poder desta tela
 *
 * Não há «excluir definitivamente». A lixeira já é o fim da linha, e um botão
 * que apaga de vez transformaria uma rede de proteção em mais um lugar onde se
 * perde coisa. Quem quiser antecipar a expiração apaga do banco, com o peso
 * que isso tem.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Trash2, RefreshCw, Undo2, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { formatBRL } from '@/lib/money';
import { formatDate, getTodayISO } from '@/lib/index';
import { cn } from '@/lib/utils';
import { SITUACAO_LABELS, type SituacaoVenda } from '@/lib/vendas';
import {
  buscarLixeiraVendas, restaurarVenda, type ItemLixeiraVenda,
} from '@/services/vendas/vendas.service';
import { Bloco, Faixa } from './componentes';

/** Quantos dias faltam para `expira_em`. Negativo = já passou do prazo. */
function diasAte(iso: string, hoje: string): number {
  const a = Date.parse(`${hoje}T00:00:00Z`);
  const b = Date.parse(`${String(iso).slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

function Prazo({ expiraEm, hoje }: { expiraEm: string; hoje: string }) {
  const dias = diasAte(expiraEm, hoje);
  if (dias < 0) {
    return (
      <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-[10px] text-destructive">
        expirou — a limpeza ainda não passou
      </Badge>
    );
  }
  const apertado = dias <= 1;
  return (
    <Badge variant="outline" className={cn(
      'text-[10px]',
      apertado
        ? 'border-destructive/30 bg-destructive/10 text-destructive'
        : 'border-border text-muted-foreground',
    )}>
      <Clock className="mr-1 h-3 w-3" aria-hidden />
      {dias === 0 ? 'expira hoje' : dias === 1 ? 'expira amanhã' : `${dias} dias`}
    </Badge>
  );
}

export default function LixeiraVendas() {
  const { empresa } = useEmpresa();
  const { temPermissao } = useCargoPermissoes();

  const [itens, setItens] = useState<ItemLixeiraVenda[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [disponivel, setDisponivel] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [restaurando, setRestaurando] = useState<string | null>(null);

  const empresaId = empresa?.id ?? null;
  const hoje = getTodayISO();

  /*
   * `restaurar_vendas` e não `criar_vendas`: restaurar devolve uma venda que já
   * passou pelo líder, com a situação que ela tinha. É um poder próprio, e
   * amarrá-lo ao de lançar daria a quem lança o direito de reanimar o que a
   * gerência mandou para a lixeira.
   */
  const podeRestaurar = temPermissao('restaurar_vendas');

  const carregar = useCallback(async () => {
    if (!empresaId) return;
    setCarregando(true);
    const r = await buscarLixeiraVendas(empresaId);
    setItens(r.itens);
    setDisponivel(r.disponivel);
    setErro(r.disponivel ? r.erro : null);
    setCarregando(false);
  }, [empresaId]);

  useEffect(() => { void carregar(); }, [carregar]);

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return itens;
    return itens.filter(i =>
      (i.nr_documento ?? '').toLowerCase().includes(termo)
      || (i.cliente ?? '').toLowerCase().includes(termo)
      || (i.operador_nome ?? '').toLowerCase().includes(termo));
  }, [itens, busca]);

  const total = useMemo(
    () => visiveis.reduce((s, i) => s + i.valor_total, 0),
    [visiveis],
  );

  async function onRestaurar(item: ItemLixeiraVenda) {
    setRestaurando(item.id);
    const r = await restaurarVenda(item.id);
    setRestaurando(null);
    if (!r.ok) { toast.error(r.erro ?? 'Não foi possível restaurar a venda.'); return; }
    toast.success(`Venda ${item.nr_documento ?? ''} de volta na aba Vendas.`);
    await carregar();
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="rounded-xl border border-border bg-card p-2">
            <Trash2 className="h-5 w-5 text-muted-foreground" aria-hidden />
          </div>
          <div>
            <h1 className="text-lg font-semibold leading-tight">Lixeira de Vendas</h1>
            <p className="text-[12px] text-muted-foreground">
              {itens.length === 0
                ? 'Sete dias para restaurar o que foi excluído'
                : `${itens.length} ${itens.length === 1 ? 'venda excluída' : 'vendas excluídas'} · ${formatBRL(total)}`}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={busca} onChange={e => setBusca(e.target.value)}
            placeholder="NR, cliente ou operador"
            className="h-8 w-[220px] text-[12px]" aria-label="Buscar na lixeira"
          />
          <Button variant="ghost" size="icon" className="h-8 w-8"
            onClick={() => { void carregar(); }} disabled={carregando} aria-label="Recarregar">
            <RefreshCw className={cn('h-4 w-4', carregando && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {!disponivel && (
        <Faixa tom="alerta">
          A lixeira não respondeu. <strong>Recarregue a página</strong>; se persistir, confira se a
          migration <code className="mx-1 rounded bg-muted px-1 py-0.5 text-[11px]">
            20260915100000_vendas_fase1.sql</code> está aplicada.
        </Faixa>
      )}
      {erro && <Faixa tom="alerta">{erro}</Faixa>}
      {!podeRestaurar && itens.length > 0 && (
        <Faixa tom="info">
          Você enxerga a lixeira, mas não tem a chave <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
            restaurar_vendas</code> — restaurar é de quem confirma. Um administrador liga em
          Configurações → Permissões.
        </Faixa>
      )}

      {carregando && itens.length === 0 ? (
        <div className="space-y-2">
          {[0, 1, 2].map(i => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
        </div>
      ) : (
        <Bloco
          titulo="O que está na lixeira" Icone={Trash2}
          sub="ordenado pela exclusão mais recente"
          vazio={visiveis.length === 0
            ? (busca.trim()
                ? 'Nada na lixeira com esse termo.'
                : 'A lixeira está vazia. É o estado bom.')
            : undefined}
        >
          {visiveis.map(item => (
            <div key={item.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border/60 px-3 py-2 last:border-b-0 hover:bg-accent/30">
              <span className="font-mono text-[12px] tabular-nums text-muted-foreground">
                {item.nr_documento ?? '—'}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px]">
                {item.cliente || <span className="text-muted-foreground">sem cliente</span>}
              </span>
              {item.situacao && (
                <Badge variant="outline" className="text-[10px] font-normal">
                  {SITUACAO_LABELS[item.situacao as SituacaoVenda] ?? item.situacao}
                </Badge>
              )}
              <span className="hidden shrink-0 text-[11px] text-muted-foreground sm:inline">
                {item.operador_nome ?? 'sem operador'}
                {item.data_venda && <> · {formatDate(item.data_venda)}</>}
              </span>
              <Prazo expiraEm={item.expira_em} hoje={hoje} />
              <span className="w-24 shrink-0 text-right text-[13px] font-semibold tabular-nums">
                {formatBRL(item.valor_total)}
              </span>
              {podeRestaurar && (
                <Button
                  size="sm" variant="outline" className="h-7 text-[11px]"
                  disabled={restaurando === item.id}
                  onClick={() => { void onRestaurar(item); }}
                >
                  <Undo2 className={cn('mr-1 h-3.5 w-3.5', restaurando === item.id && 'animate-spin')} />
                  Restaurar
                </Button>
              )}
              {(item.motivo || item.excluido_por_nome) && (
                <p className="w-full text-[11px] text-muted-foreground">
                  Excluída por {item.excluido_por_nome ?? 'alguém sem nome no cadastro'} em{' '}
                  {formatDate(item.excluido_em.slice(0, 10))}
                  {item.motivo && <> · «{item.motivo}»</>}
                </p>
              )}
            </div>
          ))}
        </Bloco>
      )}
    </div>
  );
}
