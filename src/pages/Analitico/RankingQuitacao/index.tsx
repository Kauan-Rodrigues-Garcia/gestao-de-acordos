/**
 * AbaRankingQuitacao — o top 10 de quitação do mês (pedido de 06/10/2026).
 *
 * Prêmio só até o 6º. Do 7º ao 10º, no lugar do prêmio, quanto falta para
 * passar quem está logo acima; quem está abaixo do 10º vê o mesmo, só para si,
 * no rodapé. Do 1º ao 6º não há «falta»: já estão na premiação.
 *
 * Ao lado do Colchão, só nos setores habilitados em Configurações → Geral.
 * Ordem por VALOR quitado (soma do Valor Acordo dos acordos quitados no mês),
 * desempate pela quantidade. A conta é do banco (`fn_ranking_quitacao`); o
 * número vem do relatório mensal de parcelas pagas, importado aqui mesmo.
 *
 * O desenho: a altura de cada degrau do pódio, e a barra do 4º ao 6º, é
 * proporcional ao valor quitado — o pódio mostra a distância de verdade entre
 * as pessoas, que é o critério do ranking. A cor de medalha fica só no anel
 * da foto dos três primeiros; o resto segue os tokens do app.
 */
import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Loader2, Trophy, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatBRL } from '@/lib/money';
import { corTexto } from '@/lib/temas';
import { cn } from '@/lib/utils';
import { AvatarParticipante } from '@/pages/Analitico/Desafios/AvatarParticipante';
import { buscarRanking, type PosicaoRanking, type RankingQuitacao } from '@/services/rankingQuitacao/rankingQuitacao.service';
import { ImportarRankingModal } from './ImportarRankingModal';
import { nomeDoMes, primeiroDia } from './mes';
import { POSICOES_COM_PREMIO, faltaParaPassar } from './regras';
import './ranking.css';

interface Props {
  empresaId: string;
  /** Mês da lente do Analítico (`AAAA-MM`). */
  mes: string;
  /** O setor mostrado; `null` quando não há setor habilitado para esta pessoa. */
  setorId: string | null;
  setorNome: string;
  podeImportar: boolean;
  /** Quem está olhando: a linha dele ganha destaque. */
  operadorId: string;
  /** A importação foi de outro mês: a lente vai para ele. */
  onMudarMes: (mes: string) => void;
}

/**
 * Ouro, prata e bronze — no anel da foto, no número e no tom do degrau. Entram
 * sempre misturados ao fundo do tema (`ranking.css`); como texto, por
 * `corTexto`, que acerta o contraste no tema claro e no escuro.
 */
const MEDALHA = ['#C9A227', '#A3ADB8', '#B4743F'] as const;

const quitacoesTexto = (n: number) => `${n} ${n === 1 ? 'quitação' : 'quitações'}`;

export function AbaRankingQuitacao({ empresaId, mes, setorId, setorNome, podeImportar, operadorId, onMudarMes }: Props) {
  const [ranking, setRanking] = useState<RankingQuitacao | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [importando, setImportando] = useState(false);
  const [versao, setVersao] = useState(0);
  const mesDoRanking = primeiroDia(mes);

  useEffect(() => {
    if (!setorId) { setRanking(null); setCarregando(false); return; }
    let cancelado = false;
    setCarregando(true);
    setErro(null);
    buscarRanking(empresaId, setorId, mesDoRanking)
      .then(r => { if (!cancelado) setRanking(r); })
      .catch(e => { if (!cancelado) setErro(e instanceof Error ? e.message : 'Não foi possível carregar o ranking.'); })
      .finally(() => { if (!cancelado) setCarregando(false); });
    return () => { cancelado = true; };
  }, [empresaId, setorId, mesDoRanking, versao]);

  const aoImportar = useCallback((mesImportado: string) => {
    setImportando(false);
    if (mesImportado.slice(0, 7) !== mes.slice(0, 7)) onMudarMes(mesImportado.slice(0, 7));
    setVersao(v => v + 1);
  }, [mes, onMudarMes]);

  const posicoes = ranking?.posicoes ?? [];
  const premios = ranking?.premios ?? [];
  const maior = posicoes[0]?.valor ?? 0;
  // Pódio (1º–3º), o resto da premiação (4º–6º) e quem corre atrás (7º–10º).
  const premiados = posicoes.slice(3, POSICOES_COM_PREMIO);
  const perseguindo = posicoes.slice(POSICOES_COM_PREMIO, 10);
  const atualizado = ranking?.importado_em
    ? new Date(ranking.importado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <section className="space-y-6" aria-labelledby="ranking-quitacao-titulo">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium capitalize text-muted-foreground">
            {nomeDoMes(mesDoRanking)}{setorNome ? ` · ${setorNome}` : ''}
          </p>
          <h2 id="ranking-quitacao-titulo" className="text-xl font-semibold tracking-tight text-foreground">
            Ranking de quitação
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Pelo valor dos acordos quitados no mês
            {atualizado && <> · relatório importado em {atualizado}</>}
          </p>
        </div>
        {podeImportar && (
          <Button variant="outline" size="sm" className="gap-2" onClick={() => setImportando(true)}>
            <Upload className="h-4 w-4" /> Importar relatório
          </Button>
        )}
      </header>

      {!setorId ? (
        <Vazio texto="Nenhum setor seu tem o Ranking de quitação. Quem configura liga o setor em Configurações → Geral." />
      ) : carregando ? (
        <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : erro ? (
        <Vazio texto={erro} />
      ) : !ranking?.habilitado ? (
        <Vazio texto={`O ${setorNome || 'setor'} não tem o Ranking de quitação. Ele é ligado em Configurações → Geral.`} />
      ) : posicoes.length === 0 ? (
        <Vazio
          texto={ranking.importado_em
            ? `Ninguém do ${setorNome || 'setor'} quitou acordo em ${nomeDoMes(mesDoRanking)}.`
            : `O relatório de ${nomeDoMes(mesDoRanking)} ainda não foi importado.`}
          acao={podeImportar && !ranking.importado_em ? () => setImportando(true) : undefined}
        />
      ) : (
        <>
          <Podio posicoes={posicoes.slice(0, 3)} premios={premios} maior={maior} />
          {premiados.length > 0 && (
            <ol className="rq-lista overflow-hidden">
              {premiados.map(p => (
                <LinhaRanking key={p.operador_id} p={p} maior={maior} eu={p.operador_id === operadorId}
                  premio={premios[p.posicao - 1]} />
              ))}
            </ol>
          )}
          {perseguindo.length > 0 && (
            <div className="space-y-2">
              <p className="px-1 text-xs text-muted-foreground">
                Prêmio até o {POSICOES_COM_PREMIO}º lugar. Daqui para baixo, quanto falta para passar quem está acima.
              </p>
              <ol className="rq-lista overflow-hidden">
                {perseguindo.map(p => {
                  const acima = posicoes[p.posicao - 2];
                  return (
                    <LinhaRanking key={p.operador_id} p={p} maior={maior} eu={p.operador_id === operadorId}
                      falta={acima ? { valor: faltaParaPassar(acima.valor, p.valor), posicao: acima.posicao } : undefined} />
                  );
                })}
              </ol>
            </div>
          )}
          {ranking.eu && ranking.eu.posicao > posicoes.length && (
            <p className="rq-lista px-4 py-3 text-sm text-muted-foreground">
              Você está em <span className="font-semibold text-foreground">{ranking.eu.posicao}º</span> de {ranking.participantes},
              com {formatBRL(ranking.eu.valor)} em {quitacoesTexto(ranking.eu.quitacoes)}.
              {ranking.eu.acima && (
                <> Faltam <span className="font-semibold text-foreground">{formatBRL(faltaParaPassar(ranking.eu.acima.valor, ranking.eu.valor))}</span> para
                  passar {ranking.eu.acima.nome ? `${ranking.eu.acima.nome} (${ranking.eu.acima.posicao}º)` : `o ${ranking.eu.acima.posicao}º`}.</>
              )}
            </p>
          )}
        </>
      )}

      <ImportarRankingModal
        aberto={importando}
        empresaId={empresaId}
        onFechar={() => setImportando(false)}
        onImportado={aoImportar}
      />
    </section>
  );
}

function Vazio({ texto, acao }: { texto: string; acao?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border px-6 py-14 text-center">
      <Trophy className="h-6 w-6 text-muted-foreground/60" />
      <p className="max-w-sm text-sm text-muted-foreground">{texto}</p>
      {acao && <Button size="sm" className="gap-2" onClick={acao}><Upload className="h-4 w-4" /> Importar relatório</Button>}
    </div>
  );
}

/**
 * Do 1º ao 3º, na ordem do pódio: 2º, 1º, 3º, num palco (`ranking.css`). A
 * altura do degrau acompanha o valor, e os degraus encostam no chão do palco.
 */
function Podio({ posicoes, premios, maior }: { posicoes: PosicaoRanking[]; premios: number[]; maior: number }) {
  const reduzir = useReducedMotion();
  return (
    <div className="rq-palco px-3 pt-8 sm:px-8 sm:pt-10">
    <div className="mx-auto grid max-w-3xl grid-cols-3 items-end gap-2 sm:gap-5" role="list" aria-label="Pódio">
      {[1, 0, 2].map((i, coluna) => {
        const p = posicoes[i];
        if (!p) return <div key={`vazio-${coluna}`} />;
        const primeiro = p.posicao === 1;
        // Degrau: 108 px de base (o número e o selo do prêmio cabem nela), mais
        // até 60 px pela fração do valor do 1º.
        const altura = 108 + Math.round(60 * (maior > 0 ? p.valor / maior : 0));
        const cor = MEDALHA[p.posicao - 1];
        const medalha = { '--medalha': cor } as CSSProperties;
        return (
          <div key={p.operador_id} role="listitem" className="flex min-w-0 flex-col items-center" style={medalha}
            aria-label={`${p.posicao}º lugar: ${p.nome}, ${formatBRL(p.valor)} em ${quitacoesTexto(p.quitacoes)}`}>
            <div className="relative isolate">
              {primeiro && <span className="rq-brilho" aria-hidden />}
              <div className="rq-anel rounded-full p-[3px]">
                <AvatarParticipante
                  nome={p.nome}
                  fotoUrl={p.foto_url}
                  className={cn('border-2 border-card', primeiro ? 'h-20 w-20 sm:h-24 sm:w-24' : 'h-14 w-14 sm:h-16 sm:w-16')}
                />
              </div>
            </div>
            <p className={cn('mt-2 w-full truncate text-center font-medium text-foreground', primeiro ? 'text-sm sm:text-base' : 'text-xs sm:text-sm')}>
              {p.nome}
            </p>
            <p className={cn('font-semibold tabular-nums tracking-tight text-foreground', primeiro ? 'text-lg sm:text-2xl' : 'text-sm sm:text-lg')}>
              {formatBRL(p.valor)}
            </p>
            <p className="text-[11px] text-muted-foreground sm:text-xs">{quitacoesTexto(p.quitacoes)}</p>
            <motion.div
              className="rq-degrau mt-4 flex w-full flex-col items-center justify-start gap-1.5 rounded-t-2xl pt-3"
              initial={reduzir ? false : { height: 0, opacity: 0 }}
              animate={{ height: altura, opacity: 1 }}
              transition={{ duration: 0.7, delay: reduzir ? 0 : 0.12 * (3 - p.posicao), ease: [0.22, 1, 0.36, 1] }}
              style={reduzir ? { height: altura } : undefined}
            >
              <span className="text-2xl font-bold tabular-nums" style={{ color: corTexto(cor) }}>{p.posicao}º</span>
              {premios[p.posicao - 1] != null && <Premio valor={premios[p.posicao - 1]} grande={primeiro} className="mt-1" />}
            </motion.div>
          </div>
        );
      })}
    </div>
    </div>
  );
}

/**
 * Uma linha do 4º ao 10º. Na coluna da direita, sempre da mesma largura: o
 * prêmio (até o 6º) ou quanto falta para passar quem está acima (7º ao 10º).
 */
function LinhaRanking({ p, maior, eu, premio, falta }: {
  p: PosicaoRanking;
  maior: number;
  eu: boolean;
  premio?: number;
  falta?: { valor: number; posicao: number };
}) {
  return (
    // Na lista o selo usa o destaque do tema: a cor de medalha é só do pódio.
    <li className={cn('flex items-center gap-3 px-4 py-3', eu && 'rq-eu')} style={{ '--medalha': 'var(--primary)' } as CSSProperties}>
      <span className="w-6 shrink-0 text-center text-sm font-semibold tabular-nums text-muted-foreground">{p.posicao}º</span>
      <AvatarParticipante nome={p.nome} fotoUrl={p.foto_url} className="h-10 w-10 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <p className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-foreground">
            <span className="truncate">{p.nome}</span>
            {eu && <span className="shrink-0 rounded-full bg-primary/15 px-1.5 py-px text-[10px] font-semibold text-primary">você</span>}
          </p>
          <p className="shrink-0 text-sm font-semibold tabular-nums text-foreground">{formatBRL(p.valor)}</p>
        </div>
        <div className="mt-1.5 flex items-center gap-3">
          {/* A mesma régua do pódio: a fração do valor do 1º. */}
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
            <div className="rq-barra h-full rounded-full" style={{ width: `${maior > 0 ? Math.max(2, (p.valor / maior) * 100) : 0}%` }} />
          </div>
          <span className="shrink-0 text-[11px] text-muted-foreground">{quitacoesTexto(p.quitacoes)}</span>
        </div>
      </div>
      {premio != null && <Premio valor={premio} className="shrink-0" />}
      {falta && <Falta valor={falta.valor} posicao={falta.posicao} />}
    </li>
  );
}

/** Do 7º ao 10º, no lugar do prêmio: quanto falta para passar quem está acima. */
function Falta({ valor, posicao }: { valor: number; posicao: number }) {
  return (
    <span className="rq-premio rq-falta shrink-0" aria-label={`Faltam ${formatBRL(valor)} para passar o ${posicao}º`}>
      <span className="rq-premio-rotulo">Falta p/ {posicao}º</span>
      <span className="rq-premio-valor text-sm">{formatBRL(valor)}</span>
    </span>
  );
}

/** Prêmio redondo sem centavos: «R$ 350» lê mais rápido que «R$ 350,00». */
const reais = (v: number) =>
  Number.isInteger(v)
    ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
    : formatBRL(v);

/** O selo do prêmio (`ranking.css`). A cor vem de `--medalha`, posta por quem o contém. */
function Premio({ valor, grande = false, className }: { valor: number; grande?: boolean; className?: string }) {
  return (
    <span className={cn('rq-premio', className)} aria-label={`Prêmio de ${reais(valor)}`}>
      <span className="rq-premio-rotulo">Prêmio</span>
      <span className={cn('rq-premio-valor', grande ? 'text-lg sm:text-xl' : 'text-sm sm:text-base')}>{reais(valor)}</span>
    </span>
  );
}
