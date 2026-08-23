/**
 * AbaDesafios — a aba de gincanas dentro do Analítico.
 *
 * ## O que este arquivo faz, e o que ele NÃO faz
 *
 * Ele monta a tela. Não busca (isso é `useDesafios`), não calcula (isso é
 * `calcularDesafio`) e não sabe qual campanha está no ar — recebe a lista e
 * desenha a ativa.
 *
 * Nenhuma linha aqui menciona "Café no IBIS", nenhuma data está escrita no
 * código e nenhuma meta é constante. Trocar a campanha é um UPDATE na tabela
 * `desafios`, ou dois cliques na janela de configuração.
 *
 * ## A ordem da página
 *
 * Hero → indicadores → sua corrida → pódio → ranking → equipes → histórico.
 *
 * Para quem lidera, «equipes» sobe para logo depois dos indicadores: o gerente
 * abre a tela para ver como as equipes estão, e o operador para ver onde ele
 * está. São os MESMOS componentes reordenados — não uma segunda página, e não
 * uma segunda regra de permissão.
 */
import { useMemo, useState } from 'react';
import { Plus, Settings2, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useDesafios, useResultadoDesafio } from '@/hooks/useDesafios';
import { estiloDoTema } from './tema';
import type { Desafio } from '@/services/desafios/types';
import { DesafioHero } from './DesafioHero';
import { IndicadoresDesafio } from './IndicadoresDesafio';
import { MeuDesafio } from './MeuDesafio';
import { MetaConquistada } from './MetaConquistada';
import { PodioDesafio } from './PodioDesafio';
import { RankingDesafio } from './RankingDesafio';
import { RankingEquipes } from './RankingEquipes';
import { HistoricoDesafios } from './HistoricoDesafios';
import { ConfigurarDesafio } from './ConfigurarDesafio';

export interface AbaDesafiosProps {
  empresaId: string;
  operadorId: string;
  operadorNome: string;
  /**
   * Setor escolhido na régua do Analítico, para quem tem `todos_setores`.
   * `null` = a campanha inteira, como configurada.
   */
  filtroSetorId?: string | null;
  /** Perfil de liderança: as equipes vêm antes da corrida pessoal. */
  priorizarEquipes?: boolean;
  /** `desafios_configurar` — decide o botão. Quem decide a gravação é a RLS. */
  podeConfigurar?: boolean;
}

function EsqueletoDesafio() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-40 w-full rounded-xl" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}
      </div>
      <Skeleton className="h-28 w-full rounded-xl" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[0, 1, 2].map(i => <Skeleton key={i} className="h-44 rounded-xl" />)}
      </div>
      {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
    </div>
  );
}

export function AbaDesafios({
  empresaId, operadorId, operadorNome, filtroSetorId = null,
  priorizarEquipes = false, podeConfigurar = false,
}: AbaDesafiosProps) {
  const { ativo, encerrados, rascunhos, carregando, dbAtiva, erro, recarregar } = useDesafios(true);
  const [editando, setEditando] = useState<Desafio | null>(null);
  const [criando, setCriando]   = useState(false);

  const { resultado, carregando: calculando } = useResultadoDesafio(ativo, filtroSetorId);

  const tema = useMemo(
    () => estiloDoTema(ativo?.visual.tema ?? 'padrao'),
    [ativo?.visual.tema],
  );

  const eu = useMemo(
    () => resultado?.individual.find(i => i.pessoa.id === operadorId) ?? null,
    [resultado, operadorId],
  );

  const top3  = resultado?.individual.slice(0, 3) ?? [];
  const resto = resultado?.individual.slice(3)   ?? [];

  const botaoConfigurar = podeConfigurar && (
    <div className="flex flex-wrap items-center gap-2">
      {ativo && (
        <Button variant="outline" size="sm" className="gap-1.5"
          onClick={() => setEditando(ativo)}>
          <Settings2 className="h-3.5 w-3.5" /> Configurar
        </Button>
      )}
      <Button size="sm" className="gap-1.5" onClick={() => setCriando(true)}>
        <Plus className="h-3.5 w-3.5" /> Novo desafio
      </Button>
    </div>
  );

  // ── Migration pendente ────────────────────────────────────────────────────
  if (!dbAtiva) {
    return (
      <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        O módulo de Desafios ainda não foi aplicado no banco desta empresa.
      </div>
    );
  }

  if (erro) {
    return (
      <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-6 text-center text-sm text-destructive">
        Não foi possível carregar os desafios: {erro}
      </div>
    );
  }

  if (carregando) return <EsqueletoDesafio />;

  // ── Sem campanha ativa ────────────────────────────────────────────────────
  if (!ativo) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div />
          {botaoConfigurar}
        </div>

        <div className="rounded-xl border border-dashed border-border p-10 text-center">
          <Trophy className="mx-auto h-8 w-8 text-muted-foreground/60" />
          <p className="mt-3 text-sm font-medium text-foreground">
            Nenhum desafio ativo no momento.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {podeConfigurar
              ? 'Crie uma campanha ou ative um rascunho para começar a disputa.'
              : 'Quando uma campanha começar, ela aparece aqui.'}
          </p>
          {podeConfigurar && rascunhos.length > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              {rascunhos.length} rascunho{rascunhos.length === 1 ? '' : 's'} aguardando ativação.
            </p>
          )}
        </div>

        <HistoricoDesafios encerrados={encerrados} voceId={operadorId} />

        <ConfigurarDesafio
          aberto={criando || !!editando}
          desafio={editando}
          empresaId={empresaId}
          autorId={operadorId}
          autorNome={operadorNome}
          onFechar={() => { setCriando(false); setEditando(null); }}
          onSalvo={() => { void recarregar(); }}
        />
      </div>
    );
  }

  const semParticipantes = !!resultado && resultado.totalParticipantes === 0;

  const secaoEquipes = ativo.regra.modo.includes('equipe') && resultado
    && resultado.equipes.length > 0 && (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-foreground">Disputa entre equipes</h3>
      <RankingEquipes
        equipes={resultado.equipes}
        tema={tema}
        mostrarFotos={ativo.visual.mostrarFotos}
        animar={ativo.visual.animarUltrapassagem}
        voceId={operadorId}
      />
    </section>
  );

  const secaoPessoal = eu && ativo.regra.modo.includes('individual') && resultado && (
    <MeuDesafio
      item={eu}
      tema={tema}
      mostrarFotos={ativo.visual.mostrarFotos}
      totalParticipantes={resultado.totalParticipantes}
    />
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-end gap-2">{botaoConfigurar}</div>

      <DesafioHero
        desafio={ativo}
        totalRecebido={resultado?.totalRecebido ?? 0}
        totalParticipantes={resultado?.totalParticipantes ?? 0}
        totalEquipes={resultado?.totalEquipes ?? 0}
        progressoColetivo={resultado?.progressoColetivo ?? 0}
        carregando={calculando}
      />

      {calculando && !resultado && <EsqueletoDesafio />}

      {resultado && semParticipantes && (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Nenhum participante neste recorte.
          {filtroSetorId && ' Tente limpar o filtro de setor.'}
        </div>
      )}

      {resultado && !semParticipantes && (
        <>
          <IndicadoresDesafio resultado={resultado} tema={tema} carregando={calculando} />

          {priorizarEquipes && secaoEquipes}
          {!priorizarEquipes && secaoPessoal}

          {ativo.regra.modo.includes('individual') && (
            <>
              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground">Top 3</h3>
                <PodioDesafio
                  top3={top3}
                  tema={tema}
                  mostrarFotos={ativo.visual.mostrarFotos}
                  animar={ativo.visual.animarUltrapassagem}
                  voceId={operadorId}
                />
              </section>

              {resto.length > 0 && (
                <section className="space-y-2">
                  <h3 className="text-sm font-semibold text-foreground">Ranking completo</h3>
                  <RankingDesafio
                    lista={resto}
                    tema={tema}
                    mostrarFotos={ativo.visual.mostrarFotos}
                    animar={ativo.visual.animarUltrapassagem}
                    voceId={operadorId}
                  />
                </section>
              )}
            </>
          )}

          {priorizarEquipes && secaoPessoal}
          {!priorizarEquipes && secaoEquipes}
        </>
      )}

      <HistoricoDesafios encerrados={encerrados} voceId={operadorId} />

      <MetaConquistada
        nome={eu?.pessoa.nome ?? null}
        valor={eu?.recebido ?? 0}
        bateu={!!eu?.bateuMeta}
        campanha={ativo.nome}
        premio={ativo.premio}
        tema={tema}
        chave={`${ativo.id}::${operadorId}`}
        habilitado={ativo.visual.comemorarMeta}
      />

      <ConfigurarDesafio
        aberto={criando || !!editando}
        desafio={editando}
        empresaId={empresaId}
        autorId={operadorId}
        autorNome={operadorNome}
        onFechar={() => { setCriando(false); setEditando(null); }}
        onSalvo={() => { void recarregar(); }}
      />
    </div>
  );
}

export default AbaDesafios;
