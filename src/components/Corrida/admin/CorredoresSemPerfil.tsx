/**
 * CorredoresSemPerfil — pôr para correr quem não tem perfil no sistema
 * (pedido do Cleber, 21/10/2026): o nome e o setor digitados, e o bichinho
 * sorteado pelo banco na hora (20261021120000). Ele não tem tela: não escolhe,
 * não entra no lobby e não recebe aviso — só aparece no grid e pode vencer.
 */
import { useId, useState } from 'react';
import { Plus, UserRoundPlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { CorredorSemPerfil } from './acoes';

interface Props {
  avulsos: CorredorSemPerfil[];
  onChange: (novos: CorredorSemPerfil[]) => void;
  /** Os setores do cadastro, para sugerir (o setor pode ser qualquer texto). */
  setores: string[];
}

/** Os mesmos limites da função do banco. */
export const MAX_NOME_AVULSO = 40;
export const MAX_SETOR_AVULSO = 60;

export function CorredoresSemPerfil({ avulsos, onChange, setores }: Props) {
  const [nome, setNome] = useState('');
  const [setor, setSetor] = useState('');
  const idLista = useId();
  const nomeLimpo = nome.trim(), setorLimpo = setor.trim();
  const pode = !!nomeLimpo && !!setorLimpo;

  const adicionar = () => {
    if (!pode) return;
    onChange([...avulsos, { nome: nomeLimpo, setor: setorLimpo }]);
    // O setor fica: é comum pôr várias pessoas do mesmo setor seguidas.
    setNome('');
  };

  return (
    <div className="space-y-2 rounded-lg border border-dashed p-3">
      <form className="flex flex-wrap items-end gap-2" onSubmit={e => { e.preventDefault(); adicionar(); }}>
        <label className="min-w-[140px] flex-1 space-y-1 text-[11px] text-muted-foreground">
          Nome
          <Input value={nome} maxLength={MAX_NOME_AVULSO} onChange={e => setNome(e.target.value)} placeholder="Ex.: João" className="h-8 text-sm text-foreground" />
        </label>
        <label className="min-w-[140px] flex-1 space-y-1 text-[11px] text-muted-foreground">
          Setor
          <Input value={setor} maxLength={MAX_SETOR_AVULSO} list={idLista} onChange={e => setSetor(e.target.value)} placeholder="Ex.: Play 4" className="h-8 text-sm text-foreground" />
          <datalist id={idLista}>{setores.map(s => <option key={s} value={s} />)}</datalist>
        </label>
        <Button type="submit" size="sm" variant="outline" className="h-8 gap-1.5" disabled={!pode}>
          <Plus className="h-3.5 w-3.5" /> Pôr para correr
        </Button>
      </form>
      {avulsos.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {avulsos.map((a, i) => (
            <li key={a.id ?? `novo-${i}`}>
              <button type="button" onClick={() => onChange(avulsos.filter((_, j) => j !== i))} title={`Tirar ${a.nome}`}
                className="flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-xs hover:bg-destructive/15">
                <UserRoundPlus className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                {a.nome} <span className="text-muted-foreground">· {a.setor}</span> <X className="h-2.5 w-2.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[11px] text-muted-foreground">Ninguém sem perfil ainda.</p>
      )}
    </div>
  );
}
