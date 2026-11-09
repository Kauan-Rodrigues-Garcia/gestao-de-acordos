/**
 * CardAlertas — o topo da aba: o que é MEU e pede ação agora.
 *
 *   Retornos agendados   uma hora antes o item pisca em vermelho e a aba avisa
 *                        (toast + som); passou da hora, fica «atrasado».
 *   Encaminhadas p/ mim  esperando a minha ciência (pisca em âmbar).
 *   Aguardando resposta  já dei ciência, falta responder quem me encaminhou.
 *   Respostas recebidas  encaminhei e o responsável respondeu: falta eu ver.
 *
 * Some quando não há nada. Os dados são os da lista (a aba relê a cada dois
 * minutos); o relógio da tela é o `useAgora`.
 */
import { useEffect, useRef, useState } from 'react';
import {
  AlarmClock, BellRing, CheckCheck, CheckCircle2, ChevronDown, Eye, Loader2, MessageSquareReply, UserRoundCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useAgora } from '@/hooks/useAgora';
import { tocarSomNotificacao } from '@/lib/som-notificacao';
import { cn } from '@/lib/utils';
import { encaminhamento, retornoDado } from '@/services/ouvidoriaCofen.service';
import { useOuvidoria } from './contexto';
import {
  ANTECEDENCIA_MINUTOS, alertasDe, faltaBr, quandoBr, urgenciaRetorno, type Manifestacao,
} from './ouvidoria';

/** Até quantos retornos «de outro dia» aparecem antes do «ver mais». */
const DEPOIS_VISIVEIS = 3;

export function CardAlertas() {
  const { todas, meuId, abrirManifestacao, recarregar, v2 } = useOuvidoria();
  const agora = useAgora();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [verTodos, setVerTodos] = useState(false);
  const avisados = useRef(new Set<string>());

  const a = alertasDe(todas, meuId);

  // Avisa uma vez quando um retorno entra na última hora (ou já passou ao abrir a aba).
  const urgentes = a.retornos.filter(m => {
    const u = urgenciaRetorno(m.retorno_agendado_em, agora);
    return u === 'agora' || u === 'atrasado';
  });
  const chaveUrgentes = urgentes.map(m => `${m.id}@${m.retorno_agendado_em}`).join('|');
  useEffect(() => {
    for (const m of urgentes) {
      const chave = `${m.id}@${m.retorno_agendado_em}`;
      if (avisados.current.has(chave)) continue;
      avisados.current.add(chave);
      const atrasado = urgenciaRetorno(m.retorno_agendado_em, Date.now()) === 'atrasado';
      toast.warning(atrasado ? `Retorno atrasado: ${m.nome_profissional}` : `Retorno ${faltaBr(m.retorno_agendado_em, Date.now())}: ${m.nome_profissional}`, {
        description: `${m.codigo} · agendado para ${quandoBr(m.retorno_agendado_em, Date.now())}`,
        duration: 12_000,
        action: { label: 'Abrir', onClick: () => abrirManifestacao(m.id) },
      });
      tocarSomNotificacao(atrasado ? 'critica' : 'atencao');
    }
    // `urgentes` muda de identidade a cada segundo; a chave diz quando mudou de fato.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveUrgentes]);

  if (!v2) return null;
  const total = a.retornos.length + a.paraCiencia.length + a.paraResponder.length + a.respostas.length;
  if (total === 0) return null;

  async function rodar(chave: string, fn: () => Promise<unknown>, ok: string) {
    setOcupado(chave);
    try {
      await fn();
      toast.success(ok);
      recarregar();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setOcupado(null);
    }
  }

  const proximos = a.retornos.filter(m => urgenciaRetorno(m.retorno_agendado_em, agora) !== 'depois');
  const depois = a.retornos.filter(m => urgenciaRetorno(m.retorno_agendado_em, agora) === 'depois');
  const depoisVisiveis = verTodos ? depois : depois.slice(0, DEPOIS_VISIVEIS);
  const temUrgente = urgentes.length > 0 || a.paraCiencia.length > 0;

  return (
    <div className={cn(
      'rounded-xl border bg-card overflow-hidden',
      urgentes.length > 0 ? 'border-destructive/60' : a.paraCiencia.length > 0 ? 'border-warning/60' : '',
    )}>
      <div className={cn(
        'flex items-center gap-2.5 px-4 py-2.5 border-b',
        urgentes.length > 0 ? 'bg-destructive/10' : a.paraCiencia.length > 0 ? 'bg-warning/10' : 'bg-muted/30',
      )}>
        <span className={cn(
          'h-7 w-7 rounded-lg flex items-center justify-center shrink-0',
          urgentes.length > 0 ? 'bg-destructive text-destructive-foreground animate-ouvidoria-pisca'
            : a.paraCiencia.length > 0 ? 'bg-warning text-warning-foreground animate-ouvidoria-pisca-ambar'
              : 'bg-primary/10 text-primary',
        )}>
          <BellRing className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Para você agora</p>
          <p className="text-[11px] text-muted-foreground">
            {temUrgente ? 'Tem coisa esperando você.' : 'O que está na sua mão na Ouvidoria.'}
            {' '}{ANTECEDENCIA_MINUTOS} min antes de cada retorno agendado a aba pisca e o sino do sistema avisa.
          </p>
        </div>
        <span className="text-xs font-bold tabular-nums rounded-full bg-background border px-2 py-0.5">{total}</span>
      </div>

      <ul className="divide-y">
        {[...proximos, ...depoisVisiveis].map(m => {
          const u = urgenciaRetorno(m.retorno_agendado_em, agora);
          const quente = u === 'agora' || u === 'atrasado';
          return (
            <Item
              key={`r-${m.id}`}
              m={m}
              icone={<AlarmClock className="h-4 w-4" />}
              tom={quente ? 'urgente' : u === 'hoje' ? 'info' : 'neutro'}
              piscar={quente}
              titulo={
                u === 'atrasado' ? `Retorno atrasado ${faltaBr(m.retorno_agendado_em, agora)}`
                  : u === 'agora' ? `Dar retorno ${faltaBr(m.retorno_agendado_em, agora)}`
                    : `Retorno agendado ${quandoBr(m.retorno_agendado_em, agora)}`
              }
              detalhe={[quandoBr(m.retorno_agendado_em, agora), m.retorno_agendado_nota].filter(Boolean).join(' · ')}
              aoAbrir={() => abrirManifestacao(m.id)}
              acao={
                <Button size="sm" variant={quente ? 'default' : 'outline'} className="h-7 text-xs"
                        disabled={!!ocupado}
                        onClick={() => void rodar(`r-${m.id}`, () => retornoDado(m.id, null), `Retorno de ${m.nome_profissional} registrado.`)}>
                  {ocupado === `r-${m.id}` ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
                  Retorno feito
                </Button>
              }
            />
          );
        })}
        {depois.length > DEPOIS_VISIVEIS && (
          <li>
            <button type="button" onClick={() => setVerTodos(v => !v)}
                    className="w-full px-4 py-1.5 text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center justify-center gap-1">
              <ChevronDown className={cn('h-3 w-3 transition-transform', verTodos && 'rotate-180')} />
              {verTodos ? 'Mostrar menos' : `Mais ${depois.length - DEPOIS_VISIVEIS} agendados para outros dias`}
            </button>
          </li>
        )}

        {a.paraCiencia.map(m => (
          <Item
            key={`c-${m.id}`}
            m={m}
            icone={<UserRoundCheck className="h-4 w-4" />}
            tom="atencao"
            piscar
            titulo={`${m.criado_por_nome ?? 'Alguém'} encaminhou para você`}
            detalhe="Dê ciência para quem encaminhou saber que você viu."
            aoAbrir={() => abrirManifestacao(m.id)}
            acao={
              <Button size="sm" className="h-7 text-xs" disabled={!!ocupado}
                      onClick={() => void rodar(`c-${m.id}`, () => encaminhamento(m.id, 'ciente'), 'Ciência registrada.')}>
                {ocupado === `c-${m.id}` ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <CheckCheck className="h-3 w-3 mr-1" />}
                Estou ciente
              </Button>
            }
          />
        ))}

        {a.paraResponder.map(m => (
          <Item
            key={`p-${m.id}`}
            m={m}
            icone={<MessageSquareReply className="h-4 w-4" />}
            tom="info"
            titulo={`${m.criado_por_nome ?? 'Quem registrou'} aguarda a sua resposta`}
            detalhe="Você deu ciência. Responda pela manifestação quando tiver a análise."
            aoAbrir={() => abrirManifestacao(m.id)}
            acao={
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => abrirManifestacao(m.id)}>
                Responder
              </Button>
            }
          />
        ))}

        {a.respostas.map(m => (
          <Item
            key={`v-${m.id}`}
            m={m}
            icone={<MessageSquareReply className="h-4 w-4" />}
            tom="sucesso"
            titulo={`${m.responsavel_nome ?? 'O responsável'} respondeu`}
            detalhe="Abra para ler a resposta na linha do tempo."
            aoAbrir={() => abrirManifestacao(m.id)}
            acao={
              <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!!ocupado}
                      onClick={() => void rodar(`v-${m.id}`, () => encaminhamento(m.id, 'visto'), 'Marcada como vista.')}>
                {ocupado === `v-${m.id}` ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Eye className="h-3 w-3 mr-1" />}
                Ok, vi
              </Button>
            }
          />
        ))}
      </ul>
    </div>
  );
}

const TOM = {
  urgente: 'bg-destructive/15 text-destructive',
  atencao: 'bg-warning/15 text-warning',
  info: 'bg-info/10 text-info',
  sucesso: 'bg-success/10 text-success',
  neutro: 'bg-muted text-muted-foreground',
} as const;

function Item({ m, icone, tom, piscar, titulo, detalhe, aoAbrir, acao }: {
  m: Manifestacao; icone: React.ReactNode; tom: keyof typeof TOM; piscar?: boolean;
  titulo: string; detalhe?: string | null; aoAbrir: () => void; acao: React.ReactNode;
}) {
  return (
    <li className={cn(
      'flex flex-wrap sm:flex-nowrap items-center gap-3 px-4 py-2.5',
      piscar && tom === 'urgente' && 'bg-destructive/5',
      piscar && tom === 'atencao' && 'bg-warning/5',
    )}>
      <span className={cn(
        'h-8 w-8 rounded-lg flex items-center justify-center shrink-0', TOM[tom],
        piscar && (tom === 'urgente' ? 'animate-ouvidoria-pisca' : 'animate-ouvidoria-pisca-ambar'),
      )}>
        {icone}
      </span>
      <button type="button" onClick={aoAbrir} className="min-w-0 flex-1 text-left group">
        <p className={cn('text-sm font-semibold sm:truncate', tom === 'urgente' && 'text-destructive')}>{titulo}</p>
        <p className="text-[11px] text-muted-foreground line-clamp-2 sm:line-clamp-none sm:truncate group-hover:text-foreground">
          <span className="font-mono">{m.codigo}</span> · {m.nome_profissional}{detalhe ? ` · ${detalhe}` : ''}
        </p>
      </button>
      <div className="shrink-0 ml-auto">{acao}</div>
    </li>
  );
}
