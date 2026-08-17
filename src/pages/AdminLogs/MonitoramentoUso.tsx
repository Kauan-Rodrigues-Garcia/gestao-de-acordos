/**
 * MonitoramentoUso — quem usa a planilha, quanto, e em quais telas.
 *
 * ## A pergunta que originou a tela
 *
 * "Quais líderes mais utilizam a planilha, quais acessam mais o Painel Líder e o
 * Desempenho Equipes." O ranking de quem usa responde metade; a outra metade —
 * a acionável — é **quem não usa**, e essa lista não sai de `uso_telas`, porque
 * quem não abriu não tem linha. Por isso o bloco de adoção parte de `perfis` e
 * traz o uso por LEFT JOIN (`fn_uso_adocao_tela`).
 *
 * ## O que os números significam
 *
 * **Tempo** é com a aba em foco, não com a aba aberta — ver `RastreioUsoProvider`.
 * **Aberturas** conta entradas na tela; passagem abaixo de 2 segundos não conta.
 * **Dias ativos** é em quantos dias distintos a pessoa usou alguma tela.
 *
 * O cargo vem gravado na linha de uso, não do perfil atual: promover alguém não
 * reescreve o histórico dele como se sempre tivesse sido líder.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Activity, Users, Clock, MousePointerClick, CalendarDays, AlertTriangle, Loader2,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { PERFIL_LABELS } from '@/lib/index';
import { rotuloDaTela } from '@/lib/telas-catalogo';
import {
  buscarUsoPorPessoa, buscarUsoPorTela, buscarUsoPorDia, buscarAdocaoTela,
  type UsoPorPessoa, type UsoPorTela, type UsoPorDia, type AdocaoTela,
} from '@/services/uso.service';
import ListaUsuariosUso from './ListaUsuariosUso';
import { numeroBr, tempoRelativo, formatarDuracao } from './formatos';

/** Períodos oferecidos. 7 dias é o padrão: responde "esta semana". */
const PERIODOS = [
  { dias: 7,  label: 'Últimos 7 dias' },
  { dias: 30, label: 'Últimos 30 dias' },
  { dias: 90, label: 'Últimos 90 dias' },
] as const;

/** Cargos que o painel separa. Ordem de hierarquia, não alfabética. */
const CARGOS = [
  'operador', 'ouvidoria', 'lider', 'elite', 'gerencia', 'diretoria',
  'administrador', 'super_admin',
] as const;

/**
 * Telas oferecidas no bloco de adoção.
 *
 * Lista curta e escolhida: são as telas de gestão sobre as quais faz sentido
 * perguntar "quem ainda não abriu". Um seletor com as 30 telas do sistema
 * transformaria a pergunta em garimpo.
 */
const TELAS_ADOCAO = [
  'lider:desempenho', 'lider:quartis', 'lider:grafico', 'lider:time',
  'lider', 'analitico', 'admin/metas', 'diretoria',
] as const;

function isoDiasAtras(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return d.toISOString().slice(0, 10);
}

function Kpi({
  icone, label, valor, sub,
}: { icone: React.ReactNode; label: string; valor: string; sub?: string }) {
  return (
    <Card className="p-3.5 flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span className="text-muted-foreground">{icone}</span>
      </div>
      <span className="text-xl font-bold font-mono tabular-nums leading-tight">{valor}</span>
      {sub && <span className="text-[10px] text-muted-foreground leading-snug">{sub}</span>}
    </Card>
  );
}

/** Barra proporcional ao maior valor da lista — comparação sem eixo. */
function Barra({ valor, maximo, cor }: { valor: number; maximo: number; cor: string }) {
  const pct = maximo > 0 ? Math.max(2, (valor / maximo) * 100) : 0;
  return (
    <div className="h-1.5 rounded-full bg-muted overflow-hidden min-w-[40px]">
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: cor }} />
    </div>
  );
}

interface Props {
  /**
   * Empresas que quem está olhando pode escolher. Uma só = o seletor não aparece.
   *
   * A lista vem do pai porque ele já a busca para o filtro da trilha. Ela NÃO é
   * o gate: a policy de `uso_telas` recusa a empresa alheia de todo jeito.
   */
  empresas: { id: string; nome: string }[];
}

const TODAS_EMPRESAS = '__todas__';

export default function MonitoramentoUso({ empresas }: Props) {
  const [dias, setDias]       = useState<number>(7);
  const [cargo, setCargo]     = useState<string>('lider');
  const [telaAdocao, setTelaAdocao] = useState<string>('lider:desempenho');
  // Padrão: TODAS. O pedido é "mostra das 2 empresas" — quem enxerga só uma
  // recebe só uma de volta, porque a RLS o restringe.
  const [filtroEmpresa, setFiltroEmpresa] = useState<string>(TODAS_EMPRESAS);
  const empresaId = filtroEmpresa === TODAS_EMPRESAS ? null : filtroEmpresa;

  const [pessoas, setPessoas] = useState<UsoPorPessoa[]>([]);
  const [telas, setTelas]     = useState<UsoPorTela[]>([]);
  const [porDia, setPorDia]   = useState<UsoPorDia[]>([]);
  const [adocao, setAdocao]   = useState<AdocaoTela[]>([]);
  const [carregando, setCarregando] = useState(true);

  const janela = useMemo(() => ({
    empresaId,
    desde: isoDiasAtras(dias),
    ate:   new Date().toISOString().slice(0, 10),
    cargo: cargo === '__todos__' ? null : cargo,
  }), [empresaId, dias, cargo]);

  useEffect(() => {
    let cancelado = false;
    setCarregando(true);
    void Promise.all([
      buscarUsoPorPessoa(janela),
      buscarUsoPorTela(janela),
      buscarUsoPorDia(janela),
      buscarAdocaoTela(janela, telaAdocao),
    ]).then(([p, t, d, a]) => {
      if (cancelado) return;
      setPessoas(p); setTelas(t); setPorDia(d); setAdocao(a);
      setCarregando(false);
    });
    return () => { cancelado = true; };
  }, [janela, telaAdocao]);

  const totais = useMemo(() => {
    const segundos  = pessoas.reduce((s, p) => s + Number(p.segundos), 0);
    const aberturas = pessoas.reduce((s, p) => s + Number(p.aberturas), 0);
    const ativos    = pessoas.length;
    const mediaDias = ativos
      ? pessoas.reduce((s, p) => s + Number(p.dias_ativos), 0) / ativos
      : 0;
    return { segundos, aberturas, ativos, mediaDias };
  }, [pessoas]);

  const nunca = adocao.filter(a => Number(a.aberturas) === 0);
  const maxSegTela   = Math.max(...telas.map(t => Number(t.segundos)), 1);
  const maxDia       = Math.max(...porDia.map(d => Number(d.segundos)), 1);

  const vazio = !carregando && pessoas.length === 0;

  return (
    <div className="space-y-4">
      {/* ── Filtros ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        <Select value={String(dias)} onValueChange={v => setDias(Number(v))}>
          <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {PERIODOS.map(p => (
              <SelectItem key={p.dias} value={String(p.dias)}>{p.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={cargo} onValueChange={setCargo}>
          <SelectTrigger className="h-8 w-44 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__todos__">Todos os cargos</SelectItem>
            {CARGOS.map(c => (
              <SelectItem key={c} value={c}>{PERFIL_LABELS[c] ?? c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {/* Uma empresa só não justifica seletor. */}
        {empresas.length > 1 && (
          <Select value={filtroEmpresa} onValueChange={setFiltroEmpresa}>
            <SelectTrigger className="h-8 w-44 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={TODAS_EMPRESAS}>Todas as empresas</SelectItem>
              {empresas.map(e => (
                <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {carregando && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
      </div>

      {vazio && (
        <Card className="p-6 text-center space-y-2">
          <Activity className="w-6 h-6 mx-auto text-muted-foreground" />
          <p className="text-sm font-semibold">Nenhum uso registrado neste período.</p>
          <p className="text-xs text-muted-foreground max-w-lg mx-auto">
            A medição começa a partir do momento em que esta função entra no ar —
            não há histórico de navegação anterior para recuperar. Se acabou de
            subir, volte amanhã.
          </p>
        </Card>
      )}

      {!vazio && (
        <>
          {/* ── Números do período ──────────────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi icone={<Users className="w-4 h-4" />} label="Pessoas ativas"
              valor={numeroBr(totais.ativos)}
              sub={cargo === '__todos__' ? 'com algum uso no período' : `${PERFIL_LABELS[cargo] ?? cargo} com uso`} />
            <Kpi icone={<Clock className="w-4 h-4" />} label="Tempo total"
              valor={formatarDuracao(totais.segundos)} sub="com a aba em foco" />
            <Kpi icone={<MousePointerClick className="w-4 h-4" />} label="Aberturas"
              valor={numeroBr(totais.aberturas)} sub="entradas em tela" />
            <Kpi icone={<CalendarDays className="w-4 h-4" />} label="Dias ativos"
              valor={totais.mediaDias.toFixed(1)} sub="média por pessoa" />
          </div>

          {/* ── Atividade por dia ───────────────────────────────────────── */}
          {porDia.length > 0 && (
            <Card className="p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Atividade por dia
              </p>
              <div className="flex items-end gap-1 h-24">
                {porDia.map(d => (
                  <div key={d.dia} className="flex-1 flex flex-col items-center gap-1 min-w-0 group">
                    <div className="w-full rounded-t bg-primary/70 group-hover:bg-primary transition-colors"
                      style={{ height: `${Math.max(3, (Number(d.segundos) / maxDia) * 100)}%` }}
                      title={`${d.dia}: ${formatarDuracao(Number(d.segundos))} · ${d.pessoas} pessoa(s)`} />
                    <span className="text-[9px] text-muted-foreground tabular-nums truncate w-full text-center">
                      {d.dia.slice(8, 10)}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* ── Lista de pessoas: busca, top 10 e detalhe ───────────────── */}
          <ListaUsuariosUso
            pessoas={pessoas}
            mostrarEmpresa={empresaId === null}
            desde={janela.desde}
            ate={janela.ate}
            carregando={carregando}
          />

          <div className="grid gap-4 lg:grid-cols-2">
            {/* ── Telas mais usadas ────────────────────────────────────── */}
            <Card className="p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Telas mais usadas
                {cargo !== '__todos__' && ` · ${PERFIL_LABELS[cargo] ?? cargo}`}
              </p>
              <div className="space-y-2.5">
                {telas.slice(0, 12).map(t => (
                  <div key={t.tela} className="min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-xs font-medium truncate" title={t.tela}>
                        {rotuloDaTela(t.tela)}
                      </span>
                      <span className="text-[11px] font-mono tabular-nums font-semibold shrink-0">
                        {formatarDuracao(Number(t.segundos))}
                      </span>
                    </div>
                    <Barra valor={Number(t.segundos)} maximo={maxSegTela} cor="#6366f1" />
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      {numeroBr(Number(t.aberturas))} aberturas · {t.pessoas} pessoa(s)
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* ── Adoção de uma tela ──────────────────────────────────────── */}
          <Card className="p-4">
            <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Adoção de uma tela
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Inclui quem <strong>não</strong> abriu — é a lista acionável.
                </p>
              </div>
              <Select value={telaAdocao} onValueChange={setTelaAdocao}>
                <SelectTrigger className="h-8 w-64 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TELAS_ADOCAO.map(t => (
                    <SelectItem key={t} value={t}>{rotuloDaTela(t)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {nunca.length > 0 && (
              <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 mb-3">
                <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0 mt-0.5" />
                <p className="text-[11px] leading-snug">
                  <strong>{nunca.length}</strong>{' '}
                  {cargo === '__todos__' ? 'pessoa(s)' : `${PERFIL_LABELS[cargo] ?? cargo}(s)`}{' '}
                  não abriu esta tela nenhuma vez no período:{' '}
                  <span className="text-muted-foreground">
                    {nunca.slice(0, 8).map(p => p.nome.split(' ')[0]).join(', ')}
                    {nunca.length > 8 && ` e mais ${nunca.length - 8}`}
                  </span>
                </p>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="text-left px-2 py-1.5 font-semibold">PESSOA</th>
                    {cargo === '__todos__' && <th className="text-left px-2 py-1.5 font-semibold">CARGO</th>}
                    <th className="text-right px-2 py-1.5 font-semibold">ABERTURAS</th>
                    <th className="text-right px-2 py-1.5 font-semibold">TEMPO</th>
                    <th className="text-right px-2 py-1.5 font-semibold">ÚLTIMA VEZ</th>
                  </tr>
                </thead>
                <tbody>
                  {adocao.map(p => {
                    const zerado = Number(p.aberturas) === 0;
                    return (
                      <tr key={p.usuario_id}
                        className={cn('border-b border-border/50', zerado && 'bg-destructive/[0.04]')}>
                        <td className="px-2 py-1.5 font-medium truncate max-w-[200px]">{p.nome}</td>
                        {cargo === '__todos__' && (
                          <td className="px-2 py-1.5 text-muted-foreground">
                            {p.cargo ? PERFIL_LABELS[p.cargo] ?? p.cargo : '—'}
                          </td>
                        )}
                        <td className={cn('px-2 py-1.5 text-right font-mono tabular-nums',
                          zerado && 'text-destructive font-semibold')}>
                          {numeroBr(Number(p.aberturas))}
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                          {zerado ? '—' : formatarDuracao(Number(p.segundos))}
                        </td>
                        <td className="px-2 py-1.5 text-right text-muted-foreground">
                          {p.ultimo_em ? tempoRelativo(p.ultimo_em) : 'nunca'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <p className="text-[11px] text-muted-foreground">
            Tempo conta só com a aba <strong>em foco</strong> — planilha aberta em
            segundo plano não entra. Passagem abaixo de 2 segundos não conta como
            abertura. O cargo é o que a pessoa tinha no momento do uso, não o
            atual. Dado guardado por 180 dias.
          </p>
        </>
      )}
    </div>
  );
}
