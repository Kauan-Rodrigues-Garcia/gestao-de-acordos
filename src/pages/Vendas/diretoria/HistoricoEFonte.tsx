/**
 * HistoricoEFonte — as duas abas de procedência do Painel Diretoria do
 * Comercial.
 *
 * ## Histórico de importações
 *
 * Toda carga que já entrou, com quem a mandou, quantas linhas o arquivo tinha,
 * quantas o sistema aceitou e quanto daquilo conta na meta. É a resposta para
 * «de onde veio este número» quando alguém desconfia de um total.
 *
 * O estado importa mais do que parece:
 *
 *   vigente ...... é o retrato que vale agora. Um por mês e por origem.
 *   substituído .. foi trocado por uma carga mais nova do mesmo mês e origem.
 *                  As linhas dele já foram apagadas (`fn_vendas_lote_promover`),
 *                  então ele conta a história e não guarda o dado.
 *   carregando ... subiu e ninguém promoveu. Não vale nada ainda.
 *   descartado ... alguém desistiu dele.
 *
 * ## Fonte dos dados
 *
 * A mesma aba que a BookPlay tem, e pelo mesmo motivo: quem olha um painel de
 * diretoria precisa saber o que cada número é ANTES de discordar dele. Aqui é
 * texto, e é de propósito — a regra escrita é mais barata de conferir do que a
 * regra deduzida de um gráfico.
 */
import { useEffect, useState } from 'react';
import {
  Database, FileSpreadsheet, History, Loader2, RefreshCw, TriangleAlert,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useEmpresa } from '@/hooks/useEmpresa';
import { formatBRL } from '@/lib/money';
import { formatDate } from '@/lib/index';
import { rotuloDoMes } from '@/lib/mesReferencia';
import { cn } from '@/lib/utils';
import { buscarLotes, type EstadoLote, type Lote } from '@/services/vendas/importacaoVendas.service';

const ESTADO: Record<EstadoLote, { rotulo: string; classe: string; dica: string }> = {
  vigente: {
    rotulo: 'Vigente',
    classe: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
    dica: 'É o retrato que vale agora. As linhas dele estão no banco.',
  },
  substituido: {
    rotulo: 'Substituído',
    classe: 'border-border bg-muted text-muted-foreground',
    dica: 'Uma carga mais nova do mesmo mês e origem tomou o lugar. As linhas já foram apagadas.',
  },
  carregando: {
    rotulo: 'Carregando',
    classe: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400',
    dica: 'Subiu e ninguém promoveu. Não vale para nenhum número.',
  },
  descartado: {
    rotulo: 'Descartado',
    classe: 'border-destructive/40 bg-destructive/10 text-destructive',
    dica: 'Alguém desistiu desta carga antes de promovê-la.',
  },
};

export function HistoricoImportacoes({ ativo }: { ativo: boolean }) {
  const { empresa } = useEmpresa();
  const empresaId = empresa?.id ?? null;

  const [lotes, setLotes] = useState<Lote[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    if (!empresaId || !ativo) return;
    let vivo = true;
    setCarregando(true);
    void buscarLotes(empresaId).then(r => {
      if (!vivo) return;
      setLotes(r.lotes);
      setErro(r.erro);
      setCarregando(false);
    });
    return () => { vivo = false; };
  }, [empresaId, ativo, versao]);

  if (!empresaId) return null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="rounded-xl border border-border bg-card p-2">
            <History className="h-4 w-4 text-muted-foreground" aria-hidden />
          </div>
          <div>
            <h2 className="text-sm font-semibold leading-tight">Histórico de importações</h2>
            <p className="text-[11px] text-muted-foreground">
              Toda carga que já entrou, quem a mandou e o que ela trouxe
            </p>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Recarregar"
          disabled={carregando} onClick={() => setVersao(v => v + 1)}>
          <RefreshCw className={cn('h-4 w-4', carregando && 'animate-spin')} />
        </Button>
      </div>

      {erro && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-[12px]">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />{erro}
        </div>
      )}

      {carregando && lotes.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Lendo o histórico…
        </div>
      ) : lotes.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">
          Nenhuma carga ainda. A primeira importação aparece aqui.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="w-full overflow-x-auto">
            <table className="w-full min-w-[980px] text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-[11px]">
                  <th className="w-[110px] px-3 py-3 text-left font-semibold text-muted-foreground">MÊS</th>
                  <th className="w-[120px] px-3 py-3 text-left font-semibold text-muted-foreground">ORIGEM</th>
                  <th className="w-[110px] px-3 py-3 text-left font-semibold text-muted-foreground">ESTADO</th>
                  <th className="min-w-[200px] px-3 py-3 text-left font-semibold text-muted-foreground">ARQUIVO</th>
                  <th className="min-w-[140px] px-3 py-3 text-left font-semibold text-muted-foreground">QUEM IMPORTOU</th>
                  <th className="w-[130px] px-3 py-3 text-right font-semibold text-muted-foreground">LINHAS</th>
                  <th className="w-[90px] px-3 py-3 text-right font-semibold text-muted-foreground">NA RÉGUA</th>
                  <th className="w-[130px] px-3 py-3 text-right font-semibold text-muted-foreground">FATURAMENTO</th>
                </tr>
              </thead>
              <tbody>
                {lotes.map((l, i) => {
                  const e = ESTADO[l.estado];
                  const perdidas = l.linhas_arquivo - l.linhas_aceitas;
                  return (
                    <tr key={l.id} className={cn(
                      'border-b border-border/50',
                      i % 2 === 0 && 'bg-muted/10',
                      l.estado === 'vigente' && 'bg-emerald-500/5',
                    )}>
                      <td className="px-3 py-2.5 capitalize text-foreground">{rotuloDoMes(l.mes.slice(0, 7))}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">
                        {l.origem === 'geral' ? 'Geral (oficial)' : 'Prévia do setor'}
                      </td>
                      <td className="px-3 py-2.5">
                        <span title={e.dica} className={cn(
                          'inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-medium',
                          e.classe,
                        )}>
                          {e.rotulo}
                        </span>
                      </td>
                      <td className="max-w-[260px] px-3 py-2.5">
                        <p className="truncate text-foreground">{l.arquivo_nome ?? 'sem nome'}</p>
                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                          {formatDate(l.importado_em?.slice(0, 10))}
                          {l.promovido_em ? ` · promovido ${formatDate(l.promovido_em.slice(0, 10))}` : ' · nunca promovido'}
                        </p>
                      </td>
                      <td className="max-w-[160px] truncate px-3 py-2.5 text-muted-foreground">
                        {l.perfis?.nome ?? '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-muted-foreground">
                        {l.linhas_aceitas.toLocaleString('pt-BR')}
                        <span className="text-[10px]"> de {l.linhas_arquivo.toLocaleString('pt-BR')}</span>
                        {perdidas > 0 && (
                          <p className="mt-0.5 text-[10px] text-amber-600 dark:text-amber-400">
                            {l.duplicados > 0 && `${l.duplicados} repetida${l.duplicados === 1 ? '' : 's'}`}
                            {l.duplicados > 0 && l.descartadas > 0 && ' · '}
                            {l.descartadas > 0 && `${l.descartadas} descartada${l.descartadas === 1 ? '' : 's'}`}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-muted-foreground">
                        {l.quantidade_na_regua.toLocaleString('pt-BR')}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-semibold text-foreground">
                        {formatBRL(l.faturamento_na_regua)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        «Na régua» é o que o arquivo trouxe já <strong className="text-foreground">confirmado e
        assinado</strong> — é dele que sai o faturamento desta coluna e o dos painéis. Carga
        substituída teve as linhas apagadas: ela guarda a história, não o dado.
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export function FonteDosDados() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2.5">
        <div className="rounded-xl border border-border bg-card p-2">
          <Database className="h-4 w-4 text-muted-foreground" aria-hidden />
        </div>
        <div>
          <h2 className="text-sm font-semibold leading-tight">Fonte dos dados</h2>
          <p className="text-[11px] text-muted-foreground">
            O que cada número deste painel é, e de onde ele sai
          </p>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Bloco icone={FileSpreadsheet} titulo="Relatório geral (oficial)">
          <p>
            O arquivo do ERP recortado pela <strong>data de confirmação</strong>. É o número que vale:
            todo faturamento deste painel sai dele, e a régua é <strong>confirmada E assinada</strong>.
          </p>
          <p>
            Venda ainda aberta <strong>não aparece</strong> nele, por construção — o ERP só a
            inclui quando ela é confirmada. Por isso o geral nunca é a lista completa do dia.
          </p>
        </Bloco>

        <Bloco icone={FileSpreadsheet} titulo="Prévia do setor">
          <p>
            Recorta pela <strong>data da venda</strong> e é a única carga que traz venda em aberto. Serve
            para enxergar o que está por confirmar e para salvar o NR lançado do prazo de 1 dia.
          </p>
          <p>
            Não soma no painel: misturá-la ao geral contaria a mesma venda duas vezes.
          </p>
        </Bloco>

        <Bloco icone={Database} titulo="A tabela `vendas`">
          <p>
            O placar do operador. A venda nasce aqui de dois jeitos — lançada na aba Vendas, ou
            trazida pela projeção do relatório —, e o NR é a chave que une os dois.
          </p>
          <p>
            <strong>`conta_na_meta` e `valor_na_meta` são colunas geradas pelo banco</strong>, e não
            contas de tela. Nenhuma tela reimplementa a régua.
          </p>
        </Bloco>

        <Bloco icone={Database} titulo="O de-para de franquia">
          <p>
            O relatório não conhece os setores do sistema: ele traz um <strong>código de
            franquia</strong>. `vendas_franquias` amarra cada código a um setor, e é esse vínculo que
            faz o dinheiro aparecer no card do setor.
          </p>
          <p>
            Franquia sem vínculo <strong>não é erro</strong> — é franquia que ninguém cadastrou ainda. O
            dinheiro dela soma no geral e em setor nenhum, e a aba «Setores a vincular» lista quanto é.
          </p>
        </Bloco>

        <Bloco icone={Database} titulo="Quem credita a venda">
          <p>
            O relatório traz o <strong>login do vendedor</strong>, e o sistema o casa com
            `perfis.usuario` — sem caixa, sem espaço em volta, e só quando casa com UMA pessoa.
          </p>
          <p>
            Login que o cadastro não tem vende e não credita ninguém: a aba «Pessoas do relatório»
            mostra quanto está nessa situação.
          </p>
        </Bloco>

        <Bloco icone={Database} titulo="A meta e a ausência">
          <p>
            A meta é por <strong>setor</strong> ou por <strong>equipe</strong>, com régua de quantidade
            ou de valor (`metas.regua`). Não há meta por pessoa.
          </p>
          <p>
            Toda meta é medida já <strong>descontada a ausência</strong>: quem perdeu dias úteis de
            atestado reduz a meta na mesma proporção. Os cards dizem quanto foi descontado.
          </p>
        </Bloco>
      </div>

      <p className="text-[11px] text-muted-foreground">
        A comparação com o mês anterior é sempre no <strong className="text-foreground">mesmo
        trecho</strong>: setembro até o dia 16 contra agosto até o dia 16. Comparar com o mês inteiro
        mostraria uma queda que é do calendário.
      </p>
    </div>
  );
}

function Bloco({
  icone: Icone, titulo, children,
}: { icone: typeof Database; titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border/70 bg-card p-4 shadow-sm">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <Icone className="h-3.5 w-3.5 text-muted-foreground" aria-hidden /> {titulo}
      </h3>
      <div className="mt-2 space-y-2 text-[12px] leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  );
}
