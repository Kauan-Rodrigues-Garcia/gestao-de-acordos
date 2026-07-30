/**
 * PainelResponsaveis — o líder escolhe quem atende os pedidos.
 *
 * Quem entra aqui ganha visão geral e poder de editar/mudar status (a RLS lê
 * `atendimento_responsaveis` em `fn_wpp_tem_visao_geral`). Por isso a lista fica
 * visível para todos: o solicitante precisa saber a quem recorrer.
 */
import { useState, useEffect, useMemo, useRef } from 'react';
import { UserPlus, X, Search, Loader2, Headset } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import type { PessoaResumo } from '@/services/solicitacoesWhatsapp.service';

/** Normaliza para busca sem acento/caixa ("João" casa com "joao"). */
function normalizar(s: string): string {
  // \u0300-\u036f = marcas de combinacao que o NFD separa das letras.
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export function PainelResponsaveis({
  empresaId, responsaveis, podeEditar, salvando, onAdicionar, onRemover,
}: {
  empresaId:    string;
  responsaveis: PessoaResumo[];
  podeEditar:   boolean;
  salvando:     boolean;
  onAdicionar:  (usuarioId: string) => void;
  onRemover:    (usuarioId: string) => void;
}) {
  const [abertoBusca, setAbertoBusca] = useState(false);
  const [termo, setTermo]             = useState('');
  const [usuarios, setUsuarios]       = useState<PessoaResumo[]>([]);
  const [carregando, setCarregando]   = useState(false);
  const caixaRef = useRef<HTMLDivElement>(null);

  // Carrega os usuários da empresa só quando a busca abre — a lista pode ser
  // grande e ninguém precisa dela para só ver quem é responsável.
  useEffect(() => {
    if (!abertoBusca || usuarios.length > 0) return;
    let cancelado = false;
    setCarregando(true);
    void (async () => {
      const { data, error } = await supabase
        .from('perfis')
        .select('id, nome, foto_url')
        .eq('empresa_id', empresaId)
        .eq('ativo', true)
        .order('nome');
      if (cancelado) return;
      if (error) console.warn('[PainelResponsaveis] erro ao listar usuários:', error.message);
      setUsuarios((data ?? []) as PessoaResumo[]);
      setCarregando(false);
    })();
    return () => { cancelado = true; };
  }, [abertoBusca, empresaId, usuarios.length]);

  // Fecha ao clicar fora.
  useEffect(() => {
    if (!abertoBusca) return;
    function aoClicar(e: MouseEvent) {
      if (caixaRef.current && !caixaRef.current.contains(e.target as Node)) {
        setAbertoBusca(false);
        setTermo('');
      }
    }
    document.addEventListener('mousedown', aoClicar);
    return () => document.removeEventListener('mousedown', aoClicar);
  }, [abertoBusca]);

  const jaResponsavel = useMemo(
    () => new Set(responsaveis.map(r => r.id)),
    [responsaveis],
  );

  const sugestoes = useMemo(() => {
    const t = normalizar(termo.trim());
    if (!t) return usuarios.filter(u => !jaResponsavel.has(u.id)).slice(0, 8);
    return usuarios
      .filter(u => !jaResponsavel.has(u.id) && normalizar(u.nome).includes(t))
      .slice(0, 8);
  }, [usuarios, termo, jaResponsavel]);

  return (
    <div className="rounded-xl border border-border bg-card px-3.5 py-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Headset className="w-3.5 h-3.5" />
          Responsáveis pelo envio
        </p>
        {podeEditar && (
          <div className="relative" ref={caixaRef}>
            <Button
              size="sm" variant="outline" className="h-7 text-xs gap-1.5"
              onClick={() => setAbertoBusca(v => !v)}
            >
              <UserPlus className="w-3.5 h-3.5" /> Adicionar
            </Button>

            {abertoBusca && (
              <div className="absolute right-0 top-9 z-30 w-64 rounded-xl border border-border bg-card shadow-xl p-2">
                <div className="relative mb-1.5">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    autoFocus
                    value={termo}
                    onChange={e => setTermo(e.target.value)}
                    placeholder="Digite o nome…"
                    className="h-8 pl-7 text-xs"
                  />
                </div>

                <div className="max-h-56 overflow-y-auto space-y-0.5">
                  {carregando && (
                    <div className="flex justify-center py-3 text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin" />
                    </div>
                  )}
                  {!carregando && sugestoes.length === 0 && (
                    <p className="text-[11px] text-muted-foreground text-center py-3">
                      Nenhum usuário encontrado.
                    </p>
                  )}
                  {sugestoes.map(u => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => { onAdicionar(u.id); setTermo(''); setAbertoBusca(false); }}
                      disabled={salvando}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-accent text-left transition-colors disabled:opacity-50"
                    >
                      <Avatar className="w-6 h-6 shrink-0">
                        {u.foto_url && <AvatarImage src={u.foto_url} alt={u.nome} className="object-cover" />}
                        <AvatarFallback className="bg-muted text-[9px] font-bold">
                          {u.nome.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-xs truncate">{u.nome}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {responsaveis.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">
          {podeEditar
            ? 'Ninguém definido ainda — os pedidos ficam sem quem atenda.'
            : 'Nenhum responsável definido no momento.'}
        </p>
      ) : (
        <div className="flex items-center gap-1.5 flex-wrap">
          {responsaveis.map(r => (
            <span
              key={r.id}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 pl-1 pr-2 py-0.5',
                podeEditar && 'pr-1',
              )}
            >
              <Avatar className="w-5 h-5 shrink-0">
                {r.foto_url && <AvatarImage src={r.foto_url} alt={r.nome} className="object-cover" />}
                <AvatarFallback className="bg-primary/15 text-primary text-[9px] font-bold">
                  {r.nome.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="text-[11px] truncate max-w-[140px]">{r.nome}</span>
              {podeEditar && (
                <button
                  type="button"
                  onClick={() => onRemover(r.id)}
                  disabled={salvando}
                  title={`Remover ${r.nome}`}
                  className="w-4 h-4 rounded-full hover:bg-destructive/15 hover:text-destructive flex items-center justify-center transition-colors disabled:opacity-50"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
