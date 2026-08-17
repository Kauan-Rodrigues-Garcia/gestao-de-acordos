/**
 * HallDescobridores — quem achou o segredo, na ordem em que achou.
 * ─────────────────────────────────────────────────────────────────────────────
 * O primeiro nome é o destaque do painel, e continua sendo para sempre: é o
 * único lugar desta página em que a ordem de chegada importa, e chegar antes
 * de todo mundo em algo que ninguém contou que existia merece o tamanho maior.
 *
 * Três coisas ficam FORA da lista, e todas por decisão do servidor
 * (`fn_creators_lab_selar_descoberta`, migration 20260816220000):
 *
 *   • contas administrativas — existem para operar o sistema, não para usá-lo;
 *   • quem já havia acessado o Lab antes daquela migration — eram os testes do
 *     próprio desenvolvimento, e começariam ocupando justamente o primeiro
 *     lugar que se quer dar a quem descobrir de verdade;
 *   • gente de outra empresa — o sistema é multi-tenant, e misturar BookPlay
 *     com PaguePlay num painel seria vazamento, não brincadeira.
 *
 * A regra do primeiro item está escrita na tela, embaixo da lista. Painel de
 * honra com critério secreto é o tipo de coisa que gera conversa de corredor.
 */
import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';

import {
  buscarDescobridores, buscarRankingFliperama,
  type Descobridor,
} from '@/services/creatorsLab.service';

import { SecaoLab } from '../components/SecaoLab';
import { useCreators } from '../theme/CreatorsProvider';

/** Iniciais para quem não tem foto. Nunca mais de duas letras. */
function iniciais(nome: string): string {
  return nome.trim().split(/\s+/).slice(0, 2).map(p => p[0] ?? '').join('').toUpperCase() || '?';
}

function dataCurta(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function Retrato({
  pessoa, tamanho, corBorda, corTexto,
}: {
  pessoa: Descobridor; tamanho: number; corBorda: string; corTexto: string;
}) {
  const estilo = {
    width: tamanho, height: tamanho,
    border: `2px solid ${corBorda}`,
    color: corTexto,
    fontSize: tamanho * 0.34,
  };

  if (pessoa.fotoUrl) {
    return (
      <img
        src={pessoa.fotoUrl}
        alt=""
        loading="lazy"
        className="flex-none rounded-full object-cover"
        style={estilo}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="creators-lab__mono flex flex-none items-center justify-center rounded-full"
      style={estilo}
    >
      {iniciais(pessoa.nome)}
    </span>
  );
}

export function HallDescobridores() {
  const { tokens, movimentoReduzido } = useCreators();
  const c = tokens.cores;
  const arcade = tokens.id === 'arcade';

  const [lista, setLista] = useState<Descobridor[] | null>(null);
  const [campeoes, setCampeoes] = useState<Set<string>>(new Set());

  useEffect(() => {
    let vivo = true;
    (async () => {
      const [pessoas, ranking] = await Promise.all([
        buscarDescobridores(),
        buscarRankingFliperama(),
      ]);
      if (!vivo) return;
      setLista(pessoas);
      setCampeoes(new Set((ranking ?? []).filter(l => l.venceu).map(l => l.usuarioId)));
    })();
    return () => { vivo = false; };
  }, []);

  const [primeiro, ...resto] = lista ?? [];

  const nota = useMemo(() => (
    <p className="creators-lab__mono mt-6 text-[.64rem] leading-relaxed" style={{ color: c.textoSuave }}>
      Contas administrativas não entram no painel, e quem já havia acessado esta
      área antes de 16/08/2026 também não — eram os testes de quem construiu o
      lugar. A ordem é a de chegada e não se reescreve.
    </p>
  ), [c.textoSuave]);

  return (
    <SecaoLab
      id="descobridores"
      rotulo={arcade ? 'hall of fame' : 'registro de acesso'}
      titulo={arcade ? 'QUEM ACHOU A MÁQUINA' : 'DESCOBRIDORES'}
      descricao="Ninguém foi avisado de que este lugar existe. Estas pessoas acharam sozinhas."
    >
      {lista === null && (
        <p className="creators-lab__mono text-xs" style={{ color: c.textoSuave }}>
          carregando painel...
        </p>
      )}

      {lista?.length === 0 && (
        <div className="creators-lab__painel p-6 text-center">
          <p className="text-sm" style={{ color: c.texto }}>
            O painel está vazio. O primeiro nome ainda não foi escrito.
          </p>
          {nota}
        </div>
      )}

      {primeiro && (
        <>
          {/* O destaque. Maior, com moldura própria e a marca de primeiro. */}
          <motion.div
            initial={movimentoReduzido ? false : { opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: tokens.duracao, ease: tokens.easing }}
            className="creators-lab__painel creators-lab__painel--marcado relative overflow-hidden p-6"
          >
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 h-1"
              style={{ background: c.primaria }}
            />

            <div className="flex items-center gap-5">
              <Retrato pessoa={primeiro} tamanho={78} corBorda={c.primaria} corTexto={c.primaria} />

              <div className="min-w-0">
                <p className="creators-lab__rotulo" style={{ color: c.primaria }}>
                  {arcade ? 'player one' : 'primeiro acesso'}
                </p>
                <h3 className="mt-1 truncate text-2xl" style={{ color: c.texto }}>
                  {campeoes.has(primeiro.usuarioId) && <span title="Zerou a máquina">👑 </span>}
                  {primeiro.nome}
                </h3>
                <p className="creators-lab__mono mt-1 text-[.7rem]" style={{ color: c.textoSuave }}>
                  descobriu em {dataCurta(primeiro.descobertoEm)}
                </p>
              </div>
            </div>

            <p className="mt-5 text-sm" style={{ color: c.textoSuave }}>
              Chegou antes de todo mundo em algo que ninguém contou que existia.
              Este lugar no painel não muda mais.
            </p>
          </motion.div>

          {resto.length > 0 && (
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {resto.map((p, i) => (
                <motion.li
                  key={p.usuarioId}
                  initial={movimentoReduzido ? false : { opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-40px' }}
                  transition={{ delay: Math.min(i * 0.04, 0.4), duration: tokens.duracao }}
                  className="creators-lab__painel flex items-center gap-3 p-3"
                >
                  <span
                    className="creators-lab__mono w-6 flex-none text-center text-[.72rem]"
                    style={{ color: c.textoSuave }}
                  >
                    {p.posicao}
                  </span>
                  <Retrato pessoa={p} tamanho={34} corBorda={c.borda} corTexto={c.textoSuave} />
                  <span className="min-w-0 flex-1 truncate text-sm" style={{ color: c.texto }}>
                    {campeoes.has(p.usuarioId) && <span title="Zerou a máquina">👑 </span>}
                    {p.nome}
                  </span>
                  <span
                    className="creators-lab__mono flex-none text-[.64rem]"
                    style={{ color: c.textoSuave }}
                  >
                    {dataCurta(p.descobertoEm)}
                  </span>
                </motion.li>
              ))}
            </ul>
          )}

          {nota}
        </>
      )}
    </SecaoLab>
  );
}
