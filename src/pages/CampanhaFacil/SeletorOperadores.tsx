/**
 * Passo 3 — quem encaminha. Operadores do setor, com busca pelo nome e caixa
 * de marcar.
 *
 * Substitui o campo de nomes digitados (29/09/2026). O líder preso a um setor
 * só vê o dele; gerência para cima escolhe o setor antes. A busca (07/10/2026)
 * só filtra a lista: quem está marcado continua marcado fora do filtro.
 */
import { Loader2, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { useEnviosCampanha } from './useEnviosCampanha';

type Envios = ReturnType<typeof useEnviosCampanha>;

export function SeletorOperadores({ envios, destacarVazio }: { envios: Envios; destacarVazio: boolean }) {
  const {
    setorFixo, setores, setorId, setSetorId, busca, setBusca,
    operadores, operadoresVisiveis, carregandoOperadores, selecionados, alternar, marcarTodos, desmarcarTodos,
  } = envios;
  const marcados = selecionados.size;
  const filtrando = busca.trim() !== '';
  const visiveisMarcados = operadoresVisiveis.filter((o) => selecionados.has(o.id)).length;
  const todosVisiveis = operadoresVisiveis.length > 0 && visiveisMarcados === operadoresVisiveis.length;

  /** Com filtro, o botão age só sobre quem aparece. */
  function alternarVisiveis() {
    if (!filtrando) { if (marcados === operadores.length) desmarcarTodos(); else marcarTodos(); return; }
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
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar operador pelo nome"
              aria-label="Buscar operador pelo nome"
              className="h-9 pl-8 pr-8 text-sm"
            />
            {filtrando && (
              <button
                type="button" aria-label="Limpar busca" onClick={() => setBusca('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className={cn(destacarVazio && marcados === 0 ? 'text-destructive' : 'text-muted-foreground')}>
              {marcados} de {operadores.length} marcados
            </span>
            {operadoresVisiveis.length > 0 && (
              <Button variant="link" className="h-auto p-0 text-xs" onClick={alternarVisiveis}>
                {filtrando
                  ? (todosVisiveis ? 'Desmarcar os encontrados' : 'Marcar os encontrados')
                  : (marcados === operadores.length ? 'Desmarcar todos' : 'Marcar todos')}
              </Button>
            )}
          </div>
          <ul className="max-h-56 space-y-0.5 overflow-y-auto rounded-md border border-border p-1">
            {operadoresVisiveis.length === 0 ? (
              <li className="px-2 py-3 text-center text-xs text-muted-foreground">Ninguém com esse nome no setor.</li>
            ) : operadoresVisiveis.map((o) => (
              <li key={o.id}>
                <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent">
                  <Checkbox checked={selecionados.has(o.id)} onCheckedChange={() => alternar(o.id)} />
                  <span className="truncate">{o.nome}</span>
                </label>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            {marcados === 0
              ? 'Marque quem vai encaminhar.'
              : marcados === 1
                ? 'A campanha inteira vai para 1 operador.'
                : `Mensagens divididas em rodízio entre ${marcados} operadores.`}
          </p>
        </>
      )}
    </div>
  );
}
