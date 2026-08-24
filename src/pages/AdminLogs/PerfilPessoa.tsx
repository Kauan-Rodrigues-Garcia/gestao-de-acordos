/**
 * PerfilPessoa — tudo o que uma pessoa fez no período.
 *
 * ## O que mudou, e por quê
 *
 * A janela antiga respondia «quais telas, quantos dias». O pedido da gerência é
 * outro: «clicando no card da pessoa, saber tudo que ela fez — qual aba
 * acessou, quantas num dia, qual foi o dia que mais usou, quantas ações fez».
 *
 * Isso não cabe em `uso_telas` sozinho. **Navegação** mora ali; **ação** mora em
 * `logs_sistema`. `fn_uso_perfil_pessoa` junta as duas num JSON só — e num JSON
 * só, e não em sete RPCs, porque sete recortes viriam com sete estados de
 * carregamento numa janela que abre de uma vez.
 *
 * ## Abrir uma tela dez vezes não é fazer dez coisas
 *
 * Por isso a janela separa **aberturas** de **ações**, inclusive no gráfico, com
 * uma barra para cada. Quem passeia pelo sistema o dia todo e não mexe em nada
 * tem tempo alto e ação zero — e essa diferença é exatamente o que a gerência
 * precisa enxergar.
 *
 * ## O percentual
 *
 * `calcularAssiduidade` (arquivo próprio, com teste): dias em que apareceu ÷
 * dias úteis já decorridos do período, com os feriados que a meta usa. Não é
 * tempo de tela nem contagem de login — é presença. Ver o cabeçalho de
 * `assiduidade.ts` para por que o denominador não são os logins.
 *
 * ## Arquivo próprio
 *
 * Saiu de dentro de `ListaUsuariosUso.tsx` quando cresceu: aquele arquivo
 * responde «quem usou mais», este responde «o que esta pessoa fez». Duas
 * perguntas, dois arquivos — e o Fast Refresh do Vite deixa de descartar o
 * estado da lista a cada ajuste no perfil.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Clock, MousePointerClick, CalendarDays, Monitor, X, Loader2, Zap, Trophy,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { PERFIL_LABELS } from '@/lib/index';
import { cn } from '@/lib/utils';
import { rotuloDaTela } from '@/lib/telas-catalogo';
import { getMetasConfig } from '@/services/metas/metasConfig.service';
import {
  buscarPerfilPessoa, type UsoPorPessoa, type PerfilUsoPessoa,
} from '@/services/uso.service';
import { numeroBr, tempoRelativo, iniciais, formatarDuracao } from './formatos';
import { montarSerieDiaria } from './serieDiaria';
import { calcularAssiduidade, faixaAssiduidade, mesesDaJanela } from './assiduidade';

/**
 * Altura útil das barras do «Por dia», em pixels.
 *
 * Em pixel, e não em `h-20` + porcentagem: porcentagem de altura só resolve
 * contra um pai de altura definida, e a coluna de cada dia vive dentro de um
 * container `items-end` — que não estica os filhos. Ver o comentário no JSX.
 */
const ALTURA_GRAFICO = 72;

/** A cor da barra segue a faixa do percentual, sem inventar uma segunda escala. */
const BARRA_DA_FAIXA: Record<string, string> = {
  'assíduo':    'bg-emerald-500',
  'regular':    'bg-sky-500',
  'esporádico': 'bg-amber-500',
  'raro':       'bg-red-400',
  'sem base':   'bg-muted-foreground',
};

export default function PerfilPessoa({
  pessoa, desde, ate, onFechar,
}: { pessoa: UsoPorPessoa | null; desde: string; ate: string; onFechar: () => void }) {
  const [perfil, setPerfil] = useState<PerfilUsoPessoa | null>(null);
  const [feriados, setFeriados] = useState<string[]>([]);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    if (!pessoa) return;
    let cancelado = false;
    setCarregando(true);
    setPerfil(null);

    /*
     * Os feriados vêm de `metas_config_mes`, que é POR MÊS — e uma janela de 90
     * dias atravessa três ou quatro. Buscar só o mês corrente faria o feriado do
     * meio do período ser cobrado como dia de trabalho.
     *
     * São no máximo quatro consultas pequenas, e só ao abrir a janela.
     */
    const meses = mesesDaJanela(desde, ate);
    void Promise.all([
      buscarPerfilPessoa(pessoa.usuario_id, desde, ate),
      Promise.all(meses.map(m => {
        const [ano, mes] = m.split('-').map(Number);
        return getMetasConfig(pessoa.empresa_id, mes, ano)
          .then(r => r.data?.feriados ?? [])
          .catch(() => [] as string[]);
      })),
    ]).then(([p, listas]) => {
      if (cancelado) return;
      setPerfil(p);
      setFeriados([...new Set(listas.flat())]);
      setCarregando(false);
    });
    return () => { cancelado = true; };
  }, [pessoa, desde, ate]);

  const serie = useMemo(
    () => (pessoa ? montarSerieDiaria(perfil?.por_dia ?? [], desde, ate) : []),
    [pessoa, perfil, desde, ate],
  );

  const assiduidade = useMemo(() => calcularAssiduidade({
    diasComAcesso: perfil?.dias_com_acesso ?? [],
    desde,
    ate,
    hoje: new Date().toISOString().slice(0, 10),
    feriados,
  }), [perfil, desde, ate, feriados]);

  /** Ações por dia viram um mapa, para casar com a série de navegação. */
  const acoesPorDia = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of perfil?.acoes_por_dia ?? []) {
      m.set(a.dia.slice(0, 10), Number(a.total) || 0);
    }
    return m;
  }, [perfil]);

  if (!pessoa) return null;

  const telas   = perfil?.por_tela ?? [];
  const maxSeg  = Math.max(...telas.map(t => Number(t.segundos)), 1);
  const maxDia  = Math.max(...serie.map(d => d.segundos), 1);
  const maxAcao = Math.max(...[...acoesPorDia.values()], 1);
  const faixa   = faixaAssiduidade(assiduidade.percentual);
  const totalSeg  = Number(perfil?.resumo?.segundos ?? 0);
  const totalAber = Number(perfil?.resumo?.aberturas ?? 0);

  return (
    <Dialog open onOpenChange={v => !v && onFechar()}>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto" aria-describedby="uso-perfil-desc">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <span className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-[11px] font-bold text-muted-foreground shrink-0">
              {iniciais(pessoa.nome)}
            </span>
            <span className="truncate">{pessoa.nome}</span>
            {pessoa.cargo && (
              <Badge variant="outline" className="text-[10px] h-5 px-1.5">
                {PERFIL_LABELS[pessoa.cargo] ?? pessoa.cargo}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription id="uso-perfil-desc" className="text-xs">
            {[pessoa.setor_nome, pessoa.equipe_nome].filter(Boolean).join(' · ') || 'Sem setor'}
            {' · '}
            {/* Quem trabalha nas duas operações aparece com as duas: a lista
                agora traz uma linha por PESSOA, e esconder a segunda empresa
                devolveria pela metade a informação que a correção deu. */}
            {(pessoa.empresas?.length ?? 0) > 1
              ? pessoa.empresas!.join(' + ')
              : pessoa.empresa_nome}
            {' · '}uso entre {desde} e {ate}. Tempo conta só com a aba em foco.
          </DialogDescription>
        </DialogHeader>

        {carregando ? (
          <div className="flex items-center gap-2 py-10 justify-center text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Carregando perfil…
          </div>
        ) : (
          <div className="space-y-4">
            {/* ── O percentual, em destaque ── */}
            <div className="rounded-xl border border-border bg-muted/20 p-3.5">
              <div className="flex items-end justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Percentual de uso
                  </p>
                  <p className={cn('text-3xl font-bold font-mono tabular-nums leading-none mt-1', faixa.cls)}>
                    {assiduidade.percentual === null ? '—' : `${assiduidade.percentual}%`}
                    <span className="text-xs font-sans font-medium ml-2">{faixa.rotulo}</span>
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Apareceu em <strong className="text-foreground">{assiduidade.diasComAcesso}</strong>
                    {' '}de <strong className="text-foreground">{assiduidade.diasUteis}</strong> dias
                    úteis do período
                    {assiduidade.diasForaDoUtil > 0
                      && ` · mais ${assiduidade.diasForaDoUtil} em fim de semana ou feriado`}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Entradas no sistema
                  </p>
                  <p className="text-xl font-bold font-mono tabular-nums leading-tight">
                    {numeroBr(perfil?.logins_total ?? 0)}
                  </p>
                  {/* Login e presença são coisas diferentes: quem deixa a aba
                      aberta a semana toda loga uma vez e usa cinco dias. Por
                      isso o percentual ao lado conta DIAS, e não logins. */}
                  <p className="text-[10px] text-muted-foreground">logins registrados</p>
                </div>
              </div>
              {/* A barra existe porque o número sozinho não mostra o que falta. */}
              <div className="h-1.5 rounded-full bg-muted overflow-hidden mt-3">
                <div
                  className={cn('h-full rounded-full', BARRA_DA_FAIXA[faixa.rotulo] ?? 'bg-muted-foreground')}
                  style={{ width: `${Math.min(100, assiduidade.percentual ?? 0)}%` }}
                />
              </div>
            </div>

            {/* ── Números do período ── */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {[
                { Icone: Clock,             label: 'Tempo total', valor: formatarDuracao(totalSeg) },
                { Icone: MousePointerClick, label: 'Aberturas',   valor: numeroBr(totalAber) },
                { Icone: CalendarDays,      label: 'Dias ativos', valor: String(perfil?.resumo?.dias_ativos ?? 0) },
                { Icone: Monitor,           label: 'Telas',       valor: String(perfil?.resumo?.telas_usadas ?? 0) },
                { Icone: Zap,               label: 'Ações',       valor: numeroBr(perfil?.acoes_total ?? 0) },
              ].map(({ Icone, label, valor }) => (
                <div key={label} className="rounded-lg border border-border bg-muted/20 p-2.5">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {label}
                    </span>
                    <Icone className="w-3 h-3 text-muted-foreground" />
                  </div>
                  <p className="text-base font-bold font-mono tabular-nums mt-0.5">{valor}</p>
                </div>
              ))}
            </div>

            {/* ── O dia de maior uso ── */}
            {perfil?.melhor_dia && (
              <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2">
                <Trophy className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <p className="text-[11px] leading-snug">
                  Dia de maior uso:{' '}
                  <strong className="text-foreground">
                    {perfil.melhor_dia.dia.slice(0, 10).split('-').reverse().join('/')}
                  </strong>
                  {' — '}{formatarDuracao(Number(perfil.melhor_dia.segundos))} em{' '}
                  {numeroBr(Number(perfil.melhor_dia.aberturas))} abertura(s) e{' '}
                  {perfil.melhor_dia.telas} tela(s)
                </p>
              </div>
            )}

            {/* ── Série diária: navegação e ação no mesmo eixo ── */}
            {serie.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Por dia
                  <span className="ml-1.5 font-normal normal-case tracking-normal text-muted-foreground/70">
                    · {serie.filter(p => !p.vazio).length} de {serie.length} dias com uso
                  </span>
                </p>
                {/*
                  As alturas são em PIXEL, e não em porcentagem.
                  ───────────────────────────────────────────────────────────
                  Porcentagem de altura só resolve contra um pai de altura
                  DEFINIDA. Aqui a coluna de cada dia fica dentro de um
                  container `items-end`, que não estica os filhos: a coluna
                  passa a ter altura de conteúdo, o wrapper `flex-1` dentro
                  dela não tem base definida, e todo `height: 60%` colapsa
                  para zero.

                  O gráfico ficava com todas as barras rasteiras — o defeito
                  relatado como «Por dia não está funcionando». Com pixel
                  calculado sobre `ALTURA_GRAFICO`, não há dependência de
                  layout e a barra mede o que diz medir.
                */}
                {/*
                  Barras e rótulos em DUAS linhas, e não empilhados dentro da
                  mesma coluna.
                  ───────────────────────────────────────────────────────────
                  Empilhados, a coluna tinha altura fixa e precisava caber a
                  barra (que vai até a altura inteira, no dia de pico) MAIS o
                  rótulo. O flex encolhia o embrulho da barra, a barra mantinha a
                  altura fixa que recebeu, e o resultado era barra transbordando
                  por cima do número do dia — e colunas desalinhadas, porque
                  cada uma transbordava um tanto diferente.

                  Separadas, a linha de cima só tem barras e a de baixo só tem
                  rótulos. As duas repetem `flex-1` e o mesmo `gap`, então as
                  colunas continuam alinhadas na vertical, e nenhuma altura de
                  barra pode invadir o texto.
                */}
                <div className="flex items-end gap-[2px]" style={{ height: ALTURA_GRAFICO }}>
                  {serie.map(d => {
                    const acoes = acoesPorDia.get(d.dia) ?? 0;
                    // Dia vazio ganha um traço de 2px em vez de sumir: ausência
                    // precisa ocupar espaço para ser lida.
                    const hTempo = d.vazio
                      ? 2
                      : Math.max(4, Math.round((d.segundos / maxDia) * ALTURA_GRAFICO));
                    const hAcoes = acoes
                      ? Math.max(4, Math.round((acoes / maxAcao) * ALTURA_GRAFICO))
                      : 0;
                    return (
                      <div key={d.dia} className="flex-1 min-w-0 flex items-end justify-center gap-[1px]">
                        <div
                          className={cn(
                            'flex-1 rounded-t transition-colors',
                            d.vazio ? 'bg-muted' : 'bg-primary/70 hover:bg-primary',
                          )}
                          style={{ height: hTempo }}
                          title={d.vazio
                            ? `${d.rotulo}: sem uso`
                            : `${d.rotulo}: ${formatarDuracao(d.segundos)} · ${d.aberturas} abertura(s)`}
                        />
                        {/* A barra fina de AÇÕES ao lado da de tempo: as duas
                            contam histórias diferentes, e ver as duas juntas é
                            o que mostra quem navega sem fazer nada. */}
                        {hAcoes > 0 && (
                          <div
                            className="w-[3px] rounded-t bg-amber-500/70 shrink-0"
                            style={{ height: hAcoes }}
                            title={`${d.rotulo}: ${acoes} ação(ões) registrada(s)`}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* A régua dos dias. Mesmo `flex-1` e mesmo `gap` da linha de
                    cima — é o que mantém cada rótulo debaixo da sua barra.
                    Com 90 dias os números viram uma tarja cinza: só o dia 1
                    sobrevive. */}
                <div className="flex gap-[2px] mt-1">
                  {serie.map(d => (
                    <span
                      key={d.dia}
                      className="flex-1 min-w-0 text-[8px] text-muted-foreground tabular-nums text-center truncate"
                    >
                      {serie.length <= 31 || d.dia.slice(8, 10) === '01' ? d.dia.slice(8, 10) : ''}
                    </span>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground mt-1.5 flex items-center gap-3">
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2 h-2 rounded-sm bg-primary/70" /> tempo em tela
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2 h-2 rounded-sm bg-amber-500/70" /> ações registradas
                  </span>
                </p>
              </div>
            )}

            {/* ── O que ela FEZ ── */}
            {(perfil?.acoes_total ?? 0) > 0 && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Ações por categoria
                  </p>
                  <div className="space-y-1.5">
                    {(perfil?.acoes_por_categoria ?? []).slice(0, 8).map(c => (
                      <div key={c.categoria} className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="truncate">{c.categoria}</span>
                        <span className="font-mono tabular-nums font-semibold shrink-0">
                          {numeroBr(Number(c.total))}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Ações mais frequentes
                  </p>
                  <div className="space-y-1.5">
                    {(perfil?.acoes_top ?? []).slice(0, 8).map(a => (
                      <div key={a.acao} className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="truncate font-mono" title={a.acao}>{a.acao}</span>
                        <span className="font-mono tabular-nums font-semibold shrink-0">
                          {numeroBr(Number(a.total))}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── Telas ── */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Telas usadas
              </p>
              {telas.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4 text-center">
                  Nenhuma tela registrada para esta pessoa no período.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border text-muted-foreground">
                        <th className="text-left px-2 py-1.5 font-semibold">TELA</th>
                        <th className="text-right px-2 py-1.5 font-semibold">TEMPO</th>
                        <th className="text-right px-2 py-1.5 font-semibold">ABERTURAS</th>
                        <th className="text-right px-2 py-1.5 font-semibold">DIAS</th>
                        <th className="text-right px-2 py-1.5 font-semibold">ÚLTIMA VEZ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {telas.map(t => (
                        <tr key={t.tela} className="border-b border-border/50">
                          <td className="px-2 py-1.5 max-w-[220px]">
                            <span className="font-medium" title={t.tela}>{rotuloDaTela(t.tela)}</span>
                            <div className="h-1 rounded-full bg-muted overflow-hidden mt-1">
                              <div className="h-full rounded-full bg-primary/70"
                                style={{ width: `${Math.max(2, (Number(t.segundos) / maxSeg) * 100)}%` }} />
                            </div>
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono tabular-nums font-semibold">
                            {formatarDuracao(Number(t.segundos))}
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                            {numeroBr(Number(t.aberturas))}
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono tabular-nums">{t.dias}</td>
                          <td className="px-2 py-1.5 text-right text-muted-foreground">
                            {t.ultimo_em ? tempoRelativo(t.ultimo_em) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex justify-end pt-1">
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={onFechar}>
            <X className="w-3.5 h-3.5" /> Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
