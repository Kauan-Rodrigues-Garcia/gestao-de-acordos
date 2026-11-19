/**
 * A aba «Equipes» da gaveta do Desafio Cobrança (19/11/2026): o líder vê a
 * meta individual de cada operador do setor, separada por equipe, com uma
 * barrinha até as 5 médias e a marca das 4,5.
 *
 * Quem vê e qual setor: `useAlcanceNoDesafio` (painel de permissões, aba
 * Analítico). A conta: `buscarSetorNoDesafio`, a mesma da gaveta do operador.
 */
import { useEffect, useState } from 'react';
import { Check, Clock, Users, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useSetorNoDesafio, useSetoresDoDesafio, type AlcanceNoDesafio } from '@/hooks/useEquipeNoDesafio';
import type { PlacarCobranca } from '@/services/desafioCobranca/desafioCobranca.service';
import type { EquipeNoDesafio, PessoaNoDesafio } from '@/services/desafioCobranca/equipeNoDesafio';
import { brl, diaDoDesafio, hojeEmSaoPaulo, medias } from '@/services/desafioCobranca/regras';

type Filtro = 'todos' | 'bateram' | 'nao';

const FILTROS: { id: Filtro; rotulo: string }[] = [
  { id: 'todos', rotulo: 'Todos' },
  { id: 'bateram', rotulo: 'Bateram' },
  { id: 'nao', rotulo: 'Não bateram' },
];

const curto = (premio: string) => premio.replace(/^sai /, '');

export function EquipesNoDesafio({ placar, hoje, aberta, alcance }: {
  placar: PlacarCobranca;
  hoje: number;
  aberta: boolean;
  alcance: Exclude<AlcanceNoDesafio, 'nenhum'>;
}) {
  const { perfil } = useAuth();
  const todos = alcance === 'todos_setores';
  const setores = useSetoresDoDesafio(aberta && todos);
  const [setorId, setSetorId] = useState<string | null>(perfil?.setor_id ?? null);
  const [filtro, setFiltro] = useState<Filtro>('todos');

  // Quem vê todos e não tem setor (ou o dele sumiu da lista): o 1º da lista.
  useEffect(() => {
    if (!todos || !setores.data?.length) return;
    if (!setorId || !setores.data.some(s => s.id === setorId)) setSetorId(setores.data[0].id);
  }, [todos, setores.data, setorId]);

  const alvo = todos ? setorId : (perfil?.setor_id ?? null);
  const setor = useSetorNoDesafio(placar, hoje, alvo, aberta);
  const acabou = diaDoDesafio(placar.dias, hojeEmSaoPaulo()).fase === 'depois';
  const n1 = placar.regra_medias;
  const n2 = placar.regra_medias_maior;

  const passa = (p: PessoaNoDesafio) => filtro === 'todos' || (filtro === 'bateram') === p.meta.bateu;
  const equipes = (setor.data?.equipes ?? [])
    .map(e => ({ ...e, visiveis: e.pessoas.filter(passa) }))
    .filter(e => e.visiveis.length > 0);

  return (
    <div className="dc-conteudo">
      <section className="dc-cartao dc-sobe" style={{ ['--d' as string]: 0 }} aria-label="Resumo do setor">
        <div className="dc-hoje-linha">
          <p className="dc-rotulo"><Users size={14} aria-hidden /> Meta individual · {acabou ? 'resultado final' : 'até agora'}</p>
          {todos && (
            <select
              className="dc-eq-setor" aria-label="Setor"
              value={setorId ?? ''} onChange={(e) => setSetorId(e.target.value || null)}
            >
              {(setores.data ?? []).map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </select>
          )}
        </div>
        {setor.data ? (
          <>
            <p className="dc-eq-total">
              <strong>{setor.data.bateram}</strong> de {setor.data.total} {setor.data.bateram === 1 ? 'bateu' : 'bateram'}
            </p>
            <ul className="dc-eq-resumo">
              <li className="maior"><Check size={13} strokeWidth={3} aria-hidden /> {setor.data.bateramMaior} com {medias(n2)} · {curto(placar.regra_premio_maior)}</li>
              <li><Clock size={13} aria-hidden /> {setor.data.bateram - setor.data.bateramMaior} com {medias(n1)} · {curto(placar.regra_premio)}</li>
            </ul>
          </>
        ) : null}
        <div className="dc-abas mt-3" role="tablist" aria-label="Filtrar">
          {FILTROS.map(f => (
            <button key={f.id} type="button" role="tab" aria-selected={filtro === f.id} className="dc-aba" onClick={() => setFiltro(f.id)}>
              {f.rotulo}
            </button>
          ))}
        </div>
      </section>

      {!alvo && !todos ? (
        <p className="dc-eq-vazio">Seu cadastro não tem setor, então não há operadores para mostrar.</p>
      ) : setor.isError ? (
        <p className="dc-eq-vazio">Não deu para carregar os operadores agora.</p>
      ) : !setor.data ? (
        <p className="dc-eq-vazio">Carregando os operadores…</p>
      ) : equipes.length === 0 ? (
        <p className="dc-eq-vazio">
          {setor.data.total === 0 ? 'Ninguém deste setor tem meta cadastrada no mês.' : filtro === 'bateram' ? 'Ninguém bateu ainda.' : 'Todo mundo bateu!'}
        </p>
      ) : (
        equipes.map((e, i) => <CartaoEquipe key={e.id ?? 'sem'} equipe={e} visiveis={e.visiveis} placar={placar} acabou={acabou} indice={i} />)
      )}

      {setor.data && setor.data.semMeta > 0 && (
        <p className="dc-eq-nota">
          {setor.data.semMeta} {setor.data.semMeta === 1 ? 'pessoa do setor não tem' : 'pessoas do setor não têm'} meta cadastrada no mês, então a regra não vale para {setor.data.semMeta === 1 ? 'ela' : 'elas'}.
        </p>
      )}
      <p className="dc-eq-nota">
        A média de cada um é a meta do mês dele ÷ os dias úteis dele no mês. O feito é o recebimento dele no relatório nos dias do desafio.
      </p>
    </div>
  );
}

function CartaoEquipe({ equipe, visiveis, placar, acabou, indice }: {
  equipe: EquipeNoDesafio;
  visiveis: PessoaNoDesafio[];
  placar: PlacarCobranca;
  acabou: boolean;
  indice: number;
}) {
  return (
    <section className="dc-cartao dc-sobe" style={{ ['--d' as string]: Math.min(indice + 1, 6) }} aria-label={`Equipe ${equipe.nome}`}>
      <div className="dc-hoje-linha">
        <h3 className="dc-eq-nome">{equipe.nome}</h3>
        <span className="dc-eq-contagem"><strong>{equipe.bateram}</strong>/{equipe.pessoas.length} bateram</span>
      </div>
      <ul className="dc-eq-lista">
        {visiveis.map(p => <LinhaOperador key={p.id} pessoa={p} placar={placar} acabou={acabou} />)}
      </ul>
    </section>
  );
}

function LinhaOperador({ pessoa, placar, acabou }: { pessoa: PessoaNoDesafio; placar: PlacarCobranca; acabou: boolean }) {
  const { meta } = pessoa;
  const n1 = placar.regra_medias;
  const n2 = placar.regra_medias_maior;
  const alto = meta.maior;
  const p = alto.meta ? Math.min((meta.feito / alto.meta) * 100, 100) : 0;
  const nivel = alto.bateu ? 'maior' : meta.bateu ? 'menor' : 'nao';
  const selo = nivel === 'maior' ? curto(placar.regra_premio_maior)
    : nivel === 'menor' ? curto(placar.regra_premio)
      : acabou ? 'não bateu' : `faltam ${brl(meta.falta ?? 0)}`;
  const Icone = nivel === 'nao' ? (acabou ? X : Clock) : Check;

  return (
    <li className={cn('dc-eq-linha', nivel)}>
      <div className="dc-eq-topo">
        <span className="dc-eq-pessoa">{pessoa.nome}</span>
        <span className={cn('dc-eq-selo', nivel)}>
          <Icone size={12} strokeWidth={3} aria-hidden /> {selo}
        </span>
      </div>
      <div
        className="dc-eq-regua" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.floor(p)}
        aria-label={`${pessoa.nome}: ${medias(meta.medias)} de ${medias(n2)}`}
      >
        <div className="dc-eq-cheia" style={{ width: `${p}%` }} />
        <span className="dc-eq-marca" style={{ left: `${(n1 / n2) * 100}%` }} aria-hidden />
      </div>
      <p className="dc-eq-numeros">
        <span><strong>{medias(meta.medias)}</strong> · {brl(meta.feito)}</span>
        <span>{medias(n1)} = {brl(meta.meta ?? 0)} · {medias(n2)} = {brl(alto.meta ?? 0)}</span>
      </p>
    </li>
  );
}
