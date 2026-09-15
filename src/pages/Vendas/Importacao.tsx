/**
 * Importação de Vendas — o relatório entra, as franquias aparecem, o placar muda.
 *
 * ## Cinco blocos, na ordem em que o trabalho acontece
 *
 *   1. carregar o arquivo e conferir o que ele traz ANTES de gravar;
 *   2. ligar cada franquia ao setor dela;
 *   3. lançar o relatório sobre as vendas (`Projecao`);
 *   4. conferir as três camadas (`Conciliacao`);
 *   5. olhar o histórico de cargas.
 *
 * O bloco 3 aparece depois do 2 na tela e não por acaso: a projeção só escreve
 * o que tem franquia vinculada, então vincular é pré-requisito, não passo
 * paralelo.
 *
 * ## Dois arquivos diferentes entram por aqui
 *
 * O seletor de origem decide qual parser roda, e eles não têm nada em comum
 * além do assunto:
 *
 *   geral .. CSV, 60 colunas, um cabeçalho, recorte por confirmação
 *   setor .. XLSX, 119 colunas, DOIS cabeçalhos (grupo e nome), datas em
 *            serial do Excel, recorte por data da venda — e é o único que traz
 *            venda em aberto
 *
 * Adivinhar o formato pelo conteúdo daria um palpite a mais para errar: quem
 * escolhe a origem já disse qual arquivo vai mandar.
 *
 * ## A conferência vem antes da gravação, nas duas etapas que gravam
 *
 * O arquivo é lido e resumido no navegador, e nada vai ao banco até alguém ver
 * o resumo e confirmar. Promover um lote **troca o retrato do mês inteiro** —
 * o anterior perde as linhas. E projetar escreve no placar do operador, e pode
 * **reverter venda que estava contando**: por isso `Projecao` exige ler a
 * prévia antes de mostrar o botão.
 *
 * ## Os dois níveis de risco, e por que têm chaves separadas
 *
 * Importar troca o retrato do RELATÓRIO, que não conta para meta nenhuma: o
 * pior que um erro faz é um retrato errado, que a próxima carga substitui.
 * Projetar escreve em `vendas`. `importar_vendas` e `projetar_vendas` são
 * chaves diferentes por isso.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Upload, FileSpreadsheet, TriangleAlert, Info, CheckCircle2, Link2,
  RefreshCw, History, Building2, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { supabase } from '@/lib/supabase';
import { formatBRL } from '@/lib/money';
import { formatDate } from '@/lib/index';
import { cn } from '@/lib/utils';
import {
  parseProspeccao, type ResultadoParseProspeccao,
} from '@/services/vendas/prospeccaoParser';
import {
  parseProspeccaoSetor, type ResultadoParseSetor,
} from '@/services/vendas/prospeccaoSetorParser';
import {
  abrirLote, enviarLinhas, promoverLote, descartarLote,
  buscarLotes, buscarFranquias, vincularFranquia, hashDoArquivo,
  type Lote, type Franquia, type OrigemLote, type EstadoFranquia,
} from '@/services/vendas/importacaoVendas.service';
import { Projecao } from './Projecao';
import { Conciliacao } from './Conciliacao';

/** O `Select` do shadcn recusa `value=""`. */
const SEM_SETOR = '__sem_setor__';

/**
 * A prévia de qualquer um dos dois arquivos.
 *
 * União discriminada, e não um tipo comum: o relatório do setor tem coisas que
 * o geral não tem — vendas em aberto, linhas sem data de confirmação — e
 * achatar os dois num só esconderia justamente o que diferencia a prévia do
 * oficial.
 */
type PreviaCarga =
  | { tipo: 'geral'; r: ResultadoParseProspeccao }
  | { tipo: 'setor'; r: ResultadoParseSetor };

const ESTADO_LOTE_LABEL: Record<string, string> = {
  carregando:  'Carregando',
  vigente:     'Vigente',
  substituido: 'Substituído',
  descartado:  'Descartado',
};

const ESTADO_FRANQUIA_LABEL: Record<EstadoFranquia, string> = {
  novo:      'Sem setor',
  vinculado: 'Vinculada',
  ignorado:  'Ignorada',
};

function Aviso({ tom, children }: { tom: 'alerta' | 'info' | 'bom'; children: React.ReactNode }) {
  const Icone = tom === 'alerta' ? TriangleAlert : tom === 'bom' ? CheckCircle2 : Info;
  return (
    <div className={cn(
      'flex items-start gap-2 rounded-xl border px-3 py-2 text-[12px]',
      tom === 'alerta' ? 'border-amber-500/40 bg-amber-500/5 text-foreground'
      : tom === 'bom'  ? 'border-success/40 bg-success/5 text-foreground'
                       : 'border-border bg-muted/30 text-muted-foreground',
    )}>
      <Icone className={cn('mt-0.5 h-4 w-4 shrink-0',
        tom === 'alerta' ? 'text-amber-600 dark:text-amber-400'
        : tom === 'bom'  ? 'text-success' : 'text-muted-foreground')} aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function Numero({ rotulo, valor, tom }: { rotulo: string; valor: string; tom?: 'alerta' }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{rotulo}</p>
      <p className={cn('mt-0.5 text-[15px] font-semibold tabular-nums',
        tom === 'alerta' && 'text-amber-600 dark:text-amber-400')}>{valor}</p>
    </div>
  );
}

export default function ImportacaoVendas() {
  const { empresa } = useEmpresa();
  const { temPermissao } = useCargoPermissoes();
  const empresaId = empresa?.id ?? null;

  const podeImportar = temPermissao('importar_vendas');
  const podeVincular = temPermissao('vendas_vincular_franquia');
  const podeProjetar = temPermissao('projetar_vendas');

  const inputRef = useRef<HTMLInputElement>(null);
  const [origem, setOrigem] = useState<OrigemLote>('geral');
  const [arquivo, setArquivo] = useState<{ nome: string; conteudo: string } | null>(null);
  const [previa, setPrevia] = useState<PreviaCarga | null>(null);
  const [gravando, setGravando] = useState(false);
  const [progresso, setProgresso] = useState<{ feitas: number; total: number } | null>(null);

  const [lotes, setLotes] = useState<Lote[]>([]);
  const [franquias, setFranquias] = useState<Franquia[]>([]);
  const [setores, setSetores] = useState<{ id: string; nome: string }[]>([]);
  const [disponivel, setDisponivel] = useState(true);

  const recarregar = useCallback(async () => {
    if (!empresaId) return;
    const [l, f] = await Promise.all([buscarLotes(empresaId), buscarFranquias(empresaId)]);
    setLotes(l.lotes);
    setFranquias(f.franquias);
    setDisponivel(l.disponivel && f.disponivel);
  }, [empresaId]);

  useEffect(() => { void recarregar(); }, [recarregar]);

  useEffect(() => {
    if (!empresaId) return;
    void supabase.from('setores')
      .select('id, nome')
      .eq('empresa_id', empresaId)
      .eq('ativo', true)
      .order('nome')
      .then(({ data }) => setSetores(data ?? []));
  }, [empresaId]);

  /**
   * Cada origem tem o seu arquivo, e eles não são intercambiáveis.
   *
   * O geral é CSV de 60 colunas com uma linha de cabeçalho; o do setor é XLSX
   * de 119 com duas — grupo e nome — e datas em serial do Excel. Tentar
   * adivinhar pelo conteúdo daria um palpite a mais para errar: quem escolhe a
   * origem no seletor já disse qual arquivo vai mandar.
   */
  async function escolherArquivo(file: File) {
    if (origem === 'setor') {
      const buffer = await file.arrayBuffer();
      const r = parseProspeccaoSetor(buffer);
      // O conteúdo textual é só para o hash; o binário já foi consumido.
      setArquivo({ nome: file.name, conteudo: `${file.name}:${file.size}:${file.lastModified}` });
      setPrevia({ tipo: 'setor', r });
      if (r.colunasFaltando.length > 0) {
        toast.error('Esta planilha não parece ser o relatório do setor.');
      }
      return;
    }

    // `file.text()` decodifica como UTF-8, que é o que o ERP entrega — com BOM,
    // e o parser tira o BOM. Não há adivinhação de encoding aqui de propósito.
    const conteudo = await file.text();
    const r = parseProspeccao(conteudo);
    setArquivo({ nome: file.name, conteudo });
    setPrevia({ tipo: 'geral', r });

    if (r.colunasFaltando.length > 0) {
      toast.error('Este arquivo não parece ser o relatório de prospecção.');
    }
  }

  async function importar() {
    if (!empresaId || !previa || !arquivo || !previa.r.mes) return;
    setGravando(true);
    setProgresso({ feitas: 0, total: previa.r.linhas.length });

    const hash = await hashDoArquivo(arquivo.conteudo);
    const aberto = await abrirLote({
      empresaId, mes: previa.r.mes, origem,
      arquivoNome: arquivo.nome, arquivoHash: hash,
    });
    if (!aberto.ok || !aberto.dado) {
      setGravando(false); setProgresso(null);
      toast.error(aberto.erro ?? 'Não foi possível abrir o lote.');
      return;
    }
    const loteId = aberto.dado;

    const enviado = await enviarLinhas(loteId, previa.r.linhas,
      (feitas, total) => setProgresso({ feitas, total }));

    if (!enviado.ok) {
      // O lote pela metade não fica no caminho de ninguém: ele não é vigente e
      // não aparece em conta nenhuma. Descartar limpa as linhas junto.
      await descartarLote(loteId, enviado.erro);
      setGravando(false); setProgresso(null);
      toast.error(enviado.erro ?? 'A carga falhou.');
      await recarregar();
      return;
    }

    const promovido = await promoverLote(loteId);
    setGravando(false); setProgresso(null);

    if (!promovido.ok) {
      toast.error(promovido.erro ?? 'A carga entrou mas não virou o retrato do mês.');
      await recarregar();
      return;
    }

    /*
     * `franquias_novas` quer dizer coisas diferentes por origem, e a mensagem
     * precisa acompanhar: no geral são franquias CADASTRADAS agora; no setor
     * são as que NÃO casaram com nenhuma que o geral conhece.
     */
    const novas = promovido.dado?.franquias_novas ?? 0;
    const linhas = promovido.dado?.linhas_do_lote ?? 0;
    if (novas === 0) {
      toast.success(`${linhas} linhas no ar.`);
    } else if (origem === 'geral') {
      toast.success(
        `${linhas} linhas no ar. ${novas} franquia${novas > 1 ? 's' : ''} sem setor esperando você.`,
      );
    } else {
      toast.warning(
        `${linhas} linhas no ar. ${novas} franquia${novas > 1 ? 's' : ''} desta prévia não `
        + 'existe no relatório geral — importe o geral para cadastrá-la.',
      );
    }
    setArquivo(null); setPrevia(null);
    if (inputRef.current) inputRef.current.value = '';
    await recarregar();
  }

  async function mudarFranquia(f: Franquia, estado: EstadoFranquia, setorId: string | null) {
    const r = await vincularFranquia({ id: f.id, estado, setorId, observacao: f.observacao });
    if (!r.ok) { toast.error(r.erro ?? 'Não foi possível salvar.'); return; }
    await recarregar();
  }

  const semSetor = useMemo(() => franquias.filter(f => f.estado === 'novo'), [franquias]);

  /*
   * Só o lote GERAL vigente vira venda. O do setor recorta por data da venda e
   * traz venda em aberto — projetá-lo daria data de confirmação a quem não tem.
   * Ele entra na conciliação, que é a Fase 4.
   */
  const geralVigente = useMemo(
    () => lotes.find(l => l.estado === 'vigente' && l.origem === 'geral') ?? null,
    [lotes],
  );

  /*
   * O mês que a conciliação compara.
   *
   * Sai do lote vigente mais recente, de qualquer origem — e não do calendário:
   * no dia 1º de outubro a liderança ainda está conferindo setembro, e abrir a
   * tela num mês sem carga nenhuma mostraria «nada a conciliar» quando há.
   */
  const mesDaConciliacao = useMemo(() => {
    const vigente = lotes.find(l => l.estado === 'vigente');
    return (vigente?.mes ?? '').slice(0, 7) || new Date().toISOString().slice(0, 7);
  }, [lotes]);
  const podeGravar = Boolean(
    previa && previa.r.colunasFaltando.length === 0 && previa.r.mes && previa.r.linhas.length > 0,
  );

  return (
    <div className="space-y-5 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="rounded-xl border border-border bg-card p-2">
            <FileSpreadsheet className="h-5 w-5 text-muted-foreground" aria-hidden />
          </div>
          <div>
            <h1 className="text-lg font-semibold leading-tight">Importar vendas</h1>
            <p className="text-[12px] text-muted-foreground">
              O relatório de prospecção, e de qual setor é cada franquia
            </p>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8"
          onClick={() => void recarregar()} aria-label="Recarregar">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {!disponivel && (
        <Aviso tom="alerta">
          A importação de vendas não respondeu. <strong>Recarregue a página</strong> — o banco
          guarda o desenho das tabelas em cache, e uma criada agora leva um instante para
          aparecer na API. Se persistir, confira se a migration
          <code className="mx-1 rounded bg-muted px-1 py-0.5 text-[11px]">
            20260915110000_vendas_fase2_lote_e_depara.sql
          </code>
          está aplicada.
        </Aviso>
      )}

      {/* ── 1. Carregar ─────────────────────────────────────────────────── */}
      {podeImportar && (
        <section className="space-y-3 rounded-xl border border-border bg-card p-4">
          <h2 className="text-[13px] font-semibold">1. Carregar o arquivo</h2>

          <div className="flex flex-wrap items-center gap-2">
            <Select value={origem} onValueChange={v => setOrigem(v as OrigemLote)}>
              <SelectTrigger className="h-9 w-[240px] text-[12px]" aria-label="Origem do relatório">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="geral">Relatório geral — oficial</SelectItem>
                <SelectItem value="setor">Relatório do setor — prévia</SelectItem>
              </SelectContent>
            </Select>

            <input
              ref={inputRef} id="arquivo-prospeccao" type="file"
              accept={origem === 'setor' ? '.xlsx' : '.csv,text/csv'}
              className="hidden"
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) void escolherArquivo(f);
              }}
            />
            <Button variant="outline" size="sm" disabled={gravando}
              onClick={() => inputRef.current?.click()}>
              <Upload className="mr-1.5 h-4 w-4" /> {origem === 'setor' ? 'Escolher planilha' : 'Escolher CSV'}
            </Button>
            {arquivo && (
              <span className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                {arquivo.nome}
                <Button variant="ghost" size="icon" className="h-6 w-6" disabled={gravando}
                  aria-label="Tirar o arquivo"
                  onClick={() => {
                    setArquivo(null); setPrevia(null);
                    if (inputRef.current) inputRef.current.value = '';
                  }}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </span>
            )}
          </div>

          <p className="text-[11px] text-muted-foreground">
            {origem === 'geral'
              ? 'CSV de 60 colunas. Recorta por data de confirmação e nunca traz venda em aberto — para ter data de confirmação, a venda precisou ser confirmada.'
              : 'Planilha .xlsx de 119 colunas. Recorta por data da venda, e é o único que traz venda em aberto.'}
          </p>

          {previa && previa.r.colunasFaltando.length > 0 && (
            <Aviso tom="alerta">
              Este arquivo não tem as colunas do relatório de prospecção. Faltam:{' '}
              <strong>{previa.r.colunasFaltando.join(', ')}</strong>.
            </Aviso>
          )}

          {previa && previa.r.colunasFaltando.length === 0 && (
            <div className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
                <Numero rotulo="Mês" valor={previa.r.mes ?? '—'} />
                <Numero rotulo="Linhas" valor={String(previa.r.linhas.length)} />
                <Numero rotulo="Na régua" valor={String(previa.r.quantidadeNaRegua)} />
                <Numero rotulo="Faturamento na régua" valor={formatBRL(previa.r.faturamentoNaRegua)} />
                <Numero rotulo="Franquias" valor={String(previa.r.franquias.length)} />
                {previa.tipo === 'setor' && (
                  <Numero rotulo="Em aberto" valor={String(previa.r.abertas)} />
                )}
              </div>

              {previa.r.duplicadosResolvidos.length > 0 && (
                <Aviso tom="info">
                  <strong>{previa.r.duplicadosResolvidos.length} NR</strong> vieram mais de uma vez e
                  foram resolvidos — a última linha de cada um venceu. Não é erro: é devolução
                  seguida de reconfirmação com troca de produto.
                </Aviso>
              )}

              {previa.r.descartadas > 0 && (
                <Aviso tom="alerta">
                  <strong>{previa.r.descartadas} linha{previa.r.descartadas > 1 ? 's' : ''}</strong> não
                  entra{previa.r.descartadas > 1 ? 'm' : ''}:
                  <ul className="mt-1 list-disc space-y-0.5 pl-4">
                    {previa.r.erros.slice(0, 5).map(e => <li key={e}>{e}</li>)}
                  </ul>
                  {previa.r.erros.length > 5 && (
                    <p className="mt-1">…e mais {previa.r.erros.length - 5}.</p>
                  )}
                </Aviso>
              )}

              {!previa.r.mes && (
                <Aviso tom="alerta">
                  Sem um mês único, o lote não tem o que substituir. Exporte um mês por vez.
                </Aviso>
              )}

              {progresso && (
                <div className="space-y-1">
                  <Progress value={(progresso.feitas / Math.max(progresso.total, 1)) * 100} />
                  <p className="text-[11px] tabular-nums text-muted-foreground">
                    {progresso.feitas} de {progresso.total} linhas
                  </p>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" disabled={!podeGravar || gravando} onClick={() => void importar()}>
                  {gravando ? 'Importando…' : 'Importar e trocar o retrato do mês'}
                </Button>
                <p className="text-[11px] text-muted-foreground">
                  A carga anterior de {previa.r.mes ?? 'este mês'} ({origem}) será aposentada.
                </p>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ── 2. Franquias ────────────────────────────────────────────────── */}
      <section className="space-y-3 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-[13px] font-semibold">
            <Building2 className="h-4 w-4 text-muted-foreground" aria-hidden />
            2. De qual setor é cada franquia
            {semSetor.length > 0 && (
              <Badge variant="outline"
                className="bg-warning/15 text-warning border-warning/30 text-[10px]">
                {semSetor.length} sem setor
              </Badge>
            )}
          </h2>
          <p className="text-[11px] text-muted-foreground">
            {franquias.length} franquia{franquias.length === 1 ? '' : 's'} vista{franquias.length === 1 ? '' : 's'}
          </p>
        </div>

        {franquias.length === 0 ? (
          <p className="py-6 text-center text-[12px] text-muted-foreground">
            As franquias aparecem aqui depois da primeira importação.
          </p>
        ) : (
          <>
            <Aviso tom="info">
              Franquia sem setor <strong>não é erro</strong> — é franquia que ninguém cadastrou
              ainda. O faturamento dela continua visível, identificado pelo código; vincular é o
              que o torna oficial para um setor.
            </Aviso>
            <div className="overflow-hidden rounded-lg border border-border">
              {franquias.map(f => (
                <div key={f.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border/60 px-3 py-2 last:border-b-0">
                  <span className="font-mono text-[12px] tabular-nums text-muted-foreground">
                    {f.codigo}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px]">{f.nome || '—'}</span>
                  <Badge variant="outline" className={cn('text-[10px]',
                    f.estado === 'vinculado' ? 'bg-success/15 text-success border-success/30'
                    : f.estado === 'ignorado' ? 'bg-muted text-muted-foreground border-border'
                    : 'bg-warning/15 text-warning border-warning/30')}>
                    {ESTADO_FRANQUIA_LABEL[f.estado]}
                  </Badge>

                  {podeVincular ? (
                    <Select
                      value={f.estado === 'ignorado' ? 'ignorado' : (f.setor_id ?? SEM_SETOR)}
                      onValueChange={v => {
                        if (v === 'ignorado') void mudarFranquia(f, 'ignorado', null);
                        else if (v === SEM_SETOR) void mudarFranquia(f, 'novo', null);
                        else void mudarFranquia(f, 'vinculado', v);
                      }}>
                      <SelectTrigger className="h-8 w-[220px] text-[12px]"
                        aria-label={`Setor da franquia ${f.codigo}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={SEM_SETOR}>Sem setor ainda</SelectItem>
                        {setores.map(s => (
                          <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                        ))}
                        <SelectItem value="ignorado">Ignorar esta franquia</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="flex items-center gap-1 text-[12px] text-muted-foreground">
                      <Link2 className="h-3.5 w-3.5" aria-hidden />
                      {f.setores?.nome ?? '—'}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {/* ── 4. Projeção ─────────────────────────────────────────────────── */}
      <Projecao lote={geralVigente} podeProjetar={podeProjetar} onProjetou={() => void recarregar()} />

      {/* ── 5. Conciliação ──────────────────────────────────────────────── */}
      <Conciliacao empresaId={empresaId} mes={mesDaConciliacao} />

      {/* ── 3. Histórico ────────────────────────────────────────────────── */}
      <section className="space-y-3 rounded-xl border border-border bg-card p-4">
        <h2 className="flex items-center gap-2 text-[13px] font-semibold">
          <History className="h-4 w-4 text-muted-foreground" aria-hidden />
          3. Cargas
        </h2>

        {lotes.length === 0 ? (
          <p className="py-6 text-center text-[12px] text-muted-foreground">
            Nenhuma carga ainda.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[12px]">
              <thead>
                <tr className="border-b border-border text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                  <th className="py-1.5 pr-3">Mês</th>
                  <th className="py-1.5 pr-3">Origem</th>
                  <th className="py-1.5 pr-3">Estado</th>
                  <th className="py-1.5 pr-3 text-right">Linhas</th>
                  <th className="py-1.5 pr-3 text-right">Na régua</th>
                  <th className="py-1.5 pr-3">Quem</th>
                  <th className="py-1.5">Quando</th>
                </tr>
              </thead>
              <tbody>
                {lotes.map(l => (
                  <tr key={l.id} className="border-b border-border/50 last:border-b-0">
                    <td className="py-1.5 pr-3 tabular-nums">{l.mes?.slice(0, 7)}</td>
                    <td className="py-1.5 pr-3">{l.origem === 'geral' ? 'Geral' : 'Setor'}</td>
                    <td className="py-1.5 pr-3">
                      <Badge variant="outline" className={cn('text-[10px]',
                        l.estado === 'vigente' ? 'bg-success/15 text-success border-success/30'
                                               : 'bg-muted text-muted-foreground border-border')}>
                        {ESTADO_LOTE_LABEL[l.estado] ?? l.estado}
                      </Badge>
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{l.linhas_aceitas}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">
                      {l.quantidade_na_regua} · {formatBRL(l.faturamento_na_regua)}
                    </td>
                    <td className="py-1.5 pr-3">{l.perfis?.nome ?? '—'}</td>
                    <td className="py-1.5">{formatDate(l.importado_em?.slice(0, 10))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
