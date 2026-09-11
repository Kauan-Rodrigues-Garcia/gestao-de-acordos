import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { carregarResumo, excluirRelatorio, importarRelatorio } from '@/services/relatorioPaguePlay/service';
import { diaAnterior, formatarCentavos, validarPeriodo, type Modalidade, type RelatorioLido, type ResumoSalvo } from '@/services/relatorioPaguePlay/modelo';
import { documentoRelatorio } from './documento';

const nome = (modo: Modalidade) => modo === 'pagamento' ? 'pagamento' : 'conciliação';
const dataBR = (iso: string) => iso.split('-').reverse().join('/');
const hojeLocal = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const mensagemErro = (e: unknown) => e instanceof Error ? e.message : 'Não foi possível concluir a operação.';

function criarPrevia(relatorio: RelatorioLido, hoje: string): ResumoSalvo {
  return { hoje, primeiraImportacaoPendente: true, quantidade: relatorio.linhas.length,
    grupos: relatorio.linhas, dias: [], ultimaImportacao: null };
}

export default function RelatorioPaguePlay({ empresaId, versao }: { empresaId: string; versao: number }) {
  const [modo, setModo] = useState<Modalidade>('pagamento');
  const contextoAtual = `${empresaId}:${modo}`;
  const [contexto, setContexto] = useState(contextoAtual);
  const [resumo, setResumo] = useState<ResumoSalvo | null>(null);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [progresso, setProgresso] = useState(0);
  const [arquivo, setArquivo] = useState<{ nome: string; dados: RelatorioLido } | null>(null);
  const [inicio, setInicio] = useState('');
  const [fim, setFim] = useState('');
  const [confirmado, setConfirmado] = useState(false);
  const [previa, setPrevia] = useState<ResumoSalvo | null>(null);
  const [mes, setMes] = useState('');
  const [exclusao, setExclusao] = useState<'mes' | 'geral' | null>(null);
  const [altura, setAltura] = useState(1700);
  const [pronto, setPronto] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const pedido = useRef(0);
  const documento = useMemo(documentoRelatorio, []);

  const atualizar = useCallback(async () => {
    const id = ++pedido.current;
    setCarregando(true); setErro('');
    try {
      const dados = await carregarResumo(empresaId, modo);
      if (id === pedido.current) setResumo(dados);
    } catch (e) {
      if (id === pedido.current) { setResumo(null); setErro(mensagemErro(e)); }
    } finally { if (id === pedido.current) setCarregando(false); }
  }, [empresaId, modo]);

  useEffect(() => {
    setResumo(null); setArquivo(null); setPrevia(null); setAviso(''); setExclusao(null); setPronto(false); setContexto(contextoAtual);
    void atualizar();
    // Contador de requisições (não é ref de nó DOM): invalida respostas tardias.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => { pedido.current++; };
  }, [atualizar, contextoAtual]);
  useEffect(() => { if (versao) void atualizar(); }, [versao, atualizar]);

  const exibido = contexto === contextoAtual ? previa ?? resumo : null;
  useEffect(() => {
    const receber = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow) return;
      if (event.data?.type === 'pp-relatorio-pronto') setPronto(true);
      if (event.data?.type === 'pp-relatorio-altura' && Number.isFinite(event.data.altura)) setAltura(Math.max(500, Math.min(event.data.altura, 40000)));
    };
    window.addEventListener('message', receber);
    return () => window.removeEventListener('message', receber);
  }, []);
  useEffect(() => {
    if (pronto && exibido) frame.current?.contentWindow?.postMessage({ type: 'pp-relatorio-dados', resumo: exibido, modalidade: modo }, window.location.origin);
  }, [pronto, exibido, modo]);

  const hoje = resumo?.hoje ?? hojeLocal();
  const meses = [...new Set(resumo?.dias.map(d => d.data.slice(0, 7)) ?? [])].sort().reverse();
  const diasDoMes = useMemo(() => {
    if (!mes || !resumo) return [];
    const [ano, numero] = mes.split('-').map(Number);
    const salvos = new Map(resumo.dias.map(d => [d.data, d]));
    return Array.from({ length: new Date(ano, numero, 0).getDate() }, (_, i) => {
      const data = `${mes}-${String(i + 1).padStart(2, '0')}`;
      const salvo = salvos.get(data);
      return { data, salvo, status: data > hoje ? 'Futuro' : !salvo ? 'Não importado' : salvo.completo ? 'Importado' : 'Em andamento' };
    });
  }, [mes, resumo, hoje]);

  async function selecionar(file: File | undefined) {
    if (!file) return;
    setOcupado(true); setArquivo(null); setAviso(''); setConfirmado(false); setPrevia(null);
    try {
      const { lerEmWorker } = await import('@/services/relatorioPaguePlay/lerEmWorker');
      const dados = await lerEmWorker(file);
      setArquivo({ nome: file.name, dados }); setInicio(dados.inicio); setFim(dados.fim);
    } catch (e) { setAviso(mensagemErro(e)); }
    finally { setOcupado(false); if (input.current) input.current.value = ''; }
  }

  async function salvar() {
    if (!arquivo || !resumo || !confirmado) return;
    setOcupado(true); setAviso(''); setProgresso(0);
    try {
      validarPeriodo(inicio, fim, resumo.hoje, resumo.primeiraImportacaoPendente);
      if (arquivo.dados.inicio < inicio || arquivo.dados.fim > fim) throw new Error('Há pagamentos fora do período informado. Confira as datas.');
      const r = await importarRelatorio(empresaId, modo, arquivo.nome, arquivo.dados, inicio, fim, setProgresso);
      setArquivo(null); setPrevia(null);
      setAviso(`${r.inseridos} pagamentos novos salvos; ${r.ignorados + arquivo.dados.duplicadas} repetidos ignorados.`);
      await atualizar();
    } catch (e) { setAviso(mensagemErro(e)); }
    finally { setOcupado(false); }
  }

  async function excluir() {
    if (!exclusao || (exclusao === 'mes' && !mes)) return;
    setOcupado(true); setAviso('');
    try {
      const n = await excluirRelatorio(empresaId, modo, exclusao === 'mes' ? mes : null);
      setExclusao(null); setPrevia(null); setArquivo(null); setAviso(`${n} pagamentos removidos de ${nome(modo)}.`);
      await atualizar();
    } catch (e) { setAviso(mensagemErro(e)); }
    finally { setOcupado(false); }
  }

  return <div className="space-y-4">
    <div className="rounded-xl border border-border bg-card p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {(['pagamento', 'conciliacao'] as const).map(m => <Button key={m} variant={m === modo ? 'default' : 'outline'} disabled={ocupado} onClick={() => setModo(m)}>{m === 'pagamento' ? 'Pagamento' : 'Conciliação'}</Button>)}
        <Button variant="outline" disabled={ocupado} onClick={() => input.current?.click()}>Importar relatório de {nome(modo)}</Button>
        <input ref={input} type="file" accept=".xlsx,.xls" className="hidden" aria-label={`Arquivo de ${nome(modo)}`} onChange={e => void selecionar(e.target.files?.[0])} />
      </div>
      <p className="text-sm text-muted-foreground">Históricos independentes. Os valores de Pague Play, Coren e Cofen vêm das colunas do relatório; os percentuais exibem a participação desses valores no total.</p>
      <p className="text-sm">{resumo?.primeiraImportacaoPendente ? `Primeira atualização de hoje: importe ${dataBR(diaAnterior(hoje))} e ${dataBR(hoje)} juntos. Cargas históricas até ontem também são permitidas e não liberam essa atualização.` : resumo ? 'Ontem já foi atualizado hoje. As próximas importações podem conter somente hoje.' : 'Carregue um arquivo para conferir a prévia.'}</p>
      {carregando && <p role="status">Carregando histórico…</p>}
      {erro && <div role="alert" className="rounded-lg border border-destructive/30 p-3 text-sm"><strong>Histórico indisponível.</strong> {erro.includes('fn_pp_relatorio') ? 'A integração do banco ainda não está disponível. É possível conferir uma prévia local; salvar exige aplicar a migração após aprovação.' : erro}<Button className="ml-2" variant="outline" size="sm" disabled={ocupado} onClick={() => void atualizar()}>Tentar novamente</Button></div>}
      {aviso && <p role="status" className="rounded-lg bg-muted p-3 text-sm">{aviso}</p>}
      {arquivo && <div className="space-y-3 rounded-lg border border-border p-4">
        <p className="font-medium">{arquivo.nome} · {arquivo.dados.linhas.length} pagamentos únicos · {formatarCentavos(arquivo.dados.totais.total)}</p>
        <p className="text-sm">Pague Play: {formatarCentavos(arquivo.dados.totais.pp)} · Coren: {formatarCentavos(arquivo.dados.totais.coren)} · Cofen: {formatarCentavos(arquivo.dados.totais.cofen)}</p>
        <p className="text-sm text-muted-foreground">{arquivo.dados.rodapeConferido ? 'Os quatro totais conferem com o rodapé do arquivo.' : arquivo.dados.camposConferidos.length ? `${arquivo.dados.camposConferidos.length} totais conferidos no rodapé; os demais não constam nele e foram somados pelas linhas.` : 'Arquivo sem rodapé: totais calculados a partir das linhas, sem conferência externa.'} {arquivo.dados.duplicadas > 0 && `${arquivo.dados.duplicadas} linhas idênticas repetidas serão ignoradas.`}</p>
        <div className="flex flex-wrap gap-4">
          <label className="text-sm">Início do período exportado<input aria-label="Início do período exportado" type="date" value={inicio} max={hoje} disabled={ocupado} onChange={e => { setInicio(e.target.value); setConfirmado(false); }} className="block rounded border border-border bg-background p-2" /></label>
          <label className="text-sm">Fim do período exportado<input aria-label="Fim do período exportado" type="date" value={fim} max={hoje} disabled={ocupado} onChange={e => { setFim(e.target.value); setConfirmado(false); }} className="block rounded border border-border bg-background p-2" /></label>
        </div>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmado} disabled={ocupado} onChange={e => setConfirmado(e.target.checked)} />Confirmo que exportei o relatório completo de {nome(modo)} para esse período, incluindo os dias sem recebimentos. As datas sugeridas vêm das linhas e podem não incluir dias sem movimento.</label>
        <div className="flex flex-wrap gap-2">
          <Button disabled={ocupado || !confirmado || !resumo || carregando} onClick={() => void salvar()}>{ocupado ? `Importando… ${progresso}%` : 'Validar e salvar no histórico'}</Button>
          <Button variant="outline" disabled={ocupado} onClick={() => setPrevia(criarPrevia(arquivo.dados, hoje))}>Visualizar arquivo sem salvar</Button>
          <Button variant="ghost" disabled={ocupado} onClick={() => { setArquivo(null); setPrevia(null); }}>Cancelar</Button>
        </div>
      </div>}
      {resumo && <details className="rounded-lg border border-border p-3">
        <summary className="cursor-pointer text-sm font-medium">Histórico e exclusões · {resumo.quantidade} pagamentos salvos</summary>
        <div className="mt-3 space-y-3">
          {resumo.ultimaImportacao && <p className="text-sm">Última importação: {new Date(resumo.ultimaImportacao).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</p>}
          <div className="flex flex-wrap gap-2 items-end">
            <label className="text-sm">Mês<input type="month" value={mes} max={hoje.slice(0, 7)} onChange={e => setMes(e.target.value)} className="block rounded border border-border bg-background p-2" /></label>
            <Button variant="outline" disabled={ocupado || !mes} onClick={() => setExclusao('mes')}>Excluir mês</Button>
            <Button variant="destructive" disabled={ocupado || !resumo.dias.length} onClick={() => setExclusao('geral')}>Excluir todo o histórico de {nome(modo)}</Button>
          </div>
          <p className="text-xs text-muted-foreground">Meses com importação: {meses.join(', ') || 'nenhum'}. A cobertura usa a coluna Data. Um dia em andamento só fica completo ao ser reimportado em um dia posterior.</p>
          {diasDoMes.length > 0 && <div className="grid grid-cols-2 md:grid-cols-4 gap-2">{diasDoMes.map(d => <div key={d.data} className="rounded border border-border p-2 text-xs"><strong>{dataBR(d.data)}</strong><br />{d.status}{d.salvo && ` · ${d.salvo.quantidade} pagamentos`}</div>)}</div>}
          {exclusao && <div role="alertdialog" aria-label="Confirmar exclusão" className="rounded-lg border border-destructive/40 p-4 space-y-3">
            <p>Excluir {exclusao === 'mes' ? `o mês ${mes}` : 'todo o histórico'} de {nome(modo)}? Os dados serão apagados e só voltarão após importar um novo relatório{exclusao === 'mes' ? ' desse mês' : ''}. A outra modalidade permanece salva.</p>
            <Button variant="destructive" disabled={ocupado} onClick={() => void excluir()}>Confirmar exclusão</Button><Button className="ml-2" variant="outline" disabled={ocupado} onClick={() => setExclusao(null)}>Cancelar</Button>
          </div>}
        </div>
      </details>}
    </div>
    {previa && <div role="status" className="rounded-lg border border-amber-500 bg-amber-500/10 p-3 text-sm">Prévia local do arquivo selecionado — estes dados não foram salvos e não incluem o histórico do banco. <Button variant="outline" size="sm" onClick={() => setPrevia(null)}>Fechar prévia</Button></div>}
    {exibido && <div className="overflow-x-auto rounded-xl border border-border"><iframe key={`${empresaId}:${modo}`} ref={frame} title={`Relatório de ${nome(modo)} PaguePlay`} srcDoc={documento} onLoad={() => setPronto(true)} allow="clipboard-write" sandbox="allow-scripts allow-same-origin allow-downloads" style={{ width: '100%', minWidth: 1080, height: altura, border: 0 }} /></div>}
  </div>;
}
