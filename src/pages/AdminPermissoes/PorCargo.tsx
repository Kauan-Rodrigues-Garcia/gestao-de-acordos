/**
 * PorCargo — a permissão que vale para todo mundo daquele cargo.
 *
 * ## O desenho, e o que ele conserta
 *
 * 1. **Duas colunas.** Os cargos ficam numa coluna fixa à esquerda, com quantas
 *    permissões cada um tem. Antes eram pílulas numa fileira no topo: para
 *    comparar dois cargos era preciso trocar e decorar o que se viu.
 * 2. **Cartões, não linhas.** Cada permissão é um cartão estreito com o
 *    interruptor ao lado do rótulo. Em linha de largura total, num monitor
 *    grande, o controle ficava a mil e seiscentos pixels do texto que governa —
 *    e é aí que se erra o clique.
 * 3. **Busca.** Com mais de oitenta chaves, rolar para achar «quem exclui
 *    equipe» não é navegação, é garimpo.
 * 4. **A barra de salvar acompanha a rolagem**, porque a alteração acontece no
 *    fim da página e o botão ficava no começo.
 *
 * Os oito cargos aparecem — `ouvidoria` era invisível na versão antiga —, e
 * `administrador`/`super_admin` aparecem em leitura, com a explicação de por
 * que não são editáveis.
 *
 * ## Próprias do setor (26/10/2026)
 *
 * Os mapas próprios de setor («Operador - Manutenção») ficavam embaixo dos
 * cargos, numa coluna que crescia a cada setor. Desde 03/11/2026 moram na
 * visão Por setor (`PorSetor.tsx`); aqui fica só o aviso de quais setores do
 * cargo aberto NÃO seguem o que se muda nele.
 *
 * ## Um módulo por vez (03/11/2026)
 *
 * Os módulos ficam numa lista ao lado, cada um com o seu «Exibir aba», e só o
 * escolhido abre (`PainelDeModulos.tsx`) — antes eram vinte e tantos cards
 * empilhados.
 */
import { useMemo, useState } from 'react';
import { ShieldCheck, Building2 } from 'lucide-react';
import { PERFIL_LABELS } from '@/lib/index';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useCadastroDeCargos } from '@/hooks/useCargos';
import { CARGOS_CONFIGURAVEIS, CARGOS_ACESSO_TOTAL } from '@/lib/permissoes-catalogo';
import { cn } from '@/lib/utils';
import { EditorDoMapa } from './EditorDoMapa';
import { useMapaDoCargo } from './useMapaDoCargo';
import { useSetoresDaEmpresa } from './useSetoresDaEmpresa';

interface Props {
  /** Abre o mapa do cargo num setor, na visão Por setor. */
  onVerNoSetor?: (setorId: string, cargo: string) => void;
}

export function PorCargo({ onVerNoSetor }: Props = {}) {
  const { empresa } = useEmpresa();
  const setores = useSetoresDaEmpresa(empresa?.id);
  // As listas mudam quando o cadastro de cargos chega do banco (cargo novo
  // criado em Configurações > Cargos aparece aqui sem deploy).
  const cadastro = useCadastroDeCargos();
  const TODOS_OS_CARGOS = useMemo(
    () => [...CARGOS_CONFIGURAVEIS, ...CARGOS_ACESSO_TOTAL],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- as listas mudam com o cadastro
    [cadastro],
  );

  const [cargo, setCargo] = useState('operador');
  const mapa = useMapaDoCargo({ cargo, setorId: null }, PERFIL_LABELS[cargo] ?? cargo);
  const { rascunho, catalogo, acessoTotal } = mapa;

  /** Os setores em que o cargo aberto tem mapa próprio. */
  const setoresProprios = mapa.todasPermissoesSetor
    .filter(m => m.cargo === cargo)
    .map(m => ({ id: m.setor_id, nome: setores.find(s => s.id === m.setor_id)?.nome ?? 'setor' }))
    .sort((a, b) => a.nome.localeCompare(b.nome));

  function trocarCargo(novo: string) {
    if (novo === cargo) return;
    if (rascunho.sujo && !confirm('Descartar as alterações não salvas?')) return;
    rascunho.descartar();
    setCargo(novo);
  }

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">

      {/* ── Coluna dos cargos ───────────────────────────────────────────── */}
      <aside className="lg:sticky lg:top-4 lg:w-52 lg:shrink-0">
        <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Cargo
        </p>
        <div className="flex gap-1.5 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
          {TODOS_OS_CARGOS.map(c => {
            const total = (CARGOS_ACESSO_TOTAL as readonly string[]).includes(c);
            const ativo = cargo === c;
            return (
              <button
                key={c}
                onClick={() => trocarCargo(c)}
                className={cn(
                  'flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors lg:w-full',
                  ativo
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground',
                )}
              >
                <span className={cn(
                  'h-6 w-1 shrink-0 rounded-full transition-colors',
                  ativo ? 'bg-primary' : 'bg-transparent',
                )} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1 text-[13px] font-medium">
                    {PERFIL_LABELS[c] ?? c}
                    {total && <ShieldCheck className="h-3 w-3 text-primary/70" />}
                  </span>
                  <span className="text-[10px] tabular-nums text-muted-foreground">
                    {total ? 'acesso total' : `${mapa.contarDe(c)} de ${catalogo.length}`}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </aside>

      {/* ── Conteúdo ────────────────────────────────────────────────────── */}
      <div className="min-w-0 flex-1 space-y-3">
        {acessoTotal ? (
          <div className="rounded-xl border border-border bg-muted/20 px-4 py-4 text-sm">
            <p className="flex items-center gap-1.5 font-semibold text-foreground">
              <ShieldCheck className="h-4 w-4" />
              {PERFIL_LABELS[cargo]} tem acesso total, por construção
            </p>
            <p className="mt-1 leading-relaxed text-muted-foreground">
              Não é uma lista de permissões que dá esse acesso — é o próprio cargo.
              A migration <code className="text-xs">20260812b</code> estabeleceu isso no
              banco, e o app responde &laquo;pode&raquo; antes mesmo de consultar a tabela.
              Para tirar o acesso de alguém, <strong>troque o cargo da pessoa</strong>.
            </p>
            {/* A exceção existe; omiti-la faria o painel prometer mais do que
                entrega, justamente no ponto em que a diferença aparece. */}
            <p className="mt-2 border-t border-border/60 pt-2 leading-relaxed text-muted-foreground">
              <strong className="text-foreground">Uma exceção:</strong> escrever em
              mês já fechado não vem junto. Só o super admin passa por esse cadeado,
              e ele passa por regra de código — não por esta tela. É o único poder
              aqui que ninguém herda de &laquo;acesso total&raquo;.
            </p>
          </div>
        ) : (
          <EditorDoMapa
            mapa={mapa}
            cabecalho={setoresProprios.length > 0 && (
              <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/20 px-4 py-3 text-sm">
                <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {setoresProprios.length === 1 ? 'Um setor tem' : `${setoresProprios.length} setores têm`} permissões
                    próprias de {PERFIL_LABELS[cargo] ?? cargo}, e quem está lá não segue o que mudar aqui:
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {setoresProprios.map(s => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => onVerNoSetor?.(s.id, cargo)}
                        disabled={!onVerNoSetor}
                        className="rounded-full border border-border bg-background px-2.5 py-0.5 text-[11px] font-medium text-foreground transition-colors hover:border-primary/50 disabled:cursor-default"
                      >
                        {s.nome}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          />
        )}
      </div>
    </div>
  );
}
