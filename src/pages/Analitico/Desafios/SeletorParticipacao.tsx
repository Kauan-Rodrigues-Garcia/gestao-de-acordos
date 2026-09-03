/**
 * SeletorParticipacao — quem disputa a campanha.
 *
 * ## As quatro perguntas, nesta ordem
 *
 * 1. quais SETORES (de quais empresas);
 * 2. quais EQUIPES, dentro dos setores escolhidos;
 * 3. quais CARGOS;
 * 4. quem sai, nominalmente.
 *
 * A ordem não é arbitrária: cada pergunta estreita a seguinte. Escolher setor
 * primeiro é o que faz a lista de equipes ter dez linhas em vez de oitenta, e
 * é por isso que a segunda pergunta nem aparece antes de a primeira ser
 * respondida.
 *
 * ## Por que a lista de exclusão só mostra quem já entrou
 *
 * Porque «remover do desafio» só faz sentido para quem está nele. Oferecer a
 * operação inteira para excluir transformaria um ajuste de duas pessoas numa
 * lista de trezentas, e deixaria no JSON exclusões de gente que nunca disputou.
 *
 * ## Vazio significa TUDO, e a tela diz isso
 *
 * Nenhum setor marcado não é «nenhum setor»: é «sem recorte por setor», e a
 * campanha vale para todo mundo que a enxerga. É a regra que
 * `participaDaCampanha` aplica, e cada bloco a repete em uma linha — porque a
 * leitura contrária é a suposição natural de quem olha uma lista de caixas
 * desmarcadas.
 */
import { useMemo, useState } from 'react';
import { Building2, Search, UserMinus, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { AvatarParticipante } from './AvatarParticipante';
import type {
  ParticipantesDesafio, PessoaDesafio, SetorDisponivel,
} from '@/services/desafios/types';

/** Os cargos que podem disputar. `super_admin` não entra: não é operação. */
const CARGOS_DISPUTAVEIS: { valor: string; rotulo: string }[] = [
  { valor: 'operador',      rotulo: 'Operador'   },
  { valor: 'lider',         rotulo: 'Líder'      },
  { valor: 'elite',         rotulo: 'Elite'      },
  { valor: 'gerencia',      rotulo: 'Gerência'   },
  { valor: 'diretoria',     rotulo: 'Diretoria'  },
  { valor: 'ouvidoria',     rotulo: 'Ouvidoria'  },
  { valor: 'administrador', rotulo: 'Administrador' },
];

export interface SeletorParticipacaoProps {
  setores: SetorDisponivel[];
  pessoas: PessoaDesafio[];
  carregandoPessoas: boolean;
  valor: ParticipantesDesafio;
  onChange: (valor: ParticipantesDesafio) => void;
  /** Sem `desafios_multiempresa`, só os setores da empresa própria aparecem. */
  empresasPermitidas: string[];
  /** Quem só configura o próprio setor não escolhe setor nenhum. */
  travadoNoSetor?: string | null;
}

/** Liga/desliga um id numa lista, devolvendo uma lista nova. */
function alternar(lista: string[], id: string): string[] {
  return lista.includes(id) ? lista.filter(x => x !== id) : [...lista, id];
}

export function SeletorParticipacao({
  setores, pessoas, carregandoPessoas, valor, onChange,
  empresasPermitidas, travadoNoSetor = null,
}: SeletorParticipacaoProps) {
  const [buscaPessoa, setBuscaPessoa] = useState('');

  const setoresVisiveis = useMemo(
    () => setores.filter(s => empresasPermitidas.includes(s.empresaId)),
    [setores, empresasPermitidas],
  );

  /** Setores agrupados por empresa — é o que torna a mistura legível. */
  const porEmpresa = useMemo(() => {
    const mapa = new Map<string, { nome: string; setores: SetorDisponivel[] }>();
    for (const s of setoresVisiveis) {
      const atual = mapa.get(s.empresaId);
      if (atual) atual.setores.push(s);
      else mapa.set(s.empresaId, { nome: s.empresaNome, setores: [s] });
    }
    return [...mapa.entries()];
  }, [setoresVisiveis]);

  /** As equipes oferecidas: só as dos setores marcados. */
  const equipesOferecidas = useMemo(() => {
    const escolhidos = travadoNoSetor ? [travadoNoSetor] : valor.setores;
    if (!escolhidos.length) return [];
    return setoresVisiveis
      .filter(s => escolhidos.includes(s.id))
      .flatMap(s => s.equipes.map(e => ({ ...e, setorNome: s.nome })));
  }, [setoresVisiveis, valor.setores, travadoNoSetor]);

  /**
   * Quem o recorte atual alcança.
   *
   * É a mesma pergunta de `participaDaCampanha`, menos as exclusões: elas são
   * justamente o que esta lista serve para escolher, e aplicá-las aqui faria a
   * pessoa sumir da lista no clique em que foi excluída — sem como voltar.
   */
  const alcancados = useMemo(() => {
    const setoresAlvo = travadoNoSetor ? [travadoNoSetor] : valor.setores;
    return pessoas.filter(p => {
      if (setoresAlvo.length && !p.setores.some(s => setoresAlvo.includes(s))) return false;
      if (valor.equipes.length && !p.equipes.some(e => valor.equipes.includes(e))) return false;
      if (valor.cargos.length && !valor.cargos.includes(p.perfil)) return false;
      return true;
    });
  }, [pessoas, valor.setores, valor.equipes, valor.cargos, travadoNoSetor]);

  const filtrados = useMemo(() => {
    const termo = buscaPessoa.trim().toLowerCase();
    if (!termo) return alcancados;
    return alcancados.filter(p =>
      p.nome.toLowerCase().includes(termo)
      || (p.usuario ?? '').toLowerCase().includes(termo));
  }, [alcancados, buscaPessoa]);

  const dentro = alcancados.filter(p => !valor.excluidos.includes(p.id)).length;

  /**
   * Marca ou desmarca um setor.
   *
   * Desmarcar leva junto as equipes DAQUELE setor: sem isso o JSON guardaria
   * uma equipe que a tela não oferece mais, e a campanha continuaria recortada
   * por ela sem que ninguém conseguisse ver de onde veio o recorte.
   */
  function alternarSetor(setor: SetorDisponivel) {
    const marcando = !valor.setores.includes(setor.id);
    const idsDoSetor = new Set(setor.equipes.map(e => e.id));
    onChange({
      ...valor,
      setores: alternar(valor.setores, setor.id),
      equipes: marcando
        ? valor.equipes
        : valor.equipes.filter(e => !idsDoSetor.has(e)),
    });
  }

  return (
    <div className="space-y-6">
      {/* ── 1. Setores ──────────────────────────────────────────────────── */}
      <section className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <Label className="text-sm font-medium">Setores</Label>
          <span className="text-[11px] text-muted-foreground">
            {valor.setores.length
              ? `${valor.setores.length} marcado${valor.setores.length === 1 ? '' : 's'}`
              : 'nenhum marcado = todos participam'}
          </span>
        </div>

        {travadoNoSetor ? (
          <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            A campanha nasce presa ao seu setor. Para misturar setores é preciso
            a permissão de configurar desafios da empresa.
          </p>
        ) : porEmpresa.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
            Nenhum setor disponível.
          </p>
        ) : (
          <div className="space-y-3">
            {porEmpresa.map(([empresaId, grupo]) => (
              <div key={empresaId} className="rounded-lg border border-border">
                <div className="flex items-center gap-1.5 border-b border-border bg-muted/40 px-3 py-1.5">
                  <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium text-foreground">{grupo.nome}</span>
                </div>
                <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 p-3 sm:grid-cols-2">
                  {grupo.setores.map(s => (
                    <label
                      key={s.id}
                      className="flex cursor-pointer items-center gap-2 text-xs text-foreground"
                    >
                      <Checkbox
                        checked={valor.setores.includes(s.id)}
                        onCheckedChange={() => alternarSetor(s)}
                      />
                      <span className="truncate">{s.nome}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── 2. Equipes ──────────────────────────────────────────────────── */}
      {equipesOferecidas.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <Label className="text-sm font-medium">Equipes</Label>
            <span className="text-[11px] text-muted-foreground">
              {valor.equipes.length
                ? `${valor.equipes.length} marcada${valor.equipes.length === 1 ? '' : 's'}`
                : 'nenhuma marcada = todas as equipes dos setores acima'}
            </span>
          </div>
          <div className="grid max-h-52 grid-cols-1 gap-x-4 gap-y-1.5 overflow-y-auto rounded-lg border border-border p-3 sm:grid-cols-2">
            {equipesOferecidas.map(e => (
              <label
                key={e.id}
                className="flex cursor-pointer items-center gap-2 text-xs text-foreground"
              >
                <Checkbox
                  checked={valor.equipes.includes(e.id)}
                  onCheckedChange={() => onChange({
                    ...valor, equipes: alternar(valor.equipes, e.id),
                  })}
                />
                <span className="truncate">
                  {e.nome}
                  <span className="ml-1 text-muted-foreground">· {e.setorNome}</span>
                </span>
              </label>
            ))}
          </div>
        </section>
      )}

      {/* ── 3. Cargos ───────────────────────────────────────────────────── */}
      <section className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <Label className="text-sm font-medium">Cargos</Label>
          <span className="text-[11px] text-muted-foreground">
            {valor.cargos.length
              ? `${valor.cargos.length} marcado${valor.cargos.length === 1 ? '' : 's'}`
              : 'nenhum marcado = todos os cargos'}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {CARGOS_DISPUTAVEIS.map(c => {
            const ligado = valor.cargos.includes(c.valor);
            return (
              <button
                key={c.valor}
                type="button"
                onClick={() => onChange({ ...valor, cargos: alternar(valor.cargos, c.valor) })}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-xs transition-colors',
                  ligado
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:border-foreground/30',
                )}
              >
                {c.rotulo}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-muted-foreground">
          Marque «Líder» para a disputa entre líderes — junto com «resultado da
          equipe liderada», na aba Regras.
        </p>
      </section>

      {/* ── 4. Quem sai ─────────────────────────────────────────────────── */}
      <section className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <Label className="text-sm font-medium">Participantes</Label>
          <span className="text-[11px] text-muted-foreground">
            {carregandoPessoas
              ? 'carregando…'
              : `${dentro} de ${alcancados.length} no desafio`}
          </span>
        </div>

        {valor.excluidos.length > 0 && (
          <div className="flex flex-wrap gap-1.5 rounded-lg border border-destructive/30 bg-destructive/5 p-2">
            {valor.excluidos.map(id => {
              const p = pessoas.find(x => x.id === id);
              return (
                <Badge
                  key={id}
                  variant="outline"
                  className="gap-1 border-destructive/30 text-xs font-normal"
                >
                  {p?.nome ?? 'Removido'}
                  <button
                    type="button"
                    onClick={() => onChange({
                      ...valor, excluidos: valor.excluidos.filter(x => x !== id),
                    })}
                    className="text-muted-foreground hover:text-foreground"
                    aria-label={`Devolver ${p?.nome ?? 'a pessoa'} ao desafio`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              );
            })}
          </div>
        )}

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={buscaPessoa}
            onChange={e => setBuscaPessoa(e.target.value)}
            placeholder="Buscar quem está no desafio…"
            className="h-8 pl-8 text-xs"
          />
        </div>

        <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
          {carregandoPessoas ? (
            <p className="py-6 text-center text-xs text-muted-foreground">Carregando…</p>
          ) : filtrados.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              O recorte acima não alcança ninguém.
            </p>
          ) : filtrados.map(p => {
            const fora = valor.excluidos.includes(p.id);
            return (
              <div
                key={p.id}
                className={cn(
                  'flex items-center gap-2 rounded-md px-2 py-1.5',
                  fora ? 'opacity-45' : 'hover:bg-accent/50',
                )}
              >
                <AvatarParticipante
                  nome={p.nome}
                  fotoUrl={p.fotoUrl}
                  className="h-6 w-6 text-[9px]"
                />
                <div className="min-w-0 flex-1">
                  <p className={cn(
                    'truncate text-xs text-foreground',
                    fora && 'line-through',
                  )}>
                    {p.nome}
                  </p>
                  <p className="truncate text-[10px] text-muted-foreground">
                    {p.equipeNome}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onChange({
                    ...valor,
                    excluidos: alternar(valor.excluidos, p.id),
                  })}
                  className={cn(
                    'flex-shrink-0 rounded p-1 transition-colors',
                    fora
                      ? 'text-muted-foreground hover:text-foreground'
                      : 'text-muted-foreground hover:bg-destructive/10 hover:text-destructive',
                  )}
                  title={fora ? 'Devolver ao desafio' : 'Remover do desafio'}
                >
                  {fora ? <X className="h-3.5 w-3.5" /> : <UserMinus className="h-3.5 w-3.5" />}
                </button>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
