/**
 * Passo 3 — quem encaminha. Operadores do setor, com busca pelo nome e caixa
 * de marcar.
 *
 * Substitui o campo de nomes digitados (29/09/2026). O líder preso a um setor
 * só vê o dele; gerência para cima escolhe o setor antes. A busca (07/10/2026)
 * só filtra a lista: quem está marcado continua marcado fora do filtro.
 * Desde 09/10/2026 cada um aparece com a foto do perfil.
 *
 * ## As equipes definem a lista (14/10/2026)
 *
 * O filtro de equipes é o mesmo do Painel Líder (`SeletorMultiplo`): um botão
 * que abre os cards das equipes do setor, várias de uma vez, nenhuma = todas.
 * As equipes escolhidas dizem QUEM PODE RECEBER: a lista traz os operadores
 * delas e também os líderes delas (`equipe_lideres`), e a campanha vai só para
 * quem está marcado ali. Antes os líderes ficavam soltos numa «Equipe de
 * liderança», sem ligação com a equipe que lideram, e quem saía do filtro
 * continuava marcado sem aparecer.
 */
import { Layers, Loader2, Search, X } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { SeletorMultiplo, type ItemFiltro } from '@/pages/Dashboard/Analitico/FiltrosEscopo';
import { resumoDaEquipe, rotuloEquipe, type OperadorCampanha } from './envios';
import type { useEnviosCampanha } from './useEnviosCampanha';

type Envios = ReturnType<typeof useEnviosCampanha>;

function iniciais(nome: string): string {
  return nome.trim().split(/\s+/).slice(0, 2).map((p) => p[0] ?? '').join('').toUpperCase() || '?';
}

/** A linha de baixo do nome: a equipe do operador, ou as que o líder lidera. */
function legenda(o: OperadorCampanha, umaEquipe: boolean): { texto: string; lider: boolean } | null {
  if (o.lider) {
    const equipes = (o.equipes_lider ?? []).map((e) => rotuloEquipe(e.nome || 'sem nome'));
    if (umaEquipe || equipes.length === 0) return { texto: equipes.length ? 'Líder' : 'Líder do setor', lider: true };
    return { texto: `Líder · ${equipes.join(', ')}`, lider: true };
  }
  if (o.elite) {
    return { texto: umaEquipe || !o.equipe_nome ? 'Elite' : `Elite · ${rotuloEquipe(o.equipe_nome)}`, lider: true };
  }
  if (umaEquipe || !o.equipe_nome) return null;
  return { texto: rotuloEquipe(o.equipe_nome), lider: false };
}

export function SeletorOperadores({ envios, destacarVazio }: { envios: Envios; destacarVazio: boolean }) {
  const {
    setorFixo, setores, setorId, setSetorId, busca, setBusca,
    equipes, filtroEquipes, escolherEquipes,
    operadores, operadoresDoRecorte, operadoresVisiveis, operadoresSelecionados,
    carregandoOperadores, selecionados, alternar, marcarTodos, desmarcarTodos,
  } = envios;
  const marcados = operadoresSelecionados.length;
  const noRecorte = operadoresDoRecorte.length;
  const buscando = busca.trim() !== '';
  const visiveisMarcados = operadoresVisiveis.filter((o) => selecionados.has(o.id)).length;
  const todosVisiveis = operadoresVisiveis.length > 0 && visiveisMarcados === operadoresVisiveis.length;
  const lideresMarcados = operadoresSelecionados.filter((o) => o.lider).length;
  const lideresNoRecorte = operadoresDoRecorte.filter((o) => o.lider).length;
  const umaEquipe = filtroEquipes.length === 1;

  const itensEquipe: ItemFiltro[] = equipes.map((e) => ({
    id: e.id,
    nome: e.id === 'sem' ? e.nome : rotuloEquipe(e.nome),
    detalhe: resumoDaEquipe(e),
  }));

  /** Com busca, o botão age só sobre quem aparece; sem ela, sobre o recorte todo. */
  function alternarVisiveis() {
    if (!buscando) { if (marcados === noRecorte) desmarcarTodos(); else marcarTodos(); return; }
    for (const o of operadoresVisiveis) {
      if (todosVisiveis || !selecionados.has(o.id)) alternar(o.id);
    }
  }

  return (
    <div className="space-y-2">
      {!setorFixo && (
        <Select value={setorId ?? ''} onValueChange={setSetorId}>
          <SelectTrigger className="h-9"><SelectValue placeholder="Escolha o setor" /></SelectTrigger>
          <SelectContent>
            {setores.map((s) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
          </SelectContent>
        </Select>
      )}

      {carregandoOperadores ? (
        <p className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando operadores do setor…
        </p>
      ) : !setorId ? (
        <p className="py-2 text-xs text-destructive">
          Seu usuário não tem setor cadastrado. Peça para vincularem você a um setor.
        </p>
      ) : operadores.length === 0 ? (
        <p className="py-2 text-xs text-muted-foreground">Nenhum operador ativo neste setor.</p>
      ) : (
        <>
          {equipes.length > 1 && (
            <div className="flex items-center gap-2">
              <SeletorMultiplo
                icone={Layers}
                itens={itensEquipe}
                marcados={filtroEquipes}
                onMarcados={escolherEquipes}
                vazio="Todas as equipes"
                plural="equipes"
                larguraBotao="w-60 max-w-full"
              />
              {filtroEquipes.length > 0 && (
                <Button
                  variant="ghost" size="sm"
                  className="h-8 gap-1 px-2 text-xs text-muted-foreground"
                  onClick={() => escolherEquipes([])}
                >
                  <X className="h-3 w-3" /> Limpar
                </Button>
              )}
            </div>
          )}
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar pelo nome"
              aria-label="Buscar pelo nome"
              className="h-9 pl-8 pr-8 text-sm"
            />
            {buscando && (
              <button
                type="button" aria-label="Limpar busca" onClick={() => setBusca('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
            <span className={cn(destacarVazio && marcados === 0 ? 'text-destructive' : 'text-muted-foreground')}>
              {marcados} de {noRecorte} marcados
              {lideresNoRecorte > 0 && ` · ${lideresNoRecorte} ${lideresNoRecorte === 1 ? 'líder' : 'líderes'} na lista`}
            </span>
            {operadoresVisiveis.length > 0 && (
              <Button variant="link" className="h-auto p-0 text-xs" onClick={alternarVisiveis}>
                {buscando
                  ? (todosVisiveis ? 'Desmarcar os encontrados' : 'Marcar os encontrados')
                  : (marcados === noRecorte ? 'Desmarcar todos' : 'Marcar todos')}
              </Button>
            )}
          </div>
          <ul className="max-h-64 space-y-0.5 overflow-y-auto rounded-md border border-border p-1">
            {operadoresVisiveis.length === 0 ? (
              <li className="px-2 py-3 text-center text-xs text-muted-foreground">
                {buscando ? 'Ninguém encontrado com esse nome.' : 'Ninguém nas equipes escolhidas.'}
              </li>
            ) : operadoresVisiveis.map((o) => {
              const sub = legenda(o, umaEquipe);
              return (
                <li key={o.id}>
                  <label className="flex cursor-pointer items-center gap-2.5 rounded px-2 py-1.5 text-sm hover:bg-accent">
                    <Checkbox checked={selecionados.has(o.id)} onCheckedChange={() => alternar(o.id)} />
                    <Avatar className="h-7 w-7">
                      {o.foto_url && <AvatarImage src={o.foto_url} alt="" className="object-cover" />}
                      <AvatarFallback className="bg-primary/10 text-[10px] font-semibold text-primary">{iniciais(o.nome)}</AvatarFallback>
                    </Avatar>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate leading-tight">{o.nome}</span>
                      {sub && (
                        <span className={cn(
                          'block truncate text-[11px] leading-tight',
                          sub.lider ? 'text-primary' : 'text-muted-foreground',
                        )}>
                          {sub.texto}
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-muted-foreground">
            {marcados === 0
              ? 'Marque quem vai encaminhar.'
              : marcados === 1
                ? `A campanha inteira vai para 1 ${lideresMarcados === 1 ? 'líder' : 'operador'}.`
                : `Mensagens divididas em rodízio entre ${marcados} pessoas${lideresMarcados > 0 ? ` (${lideresMarcados} ${lideresMarcados === 1 ? 'líder' : 'líderes'})` : ''}.`}
          </p>
        </>
      )}
    </div>
  );
}
