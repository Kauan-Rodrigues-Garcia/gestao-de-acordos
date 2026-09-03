/**
 * CardDesafio — uma campanha no catálogo.
 *
 * ## Por que o card é grande
 *
 * Porque ele é a PORTA, e não um item de lista. Quem abre a aba precisa
 * decidir em qual campanha entrar, e essa decisão se toma pelo prêmio, pelo
 * período e por quantas pessoas disputam — não pelo nome. Um card estreito
 * caberia mais vezes na tela e obrigaria a abrir três para achar a certa.
 *
 * ## A animação
 *
 * `whileHover` sobe o card 4 px, acende a borda e faz a mídia de destaque
 * respirar 4%. É acabamento, não informação: nada aparece no hover que não
 * estivesse lá antes, porque o mesmo card é lido no toque, onde hover não
 * existe.
 *
 * ## O que o card NÃO faz
 *
 * Não busca o ranking. O número de participantes é o do recorte configurado,
 * contado sobre o quadro que a aba já tem; abrir o resultado de dez campanhas
 * para desenhar dez cards seria dez chamadas ao banco para pintar dez rodapés.
 */
import { memo } from 'react';
import { motion } from 'framer-motion';
import { Building2, CalendarDays, Gift, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatBRL } from '@/lib/money';
import { estiloDaCampanha, diaCurto } from './tema';
import { modeloDoTipo } from '@/services/desafios/tiposDesafio';
import type { Desafio, StatusDesafio } from '@/services/desafios/types';

export interface CardDesafioProps {
  desafio: Desafio;
  /** Quantas pessoas o recorte alcança. `null` = ainda não foi contado. */
  participantes: number | null;
  /** Nome das empresas alcançadas, já resolvido. Vazio = campanha de uma só. */
  empresas: string[];
  onAbrir: (desafio: Desafio) => void;
}

const SELO_STATUS: Record<StatusDesafio, { rotulo: string; classe: string }> = {
  ativo: {
    rotulo: 'Em cartaz',
    classe: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
  },
  rascunho: {
    rotulo: 'Rascunho',
    classe: 'bg-muted text-muted-foreground border-border',
  },
  encerrado: {
    rotulo: 'Encerrado',
    classe: 'bg-muted/60 text-muted-foreground border-border',
  },
};

/**
 * O prêmio em uma linha.
 *
 * Com premiação por colocação, mostra a do primeiro e quantas mais existem —
 * cinco linhas de prêmio dentro de um card matariam tudo o mais que ele diz.
 */
function resumoDoPremio(desafio: Desafio): string | null {
  const { premios } = desafio.regra;
  if (premios.length) {
    const primeiro = premios[0];
    const resto = premios.length - 1;
    return resto > 0
      ? `${primeiro.premio} · +${resto} colocaç${resto === 1 ? 'ão' : 'ões'}`
      : primeiro.premio;
  }
  return desafio.premio?.trim() || null;
}

/** A meta em uma linha, quando a campanha tem uma só para todo mundo. */
function resumoDaMeta(desafio: Desafio): string | null {
  const { regra } = desafio;
  if (Object.keys(regra.metasPorOperador).length) return 'Meta por pessoa';
  const valor = regra.metaColetiva ?? regra.metaIndividual;
  if (!valor) return null;
  const rotulo = regra.metaColetiva ? 'Meta coletiva' : 'Meta';
  return regra.metrica === 'quantidade'
    ? `${rotulo}: ${valor} pagamentos`
    : `${rotulo}: ${formatBRL(valor)}`;
}

export const CardDesafio = memo(function CardDesafio({
  desafio, participantes, empresas, onAbrir,
}: CardDesafioProps) {
  const estilo = estiloDaCampanha(desafio.visual);
  const { Icone } = estilo;
  const selo = SELO_STATUS[desafio.status] ?? SELO_STATUS.rascunho;
  const modelo = modeloDoTipo(desafio.tipo);
  const premio = resumoDoPremio(desafio);
  const meta = resumoDaMeta(desafio);
  const comMidia = !!desafio.midiaUrl && desafio.visual.midiaNoCard;

  return (
    <motion.button
      type="button"
      onClick={() => onAbrir(desafio)}
      initial={false}
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.99 }}
      transition={{ type: 'spring', stiffness: 400, damping: 28 }}
      className={cn(
        'group relative flex w-full flex-col overflow-hidden rounded-xl border bg-card text-left',
        'transition-colors duration-200 hover:shadow-lg focus-visible:outline-none',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        estilo.borda,
        // Encerrada fica sóbria: o histórico não compete visualmente com a
        // campanha que está valendo agora.
        desafio.status === 'encerrado' && 'opacity-75 hover:opacity-100',
      )}
    >
      {/* Faixa de destaque — a mídia quando existe, o gradiente do tema quando
          não. Altura fixa para que uma campanha com GIF e uma sem fiquem do
          mesmo tamanho na grade. */}
      <div className={cn(
        'relative h-32 w-full overflow-hidden border-b',
        estilo.borda,
        !comMidia && `bg-gradient-to-br ${estilo.gradiente}`,
      )}>
        {comMidia ? (
          <>
            <motion.img
              src={desafio.midiaUrl ?? ''}
              alt=""
              initial={false}
              whileHover={{ scale: 1.04 }}
              transition={{ type: 'spring', stiffness: 260, damping: 30 }}
              className="h-full w-full object-cover"
              loading="lazy"
            />
            {/* O véu existe para o nome ficar legível sobre qualquer imagem —
                inclusive um GIF claro com movimento. */}
            <div className="absolute inset-0 bg-gradient-to-t from-card via-card/40 to-transparent" />
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Icone className={cn('h-12 w-12 opacity-20', estilo.destaque)} />
          </div>
        )}

        <span className={cn(
          'absolute right-3 top-3 rounded-full border px-2 py-0.5 text-[11px] font-medium',
          selo.classe,
        )}>
          {selo.rotulo}
        </span>

        <div className="absolute bottom-3 left-4 right-4">
          <div className="flex items-center gap-2">
            <Icone className={cn('h-4 w-4 flex-shrink-0', estilo.destaque)} />
            <h3 className="truncate text-base font-semibold text-foreground">
              {desafio.nome}
            </h3>
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        {desafio.descricao && (
          <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            {desafio.descricao}
          </p>
        )}

        {premio && (
          <div className={cn(
            'flex items-start gap-2 rounded-lg border px-3 py-2 text-xs font-medium',
            estilo.selo,
          )}>
            <Gift className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            <span className="line-clamp-2">{premio}</span>
          </div>
        )}

        <dl className="mt-auto grid grid-cols-2 gap-x-3 gap-y-2 text-[11px]">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5 flex-shrink-0" />
            <dd className="truncate">
              {diaCurto(desafio.dataInicio)} — {diaCurto(desafio.dataFim)}
            </dd>
          </div>

          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Users className="h-3.5 w-3.5 flex-shrink-0" />
            <dd className="truncate">
              {participantes === null
                ? modelo.nome
                : `${participantes} ${participantes === 1 ? 'participante' : 'participantes'}`}
            </dd>
          </div>

          {meta && (
            <div className="col-span-2 truncate text-muted-foreground">{meta}</div>
          )}

          {empresas.length > 1 && (
            <div className="col-span-2 flex items-center gap-1.5 text-muted-foreground">
              <Building2 className="h-3.5 w-3.5 flex-shrink-0" />
              <dd className="truncate">{empresas.join(' · ')}</dd>
            </div>
          )}
        </dl>
      </div>

      {/* O traço de acento acende no hover. É a única coisa que o hover
          acrescenta, e ela não carrega informação nenhuma. */}
      <span className={cn(
        'absolute inset-x-0 bottom-0 h-0.5 origin-left scale-x-0 transition-transform duration-300',
        'group-hover:scale-x-100',
        estilo.barra,
      )} />
    </motion.button>
  );
});
