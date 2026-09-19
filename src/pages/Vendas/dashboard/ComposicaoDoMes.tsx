/**
 * ComposicaoDoMes — as três caixas do rodapé do Dashboard: quem, que equipe,
 * que estado.
 *
 * ## Por que pódio de três, e não o ranking de doze
 *
 * O Dashboard mostrava doze linhas de ranking, e o Painel Líder mostra a lista
 * inteira com as ações do líder ao lado. Era a mesma tabela duas vezes, e a do
 * Dashboard era a versão pior — sem as ações, cortada num número arbitrário.
 *
 * A pergunta do Dashboard não é «quem são todos», é «quem puxou o mês». Isso
 * são três nomes, e três nomes cabem num pódio que se lê de relance. Quem
 * precisa da lista inteira clica em «ver todos» e vai para a tela que a tem de
 * verdade — com as ações, e sem corte.
 *
 * ## O destaque do dia mora aqui, e não num card solto
 *
 * Ele é «quem puxou o mês» recortado em um dia: mesma pergunta, outra janela.
 * Como faixa própria no meio da tela ele empurrava o resto para baixo para
 * dizer uma linha.
 *
 * ## As barras são CSS, e o motivo é técnico
 *
 * Os anéis desta tela são recharts porque fatia de anel precisa de geometria.
 * Barra horizontal é largura em porcentagem, e uma `div` faz isso sem carregar
 * escala, tooltip e medição de container a cada render — a mesma decisão que
 * `AnelProjecao` documenta no painel da cobrança.
 */
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Trophy, Users, MapPin, Bot, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MEDAL_STYLES, itemVariants } from '@/components/AnalyticsPanel/constants';
import { formatBRL } from '@/lib/money';
import { formatDate } from '@/lib/index';
import { cn } from '@/lib/utils';
import type { LinhaDoPlacar, LinhaDaEquipe, FatiaSimples, Destaque } from '@/lib/vendasPlacar';
import type { ReguaMeta } from '@/lib/vendasMeta';
import { corTexto } from '@/lib/temas';

/**
 * A cor da barra de cada degrau do pódio — ouro, prata e bronze.
 *
 * Hex, e não as classes de `MEDAL_STYLES`: aquelas pintam o círculo do número
 * (fundo, texto e borda em tons de opacidade), e a barra precisa de uma cor
 * sólida em `style`. Ter as duas lado a lado é o que mantém o degrau legível
 * mesmo quando os três valores são parecidos.
 */
const COR_DO_DEGRAU = ['#f59e0b', '#94a3b8', '#fb923c'] as const;

/** O cabeçalho das três caixas — mesmo desenho do `CardMetaDonut`. */
function Cabecalho({
  titulo, Icone, cor, acao,
}: {
  titulo: string;
  Icone: typeof Trophy;
  cor: string;
  acao?: React.ReactNode;
}) {
  return (
    <CardHeader className="pb-2 pt-4 px-4">
      <div className="flex items-center justify-between gap-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2 min-w-0">
          <div
            className="flex items-center justify-center w-6 h-6 rounded-md shrink-0"
            style={{ background: cor + '22' }}
          >
            <Icone className="w-3.5 h-3.5" style={{ color: corTexto(cor) }} />
          </div>
          <span className="truncate">{titulo}</span>
        </CardTitle>
        {acao}
      </div>
    </CardHeader>
  );
}

function Vazio({ texto }: { texto: string }) {
  return (
    <p className="px-1 py-6 text-center text-xs text-muted-foreground">{texto}</p>
  );
}

/* ── Pódio ────────────────────────────────────────────────────────────────── */

interface PodioProps {
  /** O ranking já sem a automação — ver `separarAutomacao`. */
  pessoas: readonly LinhaDoPlacar[];
  regua: ReguaMeta;
  destaque: Destaque | null;
  /** Quantas pessoas venderam no mês, para a linha «e mais N». */
  total: number;
  /** `null` esconde o «ver todos»: sem a chave, o link levaria a uma porta fechada. */
  linkDoRanking: string | null;
}

export function Podio({ pessoas, regua, destaque, total, linkDoRanking }: PodioProps) {
  const topo = pessoas.slice(0, 3);
  const maior = topo[0]
    ? (regua === 'quantidade' ? topo[0].resumo.quantidade : topo[0].resumo.valor)
    : 0;

  return (
    <Card className="flex flex-col border-border/70 bg-card shadow-sm">
      <Cabecalho
        titulo="Pódio do mês" Icone={Trophy} cor="#f59e0b"
        acao={linkDoRanking && total > topo.length ? (
          <Link
            to={linkDoRanking}
            className="flex shrink-0 items-center gap-0.5 text-[11px] text-muted-foreground hover:text-foreground"
          >
            ver todos ({total})
            <ChevronRight className="w-3 h-3" />
          </Link>
        ) : undefined}
      />
      <CardContent className="flex-1 px-4 pb-4">
        {topo.length === 0 ? (
          <Vazio texto="Nenhuma venda na régua neste mês." />
        ) : (
          <div className="space-y-2.5">
            {topo.map((l, i) => {
              const medida = regua === 'quantidade' ? l.resumo.quantidade : l.resumo.valor;
              const medalha = MEDAL_STYLES[i];
              return (
                <motion.div key={l.operadorId} variants={itemVariants} className="space-y-1">
                  <div className="flex items-center gap-2.5">
                    <span className={cn(
                      'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold tabular-nums',
                      medalha.bg, medalha.text, medalha.border,
                    )}>
                      {medalha.label}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                      {l.nome}
                    </span>
                    <span className="shrink-0 text-[13px] font-bold tabular-nums font-mono">
                      {regua === 'quantidade' ? l.resumo.quantidade : formatBRL(l.resumo.valor)}
                    </span>
                  </div>
                  {/* A barra é a distância entre o primeiro e os outros dois —
                      «venceu por pouco» e «abriu vantagem» são notícias
                      diferentes, e o número sozinho não conta qual foi. */}
                  <div className="ml-8 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full transition-[width] duration-700 ease-out"
                      style={{
                        width: `${maior > 0 ? Math.max(4, Math.round((medida / maior) * 100)) : 4}%`,
                        background: COR_DO_DEGRAU[i],
                      }}
                    />
                  </div>
                  <p className="ml-8 text-[10.5px] text-muted-foreground">
                    {regua === 'quantidade'
                      ? formatBRL(l.resumo.valor)
                      : `${l.resumo.quantidade} venda${l.resumo.quantidade === 1 ? '' : 's'}`}
                    {l.equipeNome ? ` · ${l.equipeNome}` : ''}
                  </p>
                </motion.div>
              );
            })}

            {destaque && (
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg border border-primary/25 bg-primary/5 px-2.5 py-2">
                <Trophy className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                <span className="text-[11px] text-muted-foreground">
                  Destaque de {formatDate(destaque.dia)}
                </span>
                <span className="text-[12px] font-semibold">{destaque.linha.nome}</span>
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {formatBRL(destaque.linha.resumo.valor)}
                </span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ── Equipes ──────────────────────────────────────────────────────────────── */

/**
 * As equipes do setor, em barra.
 *
 * «Sem equipe» aparece como as outras, em cinza, e nunca some: eram 9 das 140
 * vendas na medição de 15/09, e uma tela que as esconde mostra uma soma por
 * equipe que não bate com o total do setor — o defeito que o Fechamento existe
 * para tornar impossível.
 */
export function Equipes({
  equipes, regua,
}: { equipes: readonly LinhaDaEquipe[]; regua: ReguaMeta }) {
  const medida = (e: LinhaDaEquipe) =>
    regua === 'quantidade' ? e.resumo.quantidade : e.resumo.valor;
  const maior = Math.max(1, ...equipes.map(medida));

  return (
    <Card className="flex flex-col border-border/70 bg-card shadow-sm">
      <Cabecalho titulo="Por equipe" Icone={Users} cor="#6366f1" />
      <CardContent className="flex-1 px-4 pb-4">
        {equipes.length === 0 ? (
          <Vazio texto="Nenhuma venda na régua neste mês." />
        ) : (
          <div className="space-y-2.5">
            {equipes.map(e => (
              <div key={e.equipeId ?? 'sem'} className="space-y-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className={cn(
                    'min-w-0 truncate text-[12px] font-medium',
                    e.equipeId === null && 'text-muted-foreground',
                  )}>
                    {e.nome}
                  </span>
                  <span className="shrink-0 text-[12px] font-semibold tabular-nums font-mono">
                    {regua === 'quantidade' ? e.resumo.quantidade : formatBRL(e.resumo.valor)}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full transition-[width] duration-700 ease-out"
                    style={{
                      width: `${Math.max(3, Math.round((medida(e) / maior) * 100))}%`,
                      background: e.equipeId === null ? '#94a3b8' : '#6366f1',
                    }}
                  />
                </div>
                <p className="text-[10.5px] text-muted-foreground">
                  {e.pessoas} {e.pessoas === 1 ? 'pessoa vendeu' : 'pessoas venderam'}
                  {' · '}
                  {regua === 'quantidade'
                    ? formatBRL(e.resumo.valor)
                    : `${e.resumo.quantidade} venda${e.resumo.quantidade === 1 ? '' : 's'}`}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ── Estados ──────────────────────────────────────────────────────────────── */

/**
 * Para onde o setor vende, em barra, do maior para o menor.
 *
 * Só o que está na régua — um mapa que pinta São Paulo com vendas canceladas
 * responde a pergunta errada. A perda por estado é outra tela, e não foi pedida.
 */
export function Estados({ ufs }: { ufs: readonly FatiaSimples[] }) {
  const mostrados = ufs.slice(0, 8);
  const resto = ufs.length - mostrados.length;
  const maior = Math.max(1, ...mostrados.map(f => f.valor));

  return (
    <Card className="flex flex-col border-border/70 bg-card shadow-sm">
      <Cabecalho
        titulo="Por estado" Icone={MapPin} cor="#14b8a6"
        acao={ufs.length > 0 ? (
          <span className="shrink-0 text-[11px] text-muted-foreground">
            {ufs.length} {ufs.length === 1 ? 'estado' : 'estados'}
          </span>
        ) : undefined}
      />
      <CardContent className="flex-1 px-4 pb-4">
        {mostrados.length === 0 ? (
          <Vazio texto="Nenhuma venda na régua neste mês." />
        ) : (
          <div className="space-y-2">
            {mostrados.map(f => (
              <div key={f.chave} className="flex items-center gap-2.5">
                <span className="w-7 shrink-0 text-[11px] font-semibold tabular-nums text-muted-foreground">
                  {f.rotulo}
                </span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-teal-500 transition-[width] duration-700 ease-out"
                    style={{ width: `${Math.max(3, Math.round((f.valor / maior) * 100))}%` }}
                  />
                </div>
                <span className="w-24 shrink-0 text-right text-[11px] tabular-nums font-mono">
                  {formatBRL(f.valor)}
                </span>
                <span className="w-5 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                  {f.quantidade}
                </span>
              </div>
            ))}
            {resto > 0 && (
              <p className="pt-0.5 text-[10.5px] text-muted-foreground">
                e mais {resto} {resto === 1 ? 'estado' : 'estados'} com menos volume
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ── Automação ────────────────────────────────────────────────────────────── */

/**
 * A automação, numa linha.
 *
 * Era um bloco com parágrafo explicativo e uma linha de ranking por robô. O
 * fato que importa no Dashboard é um só — quanto do mês não veio de gente —, e
 * ele cabe numa faixa. Quem precisa do robô a robô tem o Painel Líder.
 *
 * As vendas dos robôs **somam** no total do setor: foram confirmadas,
 * assinadas e entraram no caixa. O que elas não fazem é disputar o pódio.
 */
export function FaixaDaAutomacao({
  robos, valor, fracao,
}: { robos: number; valor: number; fracao: number | null }) {
  if (robos === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-xl border border-border/70 bg-muted/20 px-3.5 py-2.5">
      <Bot className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="text-[12px] font-medium">
        {robos === 1 ? '1 automação' : `${robos} automações`}
      </span>
      <span className="text-[12px] tabular-nums font-mono font-semibold">{formatBRL(valor)}</span>
      {fracao !== null && (
        <span className="text-[11px] text-muted-foreground">
          {Math.round(fracao * 100)}% do faturamento do mês
        </span>
      )}
      <span className="ml-auto text-[11px] text-muted-foreground">
        soma no total do setor · fora do pódio por cabeça
      </span>
    </div>
  );
}
