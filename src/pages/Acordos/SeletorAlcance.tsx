/**
 * «Visualizar acordos de:» — setor, equipe e «Individual» da aba Acordos, para
 * as duas mesas (Nosso produto e regra Cofen). As opções saem dos NÍVEIS da
 * aba (`useAlcanceAcordos`); tirado de `AcordosFilters.tsx` em 05/11/2026.
 *
 * Setor e equipe em CASCATA, como no Dashboard e no Desempenho do Dia. Antes
 * cada equipe era um botão; para quem tem `todos_setores` a barra virava um
 * tapete de dezenas de botões, sem ordem e sem dizer de que setor cada uma é.
 * Dois `Select` cabem em qualquer largura, e o setor dá o contexto.
 *
 * «Individual» continua botão porque não é item de lista — é outro MODO de ver
 * a tela: troca «de quem são estes acordos» por «quais são os meus».
 */
import { Building2, Layers } from 'lucide-react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { NivelEscopo } from '@/lib/permissoes-escopo';
import type { VisaoFiltroAcordos } from './helpers';

export function SeletorAlcance({
  niveis, equipesDoSetor, setoresDisponiveis, filtroSetor, setFiltroSetor, visao, setVisao, aoMudar,
}: {
  niveis: readonly NivelEscopo[];
  equipesDoSetor: { id: string; nome: string }[];
  /** Só para quem tem `todos_setores`; vazia, o seletor de setor nem aparece. */
  setoresDisponiveis: { id: string; nome: string }[];
  filtroSetor: string | null;
  setFiltroSetor: (v: string | null) => void;
  visao: VisaoFiltroAcordos;
  setVisao: (v: VisaoFiltroAcordos) => void;
  /** Trocou o recorte: a lista volta à primeira página. */
  aoMudar: () => void;
}) {
  const mostrarEquipes = niveis.includes('equipe') && equipesDoSetor.length > 0;
  // Um «individual» sozinho não é escolha — é a única coisa que a pessoa vê.
  const mostrarIndividual = niveis.includes('individual') && niveis.length > 1;
  if (!mostrarEquipes && !mostrarIndividual) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 mb-3 rounded-xl border border-border bg-card">
      <span className="text-xs font-medium text-muted-foreground shrink-0">Visualizar acordos de:</span>

      {setoresDisponiveis.length > 0 && (
        <Select
          value={filtroSetor ?? '__todos'}
          onValueChange={v => {
            setFiltroSetor(v === '__todos' ? null : v);
            aoMudar();
          }}
        >
          <SelectTrigger className="h-8 w-[190px] rounded-lg text-xs">
            <Building2 className="w-3 h-3 shrink-0 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__todos">Todos os setores</SelectItem>
            {setoresDisponiveis.map(s => (
              <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {mostrarEquipes && (
        <Select
          value={visao.startsWith('equipe:') ? visao : '__setor'}
          onValueChange={v => {
            setVisao((v === '__setor' ? 'setor' : v) as VisaoFiltroAcordos);
            aoMudar();
          }}
          /* Sem equipe no recorte não há escolha a fazer, e um seletor de
             opção única promete recorte sem entregar. */
          disabled={equipesDoSetor.length === 0}
        >
          <SelectTrigger className="h-8 w-[210px] rounded-lg text-xs">
            <Layers className="w-3 h-3 shrink-0 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__setor">
              {filtroSetor ? 'Todas as equipes do setor' : 'Todas as equipes'}
            </SelectItem>
            {equipesDoSetor.map(eq => (
              <SelectItem key={eq.id} value={`equipe:${eq.id}`}>{eq.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {mostrarIndividual && (
        <button
          onClick={() => {
            setVisao(visao === 'individual' ? 'setor' : 'individual');
            aoMudar();
          }}
          className={cn(
            'flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all',
            visao === 'individual'
              ? 'bg-role-elite text-white border-role-elite'
              : 'bg-background text-muted-foreground border-border hover:border-role-elite/40',
          )}
        >
          Individual
        </button>
      )}
    </div>
  );
}
