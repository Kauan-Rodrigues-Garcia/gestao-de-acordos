/**
 * CorridaConfig — o card da Corrida da Sorte em Configurações → Geral (só o
 * super_admin; as funções `fn_corrida_*` conferem de novo no banco).
 *
 * O caminho de uma corrida, de cima para baixo:
 *   1. Montar: o prêmio, quem corre e quem assiste → «Chamar quem corre»
 *      (cada um recebe o convite para escolher o bichinho).
 *   2. Abrir: o card «Assistir» chega para quem foi chamado; o lobby abre.
 *   3. Gravar: este navegador simula a corrida e grava a festa em vídeo.
 *   4. Largar: todo mundo vê a largada do lobby, o sorteio do mapa e a corrida juntos.
 *
 * Mais: o card de divulgação (avisar quem você quiser que vem aí uma corrida)
 * e o «Testar», que roda uma corrida inteira só na sua tela, sem banco.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Ban, Eye, Flag, FlaskConical, Megaphone, PartyPopper, Play, RefreshCw, Send, Shuffle, Trophy, Video } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { SeletorPessoas } from '@/components/Corrida/admin/SeletorPessoas';
import { lerPessoasDoCadastro, type PessoaDoCadastro } from '@/components/Corrida/admin/pessoas';
import { abrirCorrida, ajustarCorrida, criarCorrida, definirTema, descartarGravacao, divulgar, encerrarCorrida, gravarCorrida, iniciarCorrida, lerPainel, preencherEscolhas, tirarDivulgacao, type Painel } from '@/components/Corrida/admin/acoes';
import { agoraBanco, mensagemDoErro, segundos } from '@/components/Corrida/banco';
import { destravarAudio, NOME_CORRIDA } from '@/components/Corrida/nome';
import { TEMAS, type TemaLobby } from '@/components/Corrida/lobbies/cena';

const PalcoAoVivo = lazy(() => import('@/components/Corrida/PalcoAoVivo'));
const TesteCorrida = lazy(() => import('@/components/Corrida/TesteCorrida'));
const CardDivulgacao = lazy(() => import('@/components/Corrida/CardDivulgacao'));

const PREMIOS = ['R$ 20', 'R$ 30', 'R$ 50', 'Vale-lanche', 'Um dia de folga'];
const DIVULGACAO_PADRAO = {
  titulo: 'Vem aí a Corrida da Sorte!',
  mensagem: 'Fica de olho: logo mais tem corrida de bichinhos valendo prêmio, e o seu nome pode estar no grid de largada. Quem for escolhido recebe o convite para escolher o bichinho na própria tela. Boa sorte!',
};
const ETAPAS = [['preparando', 'Escolhendo bichinhos'], ['aberta', 'Lobby aberto'], ['gravada', 'Gravada'], ['correndo', 'Correndo'], ['encerrada', 'Encerrada']] as const;
const faltaMigration = (e: unknown) => /fn_corrida_|PGRST202|schema cache/.test(String(e));

type Confirmacao = { titulo: string; texto: string; acao: () => Promise<void>; perigo?: boolean } | null;

export default function CorridaConfig() {
  const [painel, setPainel] = useState<Painel | null>(null);
  const [semMigration, setSemMigration] = useState(false);
  const [pessoas, setPessoas] = useState<PessoaDoCadastro[] | null>(null);
  const [premio, setPremio] = useState('R$ 30');
  const [corredores, setCorredores] = useState<Set<string>>(new Set());
  const [plateia, setPlateia] = useState<Set<string>>(new Set());
  const [montando, setMontando] = useState(false);
  const [tema, setTema] = useState<TemaLobby>('f1');
  const [ocupado, setOcupado] = useState(false);
  const [gravando, setGravando] = useState<{ f: number; etapa: string } | null>(null);
  const cancelarGravacao = useRef(false);
  const [confirmar, setConfirmar] = useState<Confirmacao>(null);
  const [assistindo, setAssistindo] = useState(false);
  const [testando, setTestando] = useState(false);
  const [div, setDiv] = useState({ ...DIVULGACAO_PADRAO, premio: '', dias: 3, alvos: new Set<string>() });
  const [divAberta, setDivAberta] = useState(false);
  const [previa, setPrevia] = useState(false);

  const recarregar = useCallback(async () => {
    try { setPainel(await lerPainel()); setSemMigration(false); }
    catch (e) { if (faltaMigration(e)) setSemMigration(true); else toast.error('Não leu a corrida', { description: mensagemDoErro(e) }); }
  }, []);
  useEffect(() => { void recarregar(); }, [recarregar]);
  // Enquanto a aba está à vista, o painel se atualiza (quem escolheu, quem entrou no lobby).
  useEffect(() => {
    const id = window.setInterval(() => { if (document.visibilityState === 'visible' && !gravando) void recarregar(); }, 15_000);
    return () => window.clearInterval(id);
  }, [recarregar, gravando]);

  const precisaPessoas = montando || divAberta;
  useEffect(() => {
    if (!precisaPessoas || pessoas) return;
    lerPessoasDoCadastro().then(setPessoas).catch(e => toast.error('Não leu as pessoas', { description: mensagemDoErro(e) }));
  }, [precisaPessoas, pessoas]);

  const corrida = painel?.corrida ?? null;
  const emAndamento = !!corrida && ['preparando', 'aberta', 'correndo'].includes(corrida.estado);
  const gravada = !!corrida?.gravada_em;
  const etapa = !corrida ? -1 : corrida.estado === 'encerrada' || corrida.estado === 'cancelada' ? 4 : corrida.estado === 'correndo' ? 3 : gravada ? 2 : corrida.estado === 'aberta' ? 1 : 0;
  const pessoasDaCorrida = useMemo(() => painel?.pessoas ?? [], [painel]);

  const rodar = async (fn: () => Promise<Painel>, ok?: string) => {
    setOcupado(true);
    try { setPainel(await fn()); if (ok) toast.success(ok); }
    catch (e) { toast.error('Não deu', { description: mensagemDoErro(e) }); }
    finally { setOcupado(false); }
  };

  const comecarMontagem = (ajustar: boolean) => {
    if (ajustar && corrida) {
      setPremio(corrida.premio ?? '');
      setCorredores(new Set(pessoasDaCorrida.filter(p => p.corre).map(p => p.usuario)));
      setPlateia(new Set(pessoasDaCorrida.filter(p => p.assiste).map(p => p.usuario)));
      setTema(corrida.tema ?? 'f1');
    } else { setCorredores(new Set()); setPlateia(new Set()); setTema('f1'); }
    setMontando(true);
  };
  const salvarMontagem = () => rodar(async () => {
    let p = corrida && emAndamento
      ? await ajustarCorrida(corrida.id, premio, [...corredores], [...plateia])
      : await criarCorrida(premio, [...corredores], [...plateia]);
    if (p.corrida && (p.corrida.tema ?? 'f1') !== tema) p = await definirTema(p.corrida.id, tema);
    setMontando(false);
    return p;
  }, corrida && emAndamento ? 'Corrida atualizada. Quem entrou ou saiu já foi avisado.' : 'Corrida criada! Quem corre já recebeu o convite para escolher o bichinho.');

  const gravar = async () => {
    if (!corrida) return;
    cancelarGravacao.current = false;
    setGravando({ f: 0, etapa: 'Simulando a corrida' });
    try {
      const p = await gravarCorrida(corrida, pessoasDaCorrida, (f, e) => setGravando({ f, etapa: e }), () => cancelarGravacao.current);
      if (p) { setPainel(p); toast.success('Corrida gravada!', { description: p.corrida?.gravacao?.video ? 'A corrida e a festa em vídeo estão prontas. Já dá para largar.' : 'Este navegador não grava vídeo: a festa vai ser desenhada em cada tela. Já dá para largar.' }); }
    } catch (e) { toast.error('A gravação falhou', { description: mensagemDoErro(e) }); }
    finally { setGravando(null); }
  };

  const enviarDivulgacao = () => rodar(async () => {
    const p = await divulgar(div.titulo, div.mensagem, div.premio, [...div.alvos], div.dias);
    setDivAberta(false); setDiv({ ...DIVULGACAO_PADRAO, premio: '', dias: 3, alvos: new Set() });
    return p;
  }, 'Card enviado! Aparece agora na tela de quem você escolheu.');

  if (semMigration) {
    return (
      <Card><CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><Flag className="h-4 w-4" /> {NOME_CORRIDA}</CardTitle></CardHeader>
        <CardContent><div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">Falta aplicar a migration <code>20261020130000_corrida_da_sorte.sql</code> no banco. Sem ela, a corrida não aparece para ninguém.</div></CardContent>
      </Card>
    );
  }

  const statusTxt = !corrida ? 'Nenhuma corrida ainda.' : corrida.estado === 'preparando'
    ? `${corrida.escolheram} de ${corrida.corredores} escolheram o bichinho. Quem não escolher corre com um dos três.`
    : corrida.estado === 'aberta' ? (gravada ? `Gravada e pronta. ${corrida.no_lobby} de ${corrida.chamados} no lobby. O mapa está na gravação: nem você vê antes.` : `Lobby aberto: ${corrida.no_lobby} de ${corrida.chamados} entraram. Grave para liberar a largada.`)
      : corrida.estado === 'correndo' ? `Correndo agora para ${corrida.no_lobby} pessoas.` : corrida.estado === 'encerrada' ? `Encerrada${corrida.vencedor_nome ? `: ${corrida.vencedor_nome} venceu` : ''}.` : 'Cancelada.';

  return (
    <Card className={cn(emAndamento && 'border-amber-500/60')}>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base"><Flag className="h-4 w-4 text-amber-500" /> {NOME_CORRIDA}</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">O sorteio em forma de corrida: cada pessoa escolhida corre com um bichinho, quem cruzar primeiro leva o prêmio. Todo mundo assiste junto, no mesmo segundo.</p>
          </div>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { destravarAudio(); setTestando(true); }}>
            <FlaskConical className="h-3.5 w-3.5" /> Testar só na minha tela
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {corrida && (
          <ol className="flex flex-wrap gap-1.5 text-[11px]">
            {ETAPAS.map(([k, t], i) => (
              <li key={k} className={cn('rounded-full border px-2 py-0.5', i < etapa ? 'border-emerald-500/50 text-emerald-600 dark:text-emerald-400' : i === etapa ? 'border-amber-500 bg-amber-500/15 font-semibold' : 'text-muted-foreground')}>
                {i + 1}. {k === 'encerrada' && corrida.estado === 'cancelada' ? 'Cancelada' : t}
              </li>
            ))}
          </ol>
        )}
        <div className="rounded-lg bg-amber-500/10 px-3 py-2.5 text-xs">
          {corrida && <strong className="mr-1">{corrida.premio ? `Prêmio: ${corrida.premio}.` : 'Sem prêmio.'}</strong>}{statusTxt}
        </div>

        {corrida && emAndamento && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[['correndo', corrida.corredores], ['escolheram', corrida.escolheram], ['chamados', corrida.chamados], ['no lobby', corrida.no_lobby]].map(([t, n]) => (
              <div key={t} className="rounded-lg border px-3 py-2"><div className="text-lg font-bold tabular-nums">{n}</div><div className="text-[11px] text-muted-foreground">{t}</div></div>
            ))}
          </div>
        )}

        {corrida && emAndamento && !corrida.inicia_em && !montando && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-semibold">Cenário do lobby:</span>
            <EscolhaCenario valor={corrida.tema ?? 'f1'} desligado={ocupado} onChange={t => void rodar(() => definirTema(corrida.id, t), 'Cenário trocado. Quem está no lobby já vê o novo.')} />
          </div>
        )}

        {gravando && (
          <div className="space-y-1.5 rounded-lg border p-3">
            <div className="flex items-center justify-between text-xs"><span>{gravando.etapa}… {Math.round(gravando.f * 100)}%</span>
              <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => { cancelarGravacao.current = true; }}>Cancelar</Button></div>
            <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-amber-500 transition-[width]" style={{ width: `${Math.round(gravando.f * 100)}%` }} /></div>
            <p className="text-[11px] text-muted-foreground">Não feche esta aba: a corrida e a festa em vídeo estão sendo gravadas neste navegador.</p>
          </div>
        )}

        {/* as ações da etapa */}
        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
          {!emAndamento && !montando && <Button size="sm" className="gap-1.5" onClick={() => comecarMontagem(false)}><Trophy className="h-3.5 w-3.5" /> Nova corrida</Button>}
          {corrida && emAndamento && (
            <>
              {corrida.estado === 'preparando' && (
                <Button size="sm" className="gap-1.5" disabled={ocupado || !!gravando} onClick={() => setConfirmar({ titulo: 'Abrir a corrida?', texto: `O card «Assistir» aparece agora na tela das ${corrida.chamados} pessoas chamadas, e o lobby abre. A música começa 15 s depois. Quem ainda não escolheu o bichinho segue escolhendo e entra no grid quando escolher.`, acao: () => rodar(() => abrirCorrida(corrida.id), 'Corrida aberta! O convite chegou para quem foi chamado.') })}>
                  <Megaphone className="h-3.5 w-3.5" /> Abrir a corrida
                </Button>
              )}
              {!gravada && corrida.escolheram < corrida.corredores && (
                <Button size="sm" variant="outline" className="gap-1.5" disabled={ocupado || !!gravando} onClick={() => setConfirmar({ titulo: 'Preencher quem não escolheu?', texto: `${corrida.corredores - corrida.escolheram} de ${corrida.corredores} corredores ainda não escolheram. Cada um ganha um bichinho aleatório agora e entra no grid. Se não preencher, o sorteio acontece na gravação.`, acao: () => rodar(() => preencherEscolhas(corrida.id), 'Bichinhos sorteados para quem não escolheu.') })}>
                  <Shuffle className="h-3.5 w-3.5" /> Preencher quem não escolheu
                </Button>
              )}
              {!gravada && corrida.estado !== 'correndo' && (
                <Button size="sm" variant={corrida.estado === 'aberta' ? 'default' : 'outline'} className="gap-1.5" disabled={ocupado || !!gravando} onClick={() => void gravar()}>
                  <Video className="h-3.5 w-3.5" /> Gravar a corrida
                </Button>
              )}
              {gravada && corrida.estado === 'aberta' && (
                <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700" disabled={ocupado} onClick={() => setConfirmar({ titulo: 'Largar agora?', texto: `A largada do lobby começa agora na tela de todo mundo e, 4 segundos depois, a roleta do mapa (${corrida.no_lobby} no lobby agora). Depois não dá para voltar.`, acao: () => rodar(() => iniciarCorrida(corrida.id), 'Largou!') })}>
                  <Play className="h-3.5 w-3.5" /> Largar
                </Button>
              )}
              {corrida.estado !== 'preparando' && (
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { destravarAudio(); setAssistindo(true); }}><Eye className="h-3.5 w-3.5" /> Assistir</Button>
              )}
              {!gravada && corrida.estado !== 'correndo' && !montando && (
                <Button size="sm" variant="outline" className="gap-1.5" disabled={ocupado || !!gravando} onClick={() => comecarMontagem(true)}>Mudar pessoas ou prêmio</Button>
              )}
              {gravada && corrida.estado !== 'correndo' && (
                <Button size="sm" variant="ghost" className="gap-1.5" disabled={ocupado} onClick={() => setConfirmar({ titulo: 'Descartar a gravação?', texto: 'O mapa e o resultado gravados vão embora. Dá para mudar pessoas e prêmio e gravar de novo.', acao: () => rodar(() => descartarGravacao(corrida.id), 'Gravação descartada.') })}>
                  <RefreshCw className="h-3.5 w-3.5" /> Descartar a gravação
                </Button>
              )}
              {corrida.estado === 'correndo' ? (
                <Button size="sm" variant="ghost" className="gap-1.5" disabled={ocupado} onClick={() => setConfirmar({ titulo: 'Encerrar a corrida?', texto: 'A corrida sai da tela de todo mundo. Faça isso depois da festa.', acao: () => rodar(() => encerrarCorrida(corrida.id, false), 'Corrida encerrada.') })}>
                  <PartyPopper className="h-3.5 w-3.5" /> Encerrar
                </Button>
              ) : (
                <Button size="sm" variant="ghost" className="gap-1.5 text-destructive" disabled={ocupado || !!gravando} onClick={() => setConfirmar({ perigo: true, titulo: 'Cancelar a corrida?', texto: 'Ela some da tela de todo mundo e não dá para desfazer.', acao: () => rodar(() => encerrarCorrida(corrida.id, true), 'Corrida cancelada.') })}>
                  <Ban className="h-3.5 w-3.5" /> Cancelar
                </Button>
              )}
            </>
          )}
        </div>

        {montando && (
          <div className="space-y-3 rounded-lg border p-3">
            <div className="space-y-1.5">
              <label htmlFor="cds-premio" className="text-xs font-semibold">Prêmio de quem vencer</label>
              <div className="flex flex-wrap items-center gap-1.5">
                <Input id="cds-premio" value={premio} maxLength={60} onChange={e => setPremio(e.target.value)} placeholder="Ex.: R$ 30, uma folga, um vale-lanche" className="h-8 max-w-xs text-sm" />
                {PREMIOS.map(p => <button key={p} type="button" onClick={() => setPremio(p)} className={cn('rounded-full border px-2.5 py-0.5 text-xs', premio === p ? 'border-amber-500 bg-amber-500/15' : 'hover:border-amber-500/60')}>{p}</button>)}
              </div>
            </div>
            <div className="space-y-1.5">
              <h4 className="text-xs font-semibold">Cenário do lobby</h4>
              <EscolhaCenario valor={tema} onChange={setTema} />
            </div>
            <div className="space-y-1.5">
              <h4 className="text-xs font-semibold">Quem corre <span className="font-normal text-muted-foreground">(cada um escolhe um bichinho; ninguém mais fica sabendo nessa fase)</span></h4>
              {pessoas ? <SeletorPessoas pessoas={pessoas} marcados={corredores} onChange={setCorredores} rotulo={n => (n === 1 ? 'pessoa correndo' : 'pessoas correndo')} /> : <p className="text-xs text-muted-foreground">Carregando as pessoas…</p>}
            </div>
            <div className="space-y-1.5">
              <h4 className="text-xs font-semibold">Quem assiste <span className="font-normal text-muted-foreground">(recebe o card «Assistir» quando você abrir; quem corre já assiste)</span></h4>
              {pessoas ? <SeletorPessoas pessoas={pessoas} marcados={plateia} onChange={setPlateia} rotulo={n => (n === 1 ? 'pessoa assistindo' : 'pessoas assistindo')} /> : null}
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setMontando(false)}>Voltar</Button>
              <Button size="sm" className="gap-1.5" disabled={ocupado || corredores.size < 2} onClick={() => void salvarMontagem()}>
                <Send className="h-3.5 w-3.5" /> {corrida && emAndamento ? 'Salvar e avisar quem mudou' : `Chamar ${corredores.size} para escolher o bichinho`}
              </Button>
            </div>
          </div>
        )}

        {corrida && emAndamento && !montando && pessoasDaCorrida.length > 0 && (
          <details className="rounded-lg border">
            <summary className="cursor-pointer px-3 py-2 text-xs font-semibold">Quem está na corrida ({pessoasDaCorrida.length})</summary>
            <ul className="max-h-64 divide-y overflow-y-auto text-xs">
              {pessoasDaCorrida.map(p => (
                <li key={p.usuario} className="flex items-center gap-2 px-3 py-1.5">
                  {p.foto ? <img src={p.foto} alt="" className="h-5 w-5 rounded-full object-cover" /> : <span className="h-5 w-5 rounded-full bg-muted" />}
                  <span className="min-w-0 flex-1 truncate">{p.nome} <span className="text-muted-foreground">· {p.setor ?? 'Sem setor'}</span></span>
                  <span className="text-muted-foreground">{p.corre ? (p.escolha != null ? 'corre · escolheu' : 'corre · escolhendo') : 'assiste'}</span>
                  <span className={cn('w-14 text-right', p.entrou_em ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground')}>{p.entrou_em ? 'no lobby' : '—'}</span>
                </li>
              ))}
            </ul>
          </details>
        )}

        {/* o card de divulgação */}
        <div className="space-y-2 border-t pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="flex items-center gap-1.5 text-xs font-semibold"><Megaphone className="h-3.5 w-3.5" /> Card de divulgação</h4>
            {!divAberta && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setDivAberta(true)}>Mandar um card</Button>}
          </div>
          {divAberta && (
            <div className="space-y-2 rounded-lg border p-3">
              <Input value={div.titulo} maxLength={80} onChange={e => setDiv({ ...div, titulo: e.target.value })} className="h-8 text-sm" aria-label="Título do card" />
              <Textarea value={div.mensagem} maxLength={400} onChange={e => setDiv({ ...div, mensagem: e.target.value })} rows={3} className="text-sm" aria-label="Mensagem do card" />
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Input value={div.premio} maxLength={60} onChange={e => setDiv({ ...div, premio: e.target.value })} placeholder="Prêmio (opcional)" className="h-8 max-w-[180px] text-sm" aria-label="Prêmio do card" />
                <label className="flex items-center gap-1.5">Fica no ar por
                  <select value={div.dias} onChange={e => setDiv({ ...div, dias: Number(e.target.value) })} className="h-8 rounded-md border bg-background px-2">
                    {[1, 2, 3, 5, 7].map(d => <option key={d} value={d}>{d} {d === 1 ? 'dia' : 'dias'}</option>)}
                  </select></label>
                <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => setPrevia(true)}><Eye className="h-3 w-3" /> Ver como fica</Button>
              </div>
              {pessoas ? <SeletorPessoas pessoas={pessoas} marcados={div.alvos} onChange={alvos => setDiv({ ...div, alvos })} rotulo={n => (n === 1 ? 'pessoa recebe o card' : 'pessoas recebem o card')} /> : <p className="text-xs text-muted-foreground">Carregando as pessoas…</p>}
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setDivAberta(false)}>Voltar</Button>
                <Button size="sm" className="gap-1.5" disabled={ocupado || !div.alvos.size || !div.titulo.trim() || !div.mensagem.trim()} onClick={() => void enviarDivulgacao()}><Send className="h-3.5 w-3.5" /> Mandar para {div.alvos.size}</Button>
              </div>
            </div>
          )}
          {(painel?.divulgacoes ?? []).length > 0 && (
            <ul className="divide-y rounded-lg border text-xs">
              {painel!.divulgacoes.map(d => {
                const noAr = (segundos(d.expira_em) ?? 0) > agoraBanco();
                return (
                  <li key={d.id} className="flex items-center gap-2 px-3 py-1.5">
                    <span className="min-w-0 flex-1 truncate">{d.titulo}</span>
                    <span className="tabular-nums text-muted-foreground">{d.fecharam}/{d.alvos} viram</span>
                    {noAr ? <Button size="sm" variant="ghost" className="h-6 text-[11px]" disabled={ocupado} onClick={() => void rodar(() => tirarDivulgacao(d.id), 'Card tirado do ar.')}>Tirar do ar</Button> : <span className="text-muted-foreground">fora do ar</span>}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {(painel?.historico ?? []).filter(h => h.id !== corrida?.id || !emAndamento).length > 0 && (
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground">Corridas anteriores</summary>
            <ul className="mt-1 space-y-0.5">
              {painel!.historico.map(h => (
                <li key={h.id} className="flex gap-2"><span className="tabular-nums text-muted-foreground">{new Date(h.criada_em).toLocaleDateString('pt-BR')}</span><span>{h.premio ?? 'sem prêmio'}</span><span className="text-muted-foreground">· {h.estado}{h.vencedor_nome ? ` · ${h.vencedor_nome} venceu` : ''}</span></li>
              ))}
            </ul>
          </details>
        )}
      </CardContent>

      <AlertDialog open={!!confirmar} onOpenChange={o => { if (!o) setConfirmar(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>{confirmar?.titulo}</AlertDialogTitle><AlertDialogDescription>{confirmar?.texto}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction className={cn(confirmar?.perigo && 'bg-destructive hover:bg-destructive/90')} onClick={e => { e.preventDefault(); const c = confirmar; setConfirmar(null); if (c) void c.acao(); }}>Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Suspense fallback={null}>
        {assistindo && corrida && <PalcoAoVivo corridaId={corrida.id} onFechar={() => setAssistindo(false)} />}
        {testando && <TesteCorrida premio={premio || corrida?.premio || 'R$ 30'} onFechar={() => setTestando(false)} tema={montando ? tema : corrida?.tema ?? tema} palpiteDemo />}
        {previa && <CardDivulgacao teste divulgacao={{ id: 0, titulo: div.titulo, mensagem: div.mensagem, premio: div.premio || null, criada_em: new Date().toISOString() }} onFechou={() => setPrevia(false)} />}
      </Suspense>
    </Card>
  );
}

/** Os três cenários de lobby (A, B e C), para escolher ao montar a corrida e trocar até a largada. */
function EscolhaCenario({ valor, onChange, desligado }: { valor: TemaLobby; onChange: (t: TemaLobby) => void; desligado?: boolean }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {TEMAS.filter(t => t.id !== 'atual').map(t => (
        <button key={t.id} type="button" disabled={desligado} onClick={() => { if (t.id !== valor) onChange(t.id); }} aria-pressed={t.id === valor}
          className={cn('rounded-full border px-2.5 py-0.5 text-xs disabled:opacity-50', t.id === valor ? 'border-amber-500 bg-amber-500/15 font-semibold' : 'hover:border-amber-500/60')}>
          {t.nome}
        </button>
      ))}
    </div>
  );
}
