/**
 * CatalogoDesafios — a primeira tela da aba.
 *
 * ## O que mudou em relação à versão 1
 *
 * Antes a aba abria já dentro da campanha ativa, com Hero, pódio e ranking
 * empilhados. Isso funcionava com UMA campanha no ar; com cinco, a pessoa não
 * tinha por onde escolher — o histórico era uma lista de linhas no rodapé.
 *
 * Agora a aba abre no CATÁLOGO: um card por campanha que a pessoa alcança,
 * agrupado por situação. Entrar na campanha é um clique, e sair dela também.
 *
 * ## A ordem dos grupos
 *
 * Em cartaz, rascunhos, encerradas. É a ordem da atenção: o que está valendo
 * agora vem primeiro, o que ainda não foi publicado vem em seguida (e só para
 * quem configura), e o histórico fica por último.
 */
import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Plus, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CardDesafio } from './CardDesafio';
import type { Desafio } from '@/services/desafios/types';

export interface CatalogoDesafiosProps {
  ativos: Desafio[];
  rascunhos: Desafio[];
  encerrados: Desafio[];
  /** desafio.id → quantas pessoas o recorte alcança. Ausente = não contado. */
  participantesPorDesafio: Record<string, number>;
  /** empresa.id → nome, para a campanha que cruza operações. */
  nomeDaEmpresa: Record<string, string>;
  podeCriar: boolean;
  onAbrir: (desafio: Desafio) => void;
  onCriar: () => void;
}

interface GrupoProps {
  titulo: string;
  descricao: string;
  desafios: Desafio[];
  participantesPorDesafio: Record<string, number>;
  nomeDaEmpresa: Record<string, string>;
  onAbrir: (desafio: Desafio) => void;
}

function Grupo({
  titulo, descricao, desafios, participantesPorDesafio, nomeDaEmpresa, onAbrir,
}: GrupoProps) {
  if (!desafios.length) return null;

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-foreground">
          {titulo}
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {desafios.length}
          </span>
        </h2>
        <p className="text-xs text-muted-foreground">{descricao}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {desafios.map((desafio, i) => (
          <motion.div
            key={desafio.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            // O atraso escalonado para de crescer no oitavo card: com vinte
            // campanhas, o último entraria dois segundos depois do primeiro.
            transition={{ duration: 0.25, delay: Math.min(i, 7) * 0.04 }}
          >
            <CardDesafio
              desafio={desafio}
              participantes={participantesPorDesafio[desafio.id] ?? null}
              empresas={
                (desafio.empresas.length ? desafio.empresas : [desafio.empresaId])
                  .map(id => nomeDaEmpresa[id])
                  .filter((n): n is string => !!n)
              }
              onAbrir={onAbrir}
            />
          </motion.div>
        ))}
      </div>
    </section>
  );
}

export function CatalogoDesafios({
  ativos, rascunhos, encerrados, participantesPorDesafio, nomeDaEmpresa,
  podeCriar, onAbrir, onCriar,
}: CatalogoDesafiosProps) {
  const vazio = useMemo(
    () => !ativos.length && !rascunhos.length && !encerrados.length,
    [ativos.length, rascunhos.length, encerrados.length],
  );

  if (vazio) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card/50 py-16 text-center">
        <Trophy className="h-10 w-10 text-muted-foreground/40" />
        <div>
          <p className="text-sm font-medium text-foreground">
            Nenhuma campanha por aqui
          </p>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">
            {podeCriar
              ? 'Monte a primeira gincana: escolha os setores, o período e o prêmio de cada colocação.'
              : 'Quando a liderança publicar uma gincana que alcance você, ela aparece aqui.'}
          </p>
        </div>
        {podeCriar && (
          <Button size="sm" className="mt-1 gap-1.5" onClick={onCriar}>
            <Plus className="h-4 w-4" /> Criar desafio
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <Grupo
        titulo="Em cartaz"
        descricao="As campanhas valendo agora. Clique para abrir o placar."
        desafios={ativos}
        participantesPorDesafio={participantesPorDesafio}
        nomeDaEmpresa={nomeDaEmpresa}
        onAbrir={onAbrir}
      />
      <Grupo
        titulo="Rascunhos"
        descricao="Ainda não publicadas — só quem configura enxerga esta fileira."
        desafios={rascunhos}
        participantesPorDesafio={participantesPorDesafio}
        nomeDaEmpresa={nomeDaEmpresa}
        onAbrir={onAbrir}
      />
      <Grupo
        titulo="Encerradas"
        descricao="O histórico, com o ranking que cada campanha teve no fim."
        desafios={encerrados}
        participantesPorDesafio={participantesPorDesafio}
        nomeDaEmpresa={nomeDaEmpresa}
        onAbrir={onAbrir}
      />
    </div>
  );
}
