/**
 * Passo 3 — quem encaminha. Operadores do setor, com busca pelo nome e caixa
 * de marcar.
 *
 * Substitui o campo de nomes digitados (29/09/2026). O líder preso a um setor
 * só vê o dele; gerência para cima escolhe o setor antes. A busca (07/10/2026)
 * só filtra a lista: quem está marcado continua marcado fora do filtro.
 * Desde 09/10/2026 cada um aparece com a foto do perfil, e a lista filtra por
 * equipe — «Só esta equipe» marca exatamente quem aparece.
 * Desde 14/10/2026 dá para escolher várias equipes de uma vez, e os líderes do
 * setor aparecem na «Equipe de liderança» (desmarcados) para entrar na campanha.
 */
import { Check, Loader2, Search, X } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { EQUIPE_LIDERANCA, rotuloEquipe } from './envios';
import type { useEnviosCampanha } from './useEnviosCampanha';

type Envios = ReturnType<typeof useEnviosCampanha>;

function iniciais(nome: string): string {
  return nome.trim().split(/\s+/).slice(0, 2).map((p) => p[0] ?? '').join('').toUpperCase() || '?';
}

export function SeletorOperadores({ envios, destacarVazio }: { envios: Envios; destacarVazio: boolean }) {
  const {
    setorFixo, setores, setorId, setSetorId, busca, setBusca,
    equipes, filtroEquipes, alternarEquipe, limparEquipes,
    operadores, operadoresVisiveis, carregandoOperadores, selecionados, alternar, marcarTodos, desmarcarTodos,
  } = envios;
  const marcados = selecionados.size;
  const comEquipe = filtroEquipes.size > 0;
  const filtrando = busca.trim() !== '' || comEquipe;
  const visiveisMarcados = operadoresVisiveis.filter((o) => selecionados.has(o.id)).length;
  const todosVisiveis = operadoresVisiveis.length > 0 && visiveisMarcados === operadoresVisiveis.length;
  const soEstaMarcada = comEquipe && todosVisiveis && marcados === operadoresVisiveis.length;
  const lideresMarcados = operadores.filter((o) => o.lider && selecionados.has(o.id)).length;

  /** Com filtro, o botão age só sobre quem aparece. */
  function alternarVisiveis() {
    if (!filtrando) { if (marcados === operadores.length) desmarcarTodos(); else marcarTodos(); return; }
    for (const o of operadoresVisiveis) {
      if (todosVisiveis || !selecionados.has(o.id)) alternar(o.id);
    }
  }

  /** Marca exatamente quem aparece nas equipes escolhidas, e desmarca o resto. */
  function soEstaEquipe() {
    const visiveis = new Set(operadoresVisiveis.map((o) => o.id));
    for (const o of operadores) {
      if (visiveis.has(o.id) !== selecionados.has(o.id)) alternar(o.id);
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
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por equipe">
              <ChipEquipe ativo={!comEquipe} onClick={limparEquipes}>
                Todas as equipes ({operadores.length})
              </ChipEquipe>
              {equipes.map((e) => (
                <ChipEquipe key={e.id} ativo={filtroEquipes.has(e.id)} onClick={() => alternarEquipe(e.id)}
                  destaque={e.id === EQUIPE_LIDERANCA}>
                  {e.id === 'sem' ? e.nome : rotuloEquipe(e.nome)} ({e.qtd})
                </ChipEquipe>
              ))}
            </div>
          )}
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar operador pelo nome"
              aria-label="Buscar operador pelo nome"
              className="h-9 pl-8 pr-8 text-sm"
            />
            {busca.trim() !== '' && (
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
              {marcados} de {operadores.length} marcados
            </span>
            <span className="flex gap-3">
              {comEquipe && operadoresVisiveis.length > 0 && !soEstaMarcada && (
                <Button variant="link" className="h-auto p-0 text-xs" onClick={soEstaEquipe}>
                  {filtroEquipes.size === 1 ? 'Só esta equipe' : 'Só estas equipes'}
                </Button>
              )}
              {operadoresVisiveis.length > 0 && (
                <Button variant="link" className="h-auto p-0 text-xs" onClick={alternarVisiveis}>
                  {filtrando
                    ? (todosVisiveis ? 'Desmarcar os encontrados' : 'Marcar os encontrados')
                    : (marcados === operadores.length ? 'Desmarcar todos' : 'Marcar todos')}
                </Button>
              )}
            </span>
          </div>
          <ul className="max-h-64 space-y-0.5 overflow-y-auto rounded-md border border-border p-1">
            {operadoresVisiveis.length === 0 ? (
              <li className="px-2 py-3 text-center text-xs text-muted-foreground">Ninguém encontrado com esse filtro.</li>
            ) : operadoresVisiveis.map((o) => (
              <li key={o.id}>
                <label className="flex cursor-pointer items-center gap-2.5 rounded px-2 py-1.5 text-sm hover:bg-accent">
                  <Checkbox checked={selecionados.has(o.id)} onCheckedChange={() => alternar(o.id)} />
                  <Avatar className="h-7 w-7">
                    {o.foto_url && <AvatarImage src={o.foto_url} alt="" className="object-cover" />}
                    <AvatarFallback className="bg-primary/10 text-[10px] font-semibold text-primary">{iniciais(o.nome)}</AvatarFallback>
                  </Avatar>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate leading-tight">{o.nome}</span>
                    {o.lider ? (
                      <span className="block truncate text-[11px] leading-tight text-primary">Liderança</span>
                    ) : o.equipe_nome && filtroEquipes.size !== 1 && (
                      <span className="block truncate text-[11px] leading-tight text-muted-foreground">{rotuloEquipe(o.equipe_nome)}</span>
                    )}
                  </span>
                </label>
              </li>
            ))}
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

/** Uma equipe do filtro: liga e desliga, e várias podem ficar ligadas. */
function ChipEquipe({ ativo, destaque, onClick, children }: {
  ativo: boolean; destaque?: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      type="button" aria-pressed={ativo} onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors',
        ativo
          ? 'border-primary bg-primary text-primary-foreground'
          : cn('border-border bg-background hover:bg-accent', destaque ? 'text-primary' : 'text-foreground'),
      )}
    >
      {ativo && <Check className="h-3 w-3" />}
      {children}
    </button>
  );
}
