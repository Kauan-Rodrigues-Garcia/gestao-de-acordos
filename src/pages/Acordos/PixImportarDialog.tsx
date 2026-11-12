/**
 * PixImportarDialog — importar a planilha do Pix que a liderança mantém por
 * fora, conferindo cada NR com o Pix de TODOS os setores antes de lançar
 * (12/11/2026).
 *
 * Até aqui o «Importar» lançava direto: lia só a primeira aba, esperava o
 * cabeçalho na linha 1, procurava o operador pelo nome (a planilha usa o
 * login), punha tudo na mesma data e descartava o NR repetido sem dizer qual
 * era. Agora o arquivo vira uma conferência:
 *
 *   1. escolhe o arquivo — a aba do mês da tela já vem escolhida;
 *   2. cada NR é procurado no Pix inteiro da empresa (ver `pixImportacao`);
 *   3. o que falta vem marcado para adicionar; o repetido aparece com quem o
 *      tem, de que setor, quando e em que status, para a pessoa verificar;
 *   4. o que a planilha diz que já foi pago (verde no Play 2, «pg» na SIT da
 *      Digital) entra APROVADO E PAGO; o que já estava no Pix sem isso cai em
 *      «Pagamento a acertar», marcado para aprovar e pagar;
 *   5. só acontece o que estiver marcado, cada linha com a data dela.
 *
 * O arquivo não sai do navegador: só as linhas marcadas viram registro.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, Copy, Download, FileSpreadsheet, Play, RefreshCw, Upload, UserX,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/lib/index';
import { cn } from '@/lib/utils';
import { rotuloDoMes } from '@/lib/mesReferencia';
import { dataLocalPix } from '@/lib/mesPix';
import { baixarArquivo, TIPO_XLSX } from '@/lib/baixarArquivo';
import { copiarTexto } from '@/lib/clipboard';
import {
  PIX_AUTO_PCT_PADRAO, aprovarPixEmLote, comissaoDe, fetchRegistrosPixConferencia,
  inserirPixImportados, marcarComissaoPagaEmLote, valorFixoDoSetor,
  type LinhaPixImportada, type RegistroPixConferencia,
} from '@/services/pix_automatico.service';
import {
  chaveDoOperadorDaPlanilha, escolherAba, matrizDaAba, mesCurto, mesDasLinhas, type AbaDoArquivo, conferirPlanilhaPix, contarSituacoes, indexarPorNr,
  lerAbaPix, reconhecerOperador, type LinhaConferida, type PessoaPix, type SituacaoImportacao,
} from './pixImportacao';
import { setorDoRegistroPix } from './pixAutomaticoView';
import { fmtPct, STATUS_INFO } from './pixTelaComum';
import type { PixTela } from './usePixAutomatico';

interface ArquivoLido {
  nome: string;
  /** Só as abas visíveis que têm cabeçalho de Pix. */
  abas: string[];
  conteudo: Record<string, AbaDoArquivo>;
  /** O resumo de cada aba, para a lista: o mês das datas, linhas e pagas. */
  resumo: Record<string, { mes: string | null; linhas: number; pagas: number }>;
}

const SITUACOES: { key: SituacaoImportacao; label: string; dica: string }[] = [
  { key: 'faltando', label: 'Faltando no Pix', dica: 'Não estão em nenhum setor. Marcados, entram no Pix.' },
  { key: 'repetido', label: 'Repetidos', dica: 'O NR já está no Pix com outra pessoa ou em outro mês. Verifique.' },
  { key: 'acertar',  label: 'Pagamento a acertar', dica: 'Já lançados, mas o pago da planilha não bate com o do Pix.' },
  { key: 'lancado',  label: 'Já lançados', dica: 'Já estão no Pix com a mesma pessoa neste mês, e batem.' },
  { key: 'problema', label: 'Com problema', dica: 'NR ou valor ilegível, data de outro mês ou NR repetido na planilha.' },
];

const COR_SITUACAO: Record<SituacaoImportacao, string> = {
  faltando: 'text-primary',
  repetido: 'text-warning',
  acertar:  'text-warning',
  lancado:  'text-success',
  problema: 'text-destructive',
};

const fmtDia = (dia: string | null) => dia ? `${dia.slice(8, 10)}/${dia.slice(5, 7)}/${dia.slice(0, 4)}` : '—';

interface Props {
  pix: PixTela;
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
}

export function PixImportarDialog({ pix, aberto, onAbertoChange }: Props) {
  const {
    empresa, perfil, mes, noMesAtual, diaNovo, fechamento, setorEscopo, setorFoco, clonesRef, carregar,
    pctPorSetor, podeAprovar, setMes,
  } = pix;
  const fileRef = useRef<HTMLInputElement>(null);

  const [arquivo, setArquivo] = useState<ArquivoLido | null>(null);
  const [aba, setAba] = useState('');
  const [lendo, setLendo] = useState(false);
  const [registros, setRegistros] = useState<RegistroPixConferencia[] | null>(null);
  const [pessoas, setPessoas] = useState<PessoaPix[]>([]);
  const [nomeSetor, setNomeSetor] = useState<Record<string, string>>({});
  const [erroBase, setErroBase] = useState<string | null>(null);
  /** Operador da planilha (chave) → pessoa escolhida na tela. */
  const [escolhidos, setEscolhidos] = useState<Record<string, string>>({});
  /** O que a pessoa marcou ou desmarcou, por cima do padrão da linha. */
  const [marcacoes, setMarcacoes] = useState<Record<string, boolean>>({});
  const [filtro, setFiltro] = useState<SituacaoImportacao>('faltando');
  const [verTodosOperadores, setVerTodosOperadores] = useState(false);
  const [gravando, setGravando] = useState<string | null>(null);
  const [falhas, setFalhas] = useState<Record<string, string>>({});

  // Fechou: começa do zero na próxima vez — conferência velha engana.
  useEffect(() => {
    if (aberto) return;
    setArquivo(null); setAba(''); setRegistros(null); setErroBase(null);
    setEscolhidos({}); setMarcacoes({}); setFalhas({}); setFiltro('faltando');
    setVerTodosOperadores(false);
  }, [aberto]);

  /** O Pix inteiro da empresa, as pessoas e os nomes dos setores. */
  async function carregarBase(): Promise<boolean> {
    if (!empresa?.id) return false;
    let qPessoas = supabase.from('perfis')
      .select('id, nome, usuario, email, setor_id, ativo, arquivado')
      .eq('empresa_id', empresa.id);
    if (setorEscopo) qPessoas = qPessoas.eq('setor_id', setorEscopo);
    const [base, ps, ss] = await Promise.all([
      fetchRegistrosPixConferencia(empresa.id),
      qPessoas.order('nome'),
      supabase.from('setores').select('id, nome').eq('empresa_id', empresa.id),
    ]);
    if (!base.ok) {
      setErroBase('Não consegui ler o Pix inteiro da empresa. Sem a lista completa, um NR que já existe '
        + 'pareceria faltando — tente de novo antes de adicionar.');
      setRegistros(null);
      return false;
    }
    setErroBase(null);
    setRegistros(base.registros);
    if (!ps.error) setPessoas((ps.data ?? []) as PessoaPix[]);
    if (!ss.error) {
      setNomeSetor(Object.fromEntries(((ss.data ?? []) as { id: string; nome: string }[]).map(s => [s.id, s.nome])));
    }
    return true;
  }

  async function lerArquivo(file: File) {
    setLendo(true);
    try {
      const [buf, xlsx] = await Promise.all([file.arrayBuffer(), import('@e965/xlsx')]);
      // `cellStyles`: a cor de fundo é a marca de «pago» do Play 2.
      const wb = xlsx.read(buf, { type: 'array', cellDates: false, cellStyles: true });
      const ocultas = new Set(
        (wb.Workbook?.Sheets ?? []).filter(s => s.Hidden).map(s => s.name),
      );
      const conteudo: Record<string, AbaDoArquivo> = {};
      const resumo: ArquivoLido['resumo'] = {};
      const abas: string[] = [];
      for (const nome of wb.SheetNames) {
        if (ocultas.has(nome)) continue;
        const aba = matrizDaAba(xlsx.utils, wb.Sheets[nome]);
        const lidaDaAba = lerAbaPix(aba.valores, aba.cores);
        if (lidaDaAba.erro) continue;
        conteudo[nome] = aba;
        resumo[nome] = {
          mes: mesDasLinhas(lidaDaAba.linhas),
          linhas: lidaDaAba.linhas.length,
          pagas: lidaDaAba.linhas.filter(l => l.pago).length,
        };
        abas.push(nome);
      }
      if (abas.length === 0) {
        toast.error('Nenhuma aba do arquivo tem as colunas do Pix (NR e Valor de Nota).');
        return;
      }
      if (!(await carregarBase())) return;
      setArquivo({ nome: file.name, abas, conteudo, resumo });
      setAba(escolherAba(abas.map(nome => ({ nome, mes: resumo[nome].mes })), mes) ?? abas[0]);
      setEscolhidos({}); setMarcacoes({}); setFalhas({});
    } catch (e) {
      console.warn('[PixImportar] leitura:', e);
      toast.error('Não consegui ler a planilha. Confira se é .xlsx, .xls ou .csv.');
    } finally {
      setLendo(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  const lida = useMemo(() => {
    const c = arquivo && aba ? arquivo.conteudo[aba] : null;
    return c ? lerAbaPix(c.valores, c.cores) : null;
  }, [arquivo, aba]);

  const pessoaPorId = useMemo(() => new Map(pessoas.map(p => [p.id, p])), [pessoas]);
  const reconhecidos = useMemo(() => {
    const m = new Map<string, PessoaPix | null>();
    for (const l of lida?.linhas ?? []) {
      const k = chaveDoOperadorDaPlanilha(l);
      if (!m.has(k)) m.set(k, reconhecerOperador(l, pessoas));
    }
    return m;
  }, [lida, pessoas]);

  const noPix = useMemo(() => indexarPorNr(registros ?? []), [registros]);
  const nomeDoSetor = (id: string | null) => (id && nomeSetor[id]) || 'sem setor';

  const conferidas = useMemo<LinhaConferida[]>(() => {
    if (!lida || !registros) return [];
    return conferirPlanilhaPix({
      linhas: lida.linhas,
      mes,
      noPix,
      pessoaDe: l => {
        const k = chaveDoOperadorDaPlanilha(l);
        const escolhido = escolhidos[k];
        if (escolhido) return pessoaPorId.get(escolhido) ?? null;
        return reconhecidos.get(k) ?? null;
      },
      nomeDoSetor,
      podeAprovar,
      comissaoNoPix: r => comissaoDe(r, pctPorSetor),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `nomeDoSetor` só lê `nomeSetor`.
  }, [lida, registros, mes, noPix, escolhidos, pessoaPorId, reconhecidos, nomeSetor, podeAprovar, pctPorSetor]);

  const contagem = useMemo(() => contarSituacoes(conferidas), [conferidas]);
  const estaMarcada = (l: LinhaConferida) => l.acao != null && (marcacoes[l.ref] ?? l.marcada);
  const marcadas = conferidas.filter(estaMarcada);
  const paraAdicionar = marcadas.filter(l => l.acao === 'adicionar');
  const paraAcertar = marcadas.filter(l => l.acao === 'acertar');
  const adicionarPagos = podeAprovar ? paraAdicionar.filter(l => l.pago).length : 0;
  const totalAdicionado = paraAdicionar.reduce((s, l) => s + (l.valor ?? 0), 0);
  const daVez = conferidas.filter(l => l.situacao === filtro);
  const pagasNaPlanilha = conferidas.filter(l => l.pago).length;

  /** Os operadores da planilha, um por linha — os sem dono primeiro. */
  const operadoresDaPlanilha = useMemo(() => {
    const m = new Map<string, { chave: string; texto: string; nome: string; linhas: number }>();
    for (const l of lida?.linhas ?? []) {
      const k = chaveDoOperadorDaPlanilha(l);
      if (!k) continue;
      const atual = m.get(k);
      if (atual) atual.linhas++;
      else m.set(k, { chave: k, texto: l.operador || l.nomeCompleto, nome: l.nomeCompleto, linhas: 1 });
    }
    return [...m.values()].sort((a, b) => {
      const sa = escolhidos[a.chave] || reconhecidos.get(a.chave) ? 1 : 0;
      const sb = escolhidos[b.chave] || reconhecidos.get(b.chave) ? 1 : 0;
      return sa - sb || a.texto.localeCompare(b.texto);
    });
  }, [lida, escolhidos, reconhecidos]);
  const semDono = operadoresDaPlanilha.filter(o => !escolhidos[o.chave] && !reconhecidos.get(o.chave));
  const pessoasDoSeletor = useMemo(
    () => pessoas.filter(p => p.ativo !== false && !p.arquivado),
    [pessoas],
  );
  const linhasSemOperador = (lida?.linhas ?? []).filter(l => !chaveDoOperadorDaPlanilha(l)).length;

  /** Linhas de outro mês: o aviso grande, porque costuma ser a aba errada. */
  const deOutroMes = conferidas.filter(l => l.dia && l.dia.slice(0, 7) !== mes).length;
  const mesDaAba = arquivo && aba ? arquivo.resumo[aba]?.mes ?? null : null;

  function marcarTodas(valor: boolean) {
    setMarcacoes(atual => {
      const novo = { ...atual };
      for (const l of daVez) if (l.acao) novo[l.ref] = valor;
      return novo;
    });
  }

  /** % (e valor fixo) que a aprovação trava, pelo setor da linha. */
  const regraDoSetor = (setorId: string | null) => ({
    pct: setorId != null ? (pctPorSetor[setorId] ?? PIX_AUTO_PCT_PADRAO) : PIX_AUTO_PCT_PADRAO,
    fixo: valorFixoDoSetor(pctPorSetor, setorId),
  });

  async function aplicar() {
    if (!empresa?.id || !perfil?.id || marcadas.length === 0) return;
    if (fechamento.impedir('importar Pix neste mês')) return;
    const quem = { id: perfil.id, nome: perfil.nome ?? perfil.email ?? '—' };
    const recusas: Record<string, string> = {};
    let adicionados = 0, aprovados = 0, pagos = 0;
    try {
      // 1. O que falta entra (pendente — é o que a RLS aceita no insert).
      setGravando('Adicionando…');
      const linhas: LinhaPixImportada[] = paraAdicionar.map(l => ({
        ref: l.ref,
        nrCliente: l.nr,
        valor: l.valor!,
        operadorId: l.pessoa!.id,
        operadorNome: l.pessoa!.nome,
        setorId: setorDoRegistroPix(l.pessoa!, setorFoco, clonesRef.current),
        // A data da planilha; sem ela, a do formulário quando a tela está em
        // outro mês, e agora no mês corrente — a mesma regra do registro manual.
        dia: l.dia ?? (noMesAtual ? null : diaNovo),
      }));
      const { importados, falhas: f } = linhas.length
        ? await inserirPixImportados(empresa.id, linhas)
        : { importados: [], falhas: [] };
      for (const x of f) recusas[x.ref] = x.erro;
      adicionados = importados.length;

      // 2. O que a planilha diz que foi pago: aprovar e pagar.
      const idDoRef = new Map(importados.map(x => [x.ref, x.id]));
      const setorDoRef = new Map(linhas.map(l => [l.ref, l.setorId]));
      const aAprovar: { id: string; setor: string | null }[] = [];
      const aPagar: string[] = [];
      if (podeAprovar) {
        for (const l of paraAdicionar) {
          const id = idDoRef.get(l.ref);
          if (!l.pago || !id) continue;
          aAprovar.push({ id, setor: setorDoRef.get(l.ref) ?? null });
          aPagar.push(id);
        }
      }
      for (const l of paraAcertar) {
        if (!l.registro) continue;
        if (l.registro.status === 'pendente') aAprovar.push({ id: l.registro.id, setor: l.registro.setor_id });
        aPagar.push(l.registro.id);
      }

      if (aAprovar.length > 0) {
        setGravando('Aprovando…');
        // Um UPDATE por % de setor: a aprovação trava o % de cada linha.
        const porRegra = new Map<string, { pct: number; fixo: number | null; ids: string[] }>();
        for (const a of aAprovar) {
          const r = regraDoSetor(a.setor);
          const k = `${r.pct}|${r.fixo ?? ''}`;
          const g = porRegra.get(k) ?? { ...r, ids: [] };
          g.ids.push(a.id);
          porRegra.set(k, g);
        }
        for (const g of porRegra.values()) {
          const r = await aprovarPixEmLote({
            ids: g.ids, pctAtual: g.pct, fixoAtual: g.fixo, avaliadorId: quem.id, avaliadorNome: quem.nome,
          });
          aprovados += r.count;
          if (!r.ok) { toast.error('Erro ao aprovar: ' + r.error); break; }
        }
      }
      if (aPagar.length > 0) {
        setGravando('Marcando pagos…');
        const r = await marcarComissaoPagaEmLote({ ids: aPagar, responsavelId: quem.id, responsavelNome: quem.nome });
        pagos = r.count;
        if (!r.ok) toast.error('Erro ao marcar pago: ' + r.error);
      }

      setFalhas(recusas);
      setMarcacoes({});
      const feito = [
        adicionados > 0 && `${adicionados} adicionado${adicionados !== 1 ? 's' : ''}`,
        aprovados > 0 && `${aprovados} aprovado${aprovados !== 1 ? 's' : ''}`,
        pagos > 0 && `${pagos} marcado${pagos !== 1 ? 's' : ''} como pago${pagos !== 1 ? 's' : ''}`,
      ].filter(Boolean).join(' · ');
      if (feito) toast.success(`Pix atualizado: ${feito}.`);
      const nRecusas = Object.keys(recusas).length;
      if (nRecusas > 0) {
        toast.error(`${nRecusas} linha${nRecusas !== 1 ? 's' : ''} recusada${nRecusas !== 1 ? 's' : ''} pelo banco — o motivo está na linha.`, { duration: 7000 });
      }
    } finally {
      // Confere de novo: o que entrou passa para «Já lançados».
      setGravando('Conferindo de novo…');
      await Promise.all([carregarBase(), carregar()]);
      setGravando(null);
    }
  }

  async function baixarConferencia() {
    if (conferidas.length === 0) return;
    const { utils, write } = await import('@e965/xlsx');
    const rotulo = Object.fromEntries(SITUACOES.map(s => [s.key, s.label]));
    const linhas = conferidas.map(l => ({
      Linha: l.linha,
      Data: fmtDia(l.dia),
      'Operador (planilha)': l.operador,
      'Operador (app)': l.pessoa?.nome ?? '',
      NR: l.nr || l.nrBruto,
      'Valor de Nota': l.valor ?? '',
      '% planilha': l.pct ?? '',
      'Comissão planilha': l.comissao ?? '',
      'Pago na planilha': l.pago ? `sim (${l.marcaPago})` : 'não',
      Situação: rotulo[l.situacao],
      Detalhe: falhas[l.ref] ?? l.motivo,
      'No Pix': l.noPix.map(r =>
        `${r.operador_nome ?? '—'} · ${nomeDoSetor(r.setor_id)} · ${fmtDia(dataLocalPix(r.criado_em))} · `
        + `${formatCurrency(r.valor)} · ${STATUS_INFO[r.status]?.label ?? r.status}${r.pago ? ' · pago' : ''}`).join(' | '),
    }));
    const wb = utils.book_new();
    utils.book_append_sheet(wb, utils.json_to_sheet(linhas), 'Conferência');
    const buf = write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    baixarArquivo(buf, `conferencia_pix_${aba.trim().toLowerCase().replace(/\s+/g, '_') || mes}.xlsx`, TIPO_XLSX);
  }

  // O % do setor de quem recebe, para apontar a linha em que a planilha paga outro.
  const pctDoSetor = (l: LinhaConferida) => {
    if (!l.pessoa) return null;
    const setor = l.registro?.setor_id ?? setorDoRegistroPix(l.pessoa, setorFoco, clonesRef.current);
    return setor != null && pctPorSetor[setor] != null ? pctPorSetor[setor] : null;
  };

  const resumoDaAcao = [
    paraAdicionar.length > 0 && <>
      <strong className="text-foreground">{paraAdicionar.length}</strong> NR{paraAdicionar.length !== 1 ? 's' : ''} novo{paraAdicionar.length !== 1 ? 's' : ''}
      {' '}(<strong className="text-foreground">{formatCurrency(totalAdicionado)}</strong> em nota
      {adicionarPagos > 0 ? `, ${adicionarPagos} já aprovado${adicionarPagos !== 1 ? 's' : ''} e pago${adicionarPagos !== 1 ? 's' : ''}` : ''})
    </>,
    paraAcertar.length > 0 && <>
      <strong className="text-foreground">{paraAcertar.length}</strong> pagamento{paraAcertar.length !== 1 ? 's' : ''} acertado{paraAcertar.length !== 1 ? 's' : ''}
    </>,
  ].filter(Boolean);

  return (
    <Dialog open={aberto} onOpenChange={o => { if (!gravando) onAbertoChange(o); }}>
      <DialogContent className="max-w-6xl w-[calc(100vw-2rem)] max-h-[92vh] flex flex-col gap-3" aria-describedby="dlg-importar-pix">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-primary" />
            Importar planilha do Pix · {rotuloDoMes(mes)}
          </DialogTitle>
          <DialogDescription id="dlg-importar-pix">
            Cada NR da planilha é conferido com o Pix de todos os setores. O que estiver faltando você
            adiciona; o que já existir aparece para verificar; o que a planilha marca como pago entra aprovado
            e pago. Nada muda sem você clicar em «Aplicar».
          </DialogDescription>
        </DialogHeader>

        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) lerArquivo(f); }} />

        {!arquivo ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border py-10 text-center">
            <Upload className="w-7 h-7 text-muted-foreground/60" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">Escolha a planilha do Pix Automático</p>
              <p className="text-xs text-muted-foreground max-w-md">
                Lido: data, operador (login), NR, Valor de Nota, % e valor (comissão). Pago é a linha
                verde ou a coluna SIT com «pago»/«pg». Nome, código/crachá, chave Pix e líder ficam de fora.
                Com várias abas, a de {rotuloDoMes(mes).split(' ')[0].toLowerCase()} já vem escolhida.
              </p>
            </div>
            <Button size="sm" onClick={() => fileRef.current?.click()} disabled={lendo} className="gap-1.5">
              {lendo ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              {lendo ? 'Lendo e conferindo…' : 'Escolher arquivo'}
            </Button>
            {erroBase && <p className="text-xs text-destructive max-w-md">{erroBase}</p>}
          </div>
        ) : (
          <>
            {/* ── O arquivo e a aba ── */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="flex items-center gap-1.5 font-medium text-foreground">
                <FileSpreadsheet className="w-3.5 h-3.5 text-muted-foreground" /> {arquivo.nome}
              </span>
              {(() => {
                const rotulo = (a: string) => {
                  const r = arquivo.resumo[a];
                  return `${a.trim()} · ${r.mes ? mesCurto(r.mes) : 'sem data'} · ${r.linhas} linha${r.linhas !== 1 ? 's' : ''}, ${r.pagas} paga${r.pagas !== 1 ? 's' : ''}`;
                };
                // Uma aba só: o mesmo resumo, sem lista — de que mês ela é
                // continua importando.
                return arquivo.abas.length > 1 ? (
                  <label className="flex items-center gap-1.5 text-muted-foreground">
                    aba
                    <select value={aba} onChange={e => { setAba(e.target.value); setMarcacoes({}); setFalhas({}); }}
                      className="h-7 max-w-full rounded-md border border-input bg-background px-2 text-xs text-foreground">
                      {arquivo.abas.map(a => <option key={a} value={a}>{rotulo(a)}</option>)}
                    </select>
                  </label>
                ) : (
                  <span className="text-muted-foreground">· aba {rotulo(aba)}</span>
                );
              })()}
              <span className="text-muted-foreground">· {registros?.length ?? 0} registros no Pix da empresa</span>
              <Button variant="ghost" size="sm" onClick={() => fileRef.current?.click()} disabled={lendo || !!gravando}
                className="ml-auto h-7 gap-1 text-xs">
                <Upload className="w-3 h-3" /> Outro arquivo
              </Button>
            </div>

            {erroBase && (
              <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{erroBase}</p>
            )}

            {/* A aba é de outro mês: a saída é trocar o mês da tela (a aba fica)
                ou escolher outra aba. Só entram as linhas do mês da tela —
                registrar em outubro com novembro na tela confundiria a aba. */}
            {mesDaAba && mesDaAba !== mes ? (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-warning/40 bg-warning/[0.08] px-3 py-2 text-xs">
                <AlertTriangle className="w-4 h-4 shrink-0 text-warning" />
                <span className="min-w-0 flex-1">
                  <strong className="text-foreground">
                    A aba «{aba.trim()}» é de {rotuloDoMes(mesDaAba).toLowerCase()}, e a tela está em {rotuloDoMes(mes).toLowerCase()}.
                  </strong>{' '}
                  <span className="text-muted-foreground">
                    Só entram as linhas do mês da tela ({conferidas.length - deOutroMes} de {conferidas.length}).
                  </span>
                </span>
                <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!!gravando}
                  onClick={() => { setMes(mesDaAba); setMarcacoes({}); setFalhas({}); }}>
                  Ver {rotuloDoMes(mesDaAba).split(' ')[0].toLowerCase()}
                </Button>
              </div>
            ) : deOutroMes > 0 && (
              <p className="text-[11px] text-muted-foreground">
                {deOutroMes} linha{deOutroMes !== 1 ? 's' : ''} com data de outro mês ficam em «Com problema».
              </p>
            )}

            {pagasNaPlanilha > 0 && !podeAprovar && (
              <p className="rounded-lg border border-warning/40 bg-warning/[0.08] px-3 py-2 text-xs text-muted-foreground">
                Você não tem a permissão de aprovar Pix: as linhas pagas na planilha entram pendentes, e o acerto
                de pagamento fica com quem aprova.
              </p>
            )}

            {/* ── Quem é quem ── O login da planilha → a pessoa do app. */}
            {operadoresDaPlanilha.length > 0 && (semDono.length > 0 || verTodosOperadores) && (
              <div className="rounded-lg border border-border p-3 space-y-2">
                <div className="flex items-center gap-2 text-xs">
                  <UserX className={cn('w-3.5 h-3.5', semDono.length > 0 ? 'text-warning' : 'text-muted-foreground')} />
                  <span className="font-semibold text-foreground">
                    {semDono.length > 0
                      ? `${semDono.length} operador${semDono.length !== 1 ? 'es' : ''} da planilha sem correspondente no app`
                      : 'Operadores da planilha'}
                  </span>
                  <span className="text-muted-foreground">— escolha quem é, e as linhas dele são conferidas de novo.</span>
                </div>
                <div className="grid gap-1.5 sm:grid-cols-2 max-h-48 overflow-y-auto">
                  {(verTodosOperadores ? operadoresDaPlanilha : semDono).map(o => {
                    const auto = reconhecidos.get(o.chave);
                    return (
                      <label key={o.chave} className="flex items-center gap-2 text-xs">
                        <span className="min-w-0 flex-1 truncate" title={o.nome}>
                          <span className="font-mono text-foreground">{o.texto}</span>
                          <span className="text-muted-foreground"> · {o.linhas} linha{o.linhas !== 1 ? 's' : ''}</span>
                        </span>
                        <select
                          value={escolhidos[o.chave] ?? auto?.id ?? ''}
                          onChange={e => setEscolhidos(atual => ({ ...atual, [o.chave]: e.target.value }))}
                          className={cn('h-7 w-48 rounded-md border bg-background px-2 text-xs',
                            escolhidos[o.chave] || auto ? 'border-input' : 'border-warning/60')}
                        >
                          <option value="">— escolher —</option>
                          {pessoasDoSeletor.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                        </select>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
            {operadoresDaPlanilha.length > 0 && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground -mt-1">
                <button type="button" className="underline-offset-2 hover:underline"
                  onClick={() => setVerTodosOperadores(v => !v)}>
                  {verTodosOperadores ? 'Esconder operadores reconhecidos' : `Ver os ${operadoresDaPlanilha.length} operadores da planilha`}
                </button>
                {linhasSemOperador > 0 && <span>· {linhasSemOperador} linha{linhasSemOperador !== 1 ? 's' : ''} sem operador</span>}
              </div>
            )}

            {/* ── As cinco situações ── */}
            <div role="group" aria-label="Situação das linhas" className="grid grid-cols-2 gap-1.5 rounded-xl border border-border bg-muted/40 p-1 sm:grid-cols-3 lg:grid-cols-5">
              {SITUACOES.map(s => (
                <button key={s.key} type="button" aria-pressed={filtro === s.key} onClick={() => setFiltro(s.key)}
                  title={s.dica}
                  className={cn('rounded-lg border px-3 py-1.5 text-left transition-colors',
                    filtro === s.key ? 'border-border bg-background shadow-sm' : 'border-transparent hover:bg-background/70')}>
                  <span className={cn('block text-lg font-bold tabular-nums leading-tight', COR_SITUACAO[s.key])}>
                    {contagem[s.key]}
                  </span>
                  <span className="block truncate text-[11px] font-medium text-muted-foreground">{s.label}</span>
                </button>
              ))}
            </div>

            {/* ── A tabela da situação escolhida ── */}
            <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-border">
              {daVez.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground">
                  <CheckCircle2 className="w-6 h-6 opacity-30" />
                  <p className="text-xs">Nenhuma linha aqui.</p>
                </div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="sticky top-0 z-10 bg-background">
                    <tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground/80">
                      <th className="w-8 px-2 py-2">
                        {daVez.some(l => l.acao) && (
                          <Checkbox
                            aria-label="Marcar todas desta lista"
                            checked={daVez.filter(l => l.acao).every(estaMarcada)}
                            onCheckedChange={v => marcarTodas(v === true)}
                          />
                        )}
                      </th>
                      <th className="px-2 py-2 text-left font-semibold">Linha</th>
                      <th className="px-2 py-2 text-left font-semibold">Data</th>
                      <th className="px-2 py-2 text-left font-semibold">Operador</th>
                      <th className="px-2 py-2 text-left font-semibold">NR</th>
                      <th className="px-2 py-2 text-right font-semibold">Valor de Nota</th>
                      <th className="px-2 py-2 text-right font-semibold" title="% e comissão como a planilha calculou">% · comissão</th>
                      <th className="px-2 py-2 text-left font-semibold">Situação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {daVez.map(l => {
                      const pctSetor = pctDoSetor(l);
                      const pctDiferente = l.pct != null && pctSetor != null && Math.abs(l.pct - pctSetor) > 0.0001;
                      return (
                        <tr key={l.ref} className={cn('border-b border-border/50 align-top', estaMarcada(l) && 'bg-primary/[0.04]')}>
                          <td className="px-2 py-2">
                            {l.acao && (
                              <Checkbox aria-label={`Marcar NR ${l.nr}`} checked={estaMarcada(l)}
                                onCheckedChange={v => setMarcacoes(atual => ({ ...atual, [l.ref]: v === true }))} />
                            )}
                          </td>
                          <td className="px-2 py-2 font-mono text-muted-foreground">{l.linha}</td>
                          <td className="px-2 py-2 font-mono whitespace-nowrap">{fmtDia(l.dia)}</td>
                          <td className="px-2 py-2">
                            <div className="text-foreground">{l.pessoa?.nome ?? <span className="text-warning">não reconhecido</span>}</div>
                            <div className="font-mono text-[10px] text-muted-foreground">{l.operador || l.nomeCompleto || '—'}</div>
                          </td>
                          <td className="px-2 py-2 font-mono">
                            <span className="inline-flex items-center gap-1">
                              {l.nr || <span className="text-destructive">{l.nrBruto || '—'}</span>}
                              {l.nr && (
                                <button type="button" title="Copiar NR" className="text-muted-foreground/60 hover:text-foreground"
                                  onClick={() => { void copiarTexto(l.nr, `NR ${l.nr} copiado`); }}>
                                  <Copy className="w-3 h-3" />
                                </button>
                              )}
                            </span>
                            {l.pago && (
                              <span className="mt-0.5 block w-fit rounded-full border border-success/30 bg-success/10 px-1.5 text-[10px] font-semibold text-success"
                                title={`A planilha marca como pago: ${l.marcaPago}`}>
                                pago · {l.marcaPago}
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-2 text-right font-mono">{l.valor != null ? formatCurrency(l.valor) : '—'}</td>
                          <td className="px-2 py-2 text-right font-mono whitespace-nowrap">
                            <span className={cn(pctDiferente ? 'text-warning' : 'text-muted-foreground')}
                              title={pctDiferente ? `O setor paga ${fmtPct(pctSetor!)} no Pix (fora o bônus do período, se houver)` : undefined}>
                              {l.pct != null ? fmtPct(l.pct) : '—'}
                            </span>
                            <div className={cn(l.comissaoDiferente ? 'text-warning' : 'text-muted-foreground')}>
                              {l.comissao != null ? formatCurrency(l.comissao) : ''}
                            </div>
                          </td>
                          <td className="px-2 py-2 min-w-[260px]">
                            <div className={cn('font-medium', falhas[l.ref] ? 'text-destructive' : COR_SITUACAO[l.situacao])}>
                              {falhas[l.ref] ?? l.motivo}
                            </div>
                            {l.noPix.length > 0 && (
                              <ul className="mt-1 space-y-0.5">
                                {l.noPix.map(r => (
                                  <li key={r.id} className="flex flex-wrap items-center gap-x-1.5 text-[11px] text-muted-foreground">
                                    <span className="text-foreground">{r.operador_nome ?? '—'}</span>
                                    <span>· {nomeDoSetor(r.setor_id)}</span>
                                    <span className="font-mono">· {fmtDia(dataLocalPix(r.criado_em))}</span>
                                    <span className={cn('font-mono', l.valorDiferente && 'text-warning')}>· {formatCurrency(r.valor)}</span>
                                    <span className={cn('rounded-full border px-1.5 text-[10px] font-semibold', STATUS_INFO[r.status]?.cls)}>
                                      {STATUS_INFO[r.status]?.label ?? r.status}{r.pago ? ' · pago' : ''}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* ── O que vai acontecer ── */}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
              <Button variant="outline" size="sm" onClick={baixarConferencia} disabled={conferidas.length === 0}
                className="gap-1.5 h-8 text-xs">
                <Download className="w-3.5 h-3.5" /> Baixar conferência
              </Button>
              <span className="text-xs text-muted-foreground sm:ml-auto">
                {resumoDaAcao.length > 0
                  ? <>Vai acontecer: {resumoDaAcao.map((r, i) => <span key={i}>{i > 0 ? ' · ' : ''}{r}</span>)}.</>
                  : 'Nenhuma linha marcada.'}
              </span>
              <Button size="sm" onClick={aplicar} disabled={!!gravando || marcadas.length === 0 || !!erroBase}
                className="gap-1.5 h-8 text-xs">
                {gravando ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                {gravando ?? `Aplicar ${marcadas.length || ''}`}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
