/**
 * CardAtendentes — o líder escolhe quem do setor atende a Ouvidoria.
 *
 * Ligar grava a exceção por pessoa `ver_ouvidoria_cofen: sim` (a mesma de
 * Configurações › Permissões › Por pessoa); desligar apaga a exceção e a
 * pessoa volta a herdar do cargo. Por isso dois casos não se mudam aqui, e a
 * tela diz onde mudar:
 *
 *   pelo cargo      o mapa do cargo concede (o líder, por exemplo)
 *   bloqueado       o administrador negou nominalmente
 *
 * Quem decide é o banco (`fn_ouvidoria_cofen_definir_acesso`); a tela só
 * pergunta e mostra a resposta.
 */
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Loader2, Lock, Search, ShieldCheck, Users } from 'lucide-react';
import { toast } from 'sonner';
import { AvatarChat } from '@/components/Chat/comum';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { PERFIL_LABELS } from '@/lib/index';
import { cn } from '@/lib/utils';
import { definirAcesso } from '@/services/ouvidoriaCofen.service';
import { ROTULO_ORIGEM, normalizar, type PessoaOuvidoria } from './ouvidoria';

interface Props {
  setorId: string;
  pessoas: PessoaOuvidoria[];
  carregando: boolean;
  meuId: string | null;
}

export function CardAtendentes({ setorId, pessoas, carregando, meuId }: Props) {
  const qc = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const [mudando, setMudando] = useState<string | null>(null);

  const comAcesso = pessoas.filter(p => p.tem_acesso);
  const visiveis = useMemo(() => {
    const b = normalizar(busca.trim());
    return b ? pessoas.filter(p => normalizar(p.nome).includes(b)) : pessoas;
  }, [pessoas, busca]);

  async function alternar(p: PessoaOuvidoria, liberar: boolean) {
    setMudando(p.perfil_id);
    try {
      await definirAcesso(setorId, p.perfil_id, liberar);
      toast.success(liberar ? `${p.nome} agora atende a Ouvidoria.` : `${p.nome} saiu da Ouvidoria.`);
      await qc.invalidateQueries({ queryKey: ['ouvidoria-pessoas', setorId] });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setMudando(null);
    }
  }

  return (
    <div className="rounded-xl border bg-card">
      <button
        type="button"
        onClick={() => setAberto(a => !a)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
        aria-expanded={aberto}
      >
        <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <Users className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Quem atende a Ouvidoria</p>
          <p className="text-xs text-muted-foreground">
            {carregando ? 'Carregando…' : `${comAcesso.length} ${comAcesso.length === 1 ? 'pessoa' : 'pessoas'} com acesso · você escolhe quem do setor atende`}
          </p>
        </div>
        <div className="hidden sm:flex -space-x-2">
          {comAcesso.slice(0, 6).map(p => (
            <div key={p.perfil_id} className="ring-2 ring-card rounded-full" title={p.nome}>
              <AvatarChat nome={p.nome} foto={p.foto_url} tamanho={26} />
            </div>
          ))}
          {comAcesso.length > 6 && (
            <div className="ring-2 ring-card rounded-full h-[26px] w-[26px] bg-muted text-[10px] font-semibold flex items-center justify-center">
              +{comAcesso.length - 6}
            </div>
          )}
        </div>
        <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', aberto && 'rotate-180')} />
      </button>

      {aberto && (
        <div className="border-t px-4 py-3 space-y-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar pessoa do setor"
                   className="h-8 pl-8 text-sm" />
          </div>
          <ul className="divide-y max-h-[360px] overflow-y-auto -mx-1">
            {visiveis.map(p => {
              const travado = p.origem === 'total' || p.origem === 'cargo' || p.origem === 'bloqueado' || p.perfil_id === meuId;
              const motivo = p.perfil_id === meuId
                ? 'Você não muda o seu próprio acesso.'
                : p.origem === 'bloqueado'
                  ? 'Negado em Configurações › Permissões. Só o administrador desfaz.'
                  : p.origem === 'cargo'
                    ? 'O cargo já concede. Para tirar, desligue em Configurações › Permissões.'
                    : p.origem === 'total' ? 'Cargo de acesso total.' : undefined;
              return (
                <li key={p.perfil_id} className="flex items-center gap-3 px-1 py-2">
                  <AvatarChat nome={p.nome} foto={p.foto_url} tamanho={30} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{p.nome}</p>
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                      {PERFIL_LABELS[p.cargo] ?? p.cargo}
                      <span>·</span>
                      <span className={cn(
                        p.origem === 'liberado' && 'text-success',
                        p.origem === 'bloqueado' && 'text-destructive',
                        p.origem === 'cargo' && 'text-primary',
                      )}>
                        {ROTULO_ORIGEM[p.origem]}
                      </span>
                    </p>
                  </div>
                  {mudando === p.perfil_id ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : travado ? (
                    <span title={motivo} className="flex items-center gap-1.5 text-muted-foreground">
                      {p.origem === 'cargo' || p.origem === 'total' ? <ShieldCheck className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                      <Switch checked={p.tem_acesso} disabled aria-label={motivo} />
                    </span>
                  ) : (
                    <Switch
                      checked={p.tem_acesso}
                      disabled={!!mudando}
                      onCheckedChange={v => void alternar(p, v)}
                      aria-label={`Acesso de ${p.nome} à Ouvidoria`}
                    />
                  )}
                </li>
              );
            })}
            {!carregando && visiveis.length === 0 && (
              <li className="py-6 text-center text-sm text-muted-foreground">Ninguém encontrado no setor.</li>
            )}
          </ul>
          <p className="text-[11px] text-muted-foreground">
            O acesso liberado aqui aparece também em Configurações › Permissões › Por pessoa.
          </p>
        </div>
      )}
    </div>
  );
}
