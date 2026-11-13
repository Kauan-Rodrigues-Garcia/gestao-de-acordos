/**
 * QuebraNozesConfig.tsx — os quebra-nozes do Natal em Configurações › Geral
 * (Cleber, 12/11/2026). Só o super_admin (as funções do banco conferem de novo).
 *
 *   - Os interruptores: as aparições sorteadas do dia (umas três, de segunda a
 *     sexta), o boletim de quem mais recebeu, a chamada dos destaques às 10h,
 *     e os sons para todos.
 *   - A agenda nas duas cidades, de hoje e do próximo dia útil: os minutos
 *     sorteados, e o lápis para trocar a hora de cada sessão, uma por uma (a
 *     seta devolve ao sorteio).
 *   - Chamar agora: uma aparição, o boletim ou a chamada dos destaques, para
 *     uma cidade ou as duas. «Para todos» começa em 15 s na tela de quem está
 *     logado; «Ver só aqui» toca só nesta tela, sem avisar ninguém.
 *
 * Regras e banco: `Natal/quebraNozes/` e as migrations 20261112180100 e
 * 20261112210100 (o boletim e os horários).
 */
import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, Drum, Loader2, Pencil, RotateCcw, X } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useEmpresa } from '@/hooks/useEmpresa';
import { cn } from '@/lib/utils';
import { relogioNatal } from '@/components/Natal/musica';
import { diaDoNatal, ehDiaUtil, inicioDoDia, sessoesDoDia, type Sessao, type TipoDeSessao } from '@/components/Natal/quebraNozes/agenda';
import { EVENTO_QUEBRA_NOZES_RESPOSTA, SEM_PALCO, chamarQuebraNozes } from '@/components/Natal/quebraNozes/chamada';
import {
  ajustarHorarioDosQuebraNozes, chamarQuebraNozesParaTodos, configurarQuebraNozes, useConfiguracaoDosQuebraNozes,
} from '@/components/Natal/quebraNozes/configuracao';
import { lerDestaques, lerLider } from '@/components/Natal/quebraNozes/dados';
import { NOME_DA_CIDADE, type Cidade } from '@/components/Natal/quebraNozes/elenco';

const CIDADES: readonly Cidade[] = ['birigui', 'marilia'];
const hora = (ms: number) => new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
const dataDeBrasilia = (ms: number) => new Date(ms - 3 * 3_600_000).toISOString().slice(0, 10);

type Chave = 'automaticas' | 'boletim' | 'chamada10h' | 'sons';
const INTERRUPTORES: readonly { chave: Chave; titulo: string; detalhe: string }[] = [
  { chave: 'automaticas', titulo: 'Aparições automáticas', detalhe: 'Três por dia, de segunda a sexta, em minutos sorteados. Cada cidade vê os dela ao mesmo tempo.' },
  { chave: 'boletim', titulo: 'Boletim de quem mais recebeu', detalhe: 'Uma das aparições da tarde diz quem mais recebeu na cidade até aquela hora, com o cartão da pessoa. Só o nome e a foto: o valor não aparece.' },
  { chave: 'chamada10h', titulo: 'Chamada dos destaques às 10h', detalhe: 'De segunda a sexta: quem mais recebeu ontem em cada setor da cidade, como no Destaque do Modo TV.' },
  { chave: 'sons', titulo: 'Sons', detalhe: 'Sino, tambor, corneta e palmas junto com o gesto, baixinho. Eles entram e saem em silêncio. Cada pessoa ainda pode calar os dela na bolinha vermelha ao lado do palco.' },
];

const SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const ROTULO_DA_SESSAO: Record<TipoDeSessao, string> = {
  parabens: 'chamada dos destaques',
  aparicao: 'aparição',
  boletim: 'aparição · quem mais recebeu',
};
const BOTAO_DA_LINHA = 'grid h-6 w-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50';

/**
 * Uma sessão da agenda: a hora, o que é, e o lápis para trocar a hora (só
 * dela). Sessão que já começou não se mexe mais.
 */
function SessaoDaAgenda({ sessao, cidade, ligada, podeMudar }: { sessao: Sessao; cidade: Cidade; ligada: boolean; podeMudar: boolean }) {
  /** `null`: não está trocando. */
  const [valor, setValor] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const rotulo = ROTULO_DA_SESSAO[sessao.tipo];
  const mudada = sessao.sorteada !== undefined;

  async function salvar(minuto: number | null) {
    if (minuto !== null && inicioDoDia(sessao.dia) + minuto * 60_000 <= relogioNatal()) {
      toast.error('Esse horário já passou', { description: 'Escolha um horário daqui para a frente.' });
      return;
    }
    setSalvando(true);
    const { erro } = await ajustarHorarioDosQuebraNozes(sessao.dia, cidade, sessao.indice, minuto);
    setSalvando(false);
    if (erro) { toast.error('Não foi possível mudar o horário', { description: erro }); return; }
    setValor(null);
  }
  function confirmar() {
    const [h, m] = (valor ?? '').split(':').map(Number);
    if (!Number.isInteger(h) || !Number.isInteger(m)) { toast.error('Horário inválido'); return; }
    void salvar(h * 60 + m);
  }

  return (
    <li className={cn('flex min-h-7 items-center gap-2 tabular-nums', !ligada && 'text-muted-foreground')}>
      {valor === null ? (
        <span className={cn('font-mono', !ligada && 'line-through', mudada && 'font-semibold text-primary')}>{hora(sessao.inicio)}</span>
      ) : (
        <input
          type="time" value={valor} autoFocus disabled={salvando}
          onChange={e => setValor(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') confirmar(); if (e.key === 'Escape') setValor(null); }}
          aria-label={`Novo horário da ${rotulo} em ${NOME_DA_CIDADE[cidade]}`}
          className="h-7 rounded-md border border-input bg-background px-1.5 font-mono text-xs"
        />
      )}
      <span className="min-w-0 flex-1 truncate">
        <span className={cn(!ligada && 'line-through')}>{rotulo}</span>
        {mudada && valor === null && <span className="ml-1.5 text-muted-foreground">(sorteio: {hora(sessao.sorteada!)})</span>}
      </span>
      {salvando && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />}
      {podeMudar && !salvando && (valor === null ? (
        <>
          {mudada && (
            <button type="button" className={BOTAO_DA_LINHA} onClick={() => { void salvar(null); }} title="Voltar ao horário sorteado" aria-label={`Voltar a ${rotulo} ao horário sorteado`}>
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          )}
          <button type="button" className={BOTAO_DA_LINHA} onClick={() => setValor(hora(sessao.inicio))} title="Mudar o horário" aria-label={`Mudar o horário da ${rotulo}`}>
            <Pencil className="h-3.5 w-3.5" />
          </button>
        </>
      ) : (
        <>
          <button type="button" className={BOTAO_DA_LINHA} onClick={confirmar} title="Salvar" aria-label="Salvar o horário">
            <Check className="h-3.5 w-3.5" />
          </button>
          <button type="button" className={BOTAO_DA_LINHA} onClick={() => setValor(null)} title="Cancelar" aria-label="Cancelar">
            <X className="h-3.5 w-3.5" />
          </button>
        </>
      ))}
    </li>
  );
}

export default function QuebraNozesConfig() {
  const { empresa } = useEmpresa();
  const config = useConfiguracaoDosQuebraNozes(empresa?.id);
  const [aberto, setAberto] = useState(false);
  const [salvando, setSalvando] = useState<Chave | null>(null);
  const [tipo, setTipo] = useState<TipoDeSessao>('aparicao');
  /** A agenda de hoje (0) ou do próximo dia útil (1). */
  const [qualDia, setQualDia] = useState<0 | 1>(0);
  const [cidade, setCidade] = useState<Cidade | 'todas'>('todas');
  const [confirmar, setConfirmar] = useState(false);
  const [chamando, setChamando] = useState(false);
  // O que o palco respondeu ao «Ver só aqui»: o que subiu, ou por que não subiu.
  const [resposta, setResposta] = useState('');
  useEffect(() => {
    const ouvir = (e: Event) => setResposta((e as CustomEvent<string>).detail);
    window.addEventListener(EVENTO_QUEBRA_NOZES_RESPOSTA, ouvir);
    return () => window.removeEventListener(EVENTO_QUEBRA_NOZES_RESPOSTA, ouvir);
  }, []);

  function verSoAqui() {
    const ouviu = chamarQuebraNozes({ tipo, cidade: cidade === 'todas' ? undefined : cidade });
    if (!ouviu) setResposta(SEM_PALCO);
  }

  // A agenda como ela seria com tudo ligado: o que está desligado aparece riscado.
  const { boletim, ajustes } = config;
  const agenda = useMemo(() => {
    const hoje = diaDoNatal(relogioNatal());
    let proximo = hoje + 1;
    while (!ehDiaUtil(proximo)) proximo++;
    const dia = qualDia === 0 ? hoje : proximo;
    return {
      dia,
      nomeDoProximo: proximo === hoje + 1 ? 'Amanhã' : SEMANA[new Date(inicioDoDia(proximo)).getUTCDay()],
      cidades: CIDADES.map(c => ({ cidade: c, sessoes: sessoesDoDia(c, dia, { automaticas: true, chamada10h: true, boletim, ajustes }) })),
    };
    // Recalcula ao abrir o card (o dia pode ter virado com a página aberta).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, qualDia, boletim, ajustes]);

  async function virar(chave: Chave, ligado: boolean) {
    setSalvando(chave);
    const { erro } = await configurarQuebraNozes({ [chave]: ligado });
    setSalvando(null);
    if (erro) toast.error('Não foi possível salvar', { description: erro });
  }

  async function chamarParaTodos() {
    setChamando(true);
    // Na chamada dos destaques, o banco calcula antes: quando as telas perguntarem, já está pronto.
    const cidades = cidade === 'todas' ? CIDADES : [cidade];
    if (tipo === 'parabens') {
      const hoje = dataDeBrasilia(relogioNatal());
      await Promise.all(cidades.map(c => lerDestaques(c, hoje, null, true).catch((): null => null)));
    }
    // No boletim também: o cálculo vale por cinco minutos, e a chamada lê o mesmo resultado.
    if (tipo === 'boletim') {
      const sessao = `pre:${Date.now()}`;
      await Promise.all(cidades.map(c => lerLider(c, sessao, null, true).catch((): null => null)));
    }
    const { erro } = await chamarQuebraNozesParaTodos(tipo, cidade);
    setChamando(false);
    setConfirmar(false);
    if (erro) {
      toast.error('Não foi possível chamar os quebra-nozes', {
        description: erro.includes('JA_TEM_CHAMADA') ? 'A chamada anterior ainda está no palco. Espere um minuto e meio.' : erro,
      });
      return;
    }
    toast.success('Quebra-nozes a caminho', { description: 'Sobem em 15 segundos na tela de quem está logado com o tema de Natal.' });
  }

  const onde = cidade === 'todas' ? 'Birigui e Marília' : NOME_DA_CIDADE[cidade];
  const resumo = !config.lida ? 'migration pendente'
    : [config.automaticas ? 'aparições ligadas' : 'aparições desligadas', config.chamada10h ? 'chamada das 10h ligada' : 'chamada das 10h desligada'].join(' · ');
  const agora = relogioNatal();
  const algoLigado = config.automaticas || config.chamada10h;

  return (
    <Card className={cn('border-border', algoLigado && 'border-success/40')}>
      <CardHeader className="pb-3">
        <button type="button" onClick={() => setAberto(a => !a)} aria-expanded={aberto} className="flex w-full min-w-0 items-center gap-2 text-left">
          <Drum className="h-4 w-4 shrink-0 text-primary" />
          <span className="min-w-0">
            <span className="block text-sm font-semibold">Quebra-nozes do Natal — aparições e chamada das 10h</span>
            <span className="block truncate text-xs text-muted-foreground">{resumo}</span>
          </span>
          <ChevronDown className={cn('ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform', aberto && 'rotate-180')} />
        </button>
      </CardHeader>

      {aberto && (
        <CardContent className="space-y-5">
          {!config.lida && (
            <p className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs text-foreground">
              Não deu para ler a configuração. Falta aplicar a migration
              {' '}<code className="font-mono">20261112180100_natal_quebra_nozes.sql</code> no banco.
              Até lá, só «Ver só aqui» funciona.
            </p>
          )}
          {config.lida && !config.completa && (
            <p className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs text-foreground">
              Para ligar o boletim de quem mais recebeu e trocar o horário das aparições, falta aplicar a migration
              {' '}<code className="font-mono">20261112210100_natal_quebra_nozes_horarios_e_lider.sql</code> no banco.
              O resto já funciona.
            </p>
          )}

          <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
            O diretor Anderson aparece com a Jessica para os setores de Birigui e com o Robson para os de Marília;
            setor sem cidade não vê ninguém. A foto é a do perfil de cada um, lida a cada aparição. Só aparece
            para quem está com o tema de Natal ligado. No modo leve o espetáculo sobe em quadrinhos: as mesmas
            falas, uma pose por fala, sem animação.
          </p>

          <div className="space-y-2">
            {INTERRUPTORES.map(i => (
              <label key={i.chave} className="flex items-start justify-between gap-4 rounded-xl border border-border p-3">
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{i.titulo}</span>
                  <span className="block text-xs text-muted-foreground">{i.detalhe}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {salvando === i.chave && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                  <Switch
                    checked={config[i.chave]}
                    disabled={!config.lida || salvando !== null || (i.chave === 'boletim' && !config.completa)}
                    onCheckedChange={v => { void virar(i.chave, v); }}
                    aria-label={i.titulo}
                  />
                </span>
              </label>
            ))}
          </div>

          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold">A agenda</p>
              <div className="flex gap-1 rounded-lg bg-muted p-0.5 text-xs" role="group" aria-label="Dia da agenda">
                {([[0, 'Hoje'], [1, agenda.nomeDoProximo]] as const).map(([v, rotulo]) => (
                  <button key={v} type="button" onClick={() => setQualDia(v)} aria-pressed={qualDia === v}
                    className={cn('rounded-md px-2.5 py-1 font-medium transition-colors', qualDia === v ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
                    {rotulo}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {agenda.cidades.map(a => (
                <div key={a.cidade} className="rounded-xl border border-border p-3 text-xs">
                  <p className="font-semibold">{NOME_DA_CIDADE[a.cidade]}</p>
                  {a.sessoes.length === 0 ? (
                    <p className="mt-1 text-muted-foreground">Hoje não tem: é sábado ou domingo.</p>
                  ) : (
                    <ul className="mt-1">
                      {a.sessoes.map(s => (
                        <SessaoDaAgenda
                          key={`${agenda.dia}:${s.indice}`}
                          sessao={s} cidade={a.cidade}
                          ligada={s.tipo === 'parabens' ? config.chamada10h : config.automaticas}
                          podeMudar={config.completa && s.inicio > agora}
                        />
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {config.completa
                ? 'O lápis troca a hora só daquela sessão, só naquela cidade; a seta devolve ao sorteio. Sessão que já começou não se mexe.'
                : 'Os minutos são sorteados: cada cidade tem os dela.'}
            </p>
          </div>

          <div className="space-y-2 rounded-xl border border-border p-3">
            <p className="text-xs font-semibold">Chamar agora</p>
            <div className="flex flex-wrap gap-2">
              <div className="flex gap-1 rounded-lg bg-muted p-0.5 text-xs" role="group" aria-label="O que chamar">
                {([['aparicao', 'Aparição'], ['boletim', 'Quem mais recebeu'], ['parabens', 'Chamada dos destaques']] as const).map(([v, rotulo]) => (
                  <button key={v} type="button" onClick={() => setTipo(v)} aria-pressed={tipo === v}
                    className={cn('rounded-md px-2.5 py-1 font-medium transition-colors', tipo === v ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
                    {rotulo}
                  </button>
                ))}
              </div>
              <div className="flex gap-1 rounded-lg bg-muted p-0.5 text-xs" role="group" aria-label="Para qual cidade">
                {([['todas', 'As duas'], ['birigui', 'Birigui'], ['marilia', 'Marília']] as const).map(([v, rotulo]) => (
                  <button key={v} type="button" onClick={() => setCidade(v)} aria-pressed={cidade === v}
                    className={cn('rounded-md px-2.5 py-1 font-medium transition-colors', cidade === v ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
                    {rotulo}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" disabled={!config.lida || chamando || (tipo === 'boletim' && !config.completa)} onClick={() => setConfirmar(true)} className="gap-1.5">
                {chamando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Chamar para todos
              </Button>
              <Button size="sm" variant="outline" onClick={verSoAqui}>
                Ver só aqui
              </Button>
              <span className="text-xs text-muted-foreground">
                «Ver só aqui» toca nesta tela, sem avisar ninguém{cidade === 'todas' ? ' (na cidade do seu setor; sem cidade, Birigui)' : ''}.
              </span>
            </div>
            {resposta && <p className="text-xs text-muted-foreground" role="status">{resposta}</p>}
          </div>
        </CardContent>
      )}

      <AlertDialog open={confirmar} onOpenChange={v => { if (!chamando) setConfirmar(v); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Chamar os quebra-nozes para {onde}?</AlertDialogTitle>
            <AlertDialogDescription>
              {tipo === 'parabens'
                ? 'A chamada dos destaques sobe em 15 segundos na tela de todo mundo que está logado nessa cidade, com o nome e a foto de quem mais recebeu ontem em cada setor.'
                : tipo === 'boletim'
                  ? 'Os dois sobem em 15 segundos na tela de todo mundo que está logado nessa cidade e dizem, com nome e foto, quem mais recebeu hoje até agora. Se ninguém recebeu ainda, vira uma aparição comum.'
                  : 'Uma aparição sobe em 15 segundos na tela de todo mundo que está logado nessa cidade.'}
              {' '}Dura cerca de um minuto e não dá para cancelar depois de chamada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={chamando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={chamando} onClick={e => { e.preventDefault(); void chamarParaTodos(); }}>
              {chamando ? 'Chamando…' : 'Chamar para todos'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
