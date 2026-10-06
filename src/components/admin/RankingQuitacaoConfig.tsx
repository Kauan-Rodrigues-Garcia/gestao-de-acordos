/**
 * RankingQuitacaoConfig — em que setor a aba Ranking de quitação aparece, e os
 * prêmios do 1º ao 6º de cada um (pedido de 06/10/2026).
 *
 * Grava por `fn_ranking_quitacao_definir_setor`, que confere a chave
 * `ranking_quitacao_configurar` de novo no banco. Setor sem linha, ou
 * desligado, não tem ranking.
 */
import { useEffect, useState } from 'react';
import { Loader2, Medal } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/lib/supabase';
import { aplicarOrdemSetores } from '@/lib/setores-ordem';
import { COLUNAS_SETOR_DO_FILTRO, setoresDosFiltros } from '@/lib/setoresDosFiltros';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useSetoresDoRanking } from '@/pages/Analitico/RankingQuitacao/useSetoresDoRanking';
import { PREMIOS_PADRAO, definirSetorDoRanking } from '@/services/rankingQuitacao/rankingQuitacao.service';

type Setor = { id: string; nome: string; ativo?: boolean | null; tipo?: string | null };

export default function RankingQuitacaoConfig() {
  const { empresa } = useEmpresa();
  const { setores: configurados, carregando, recarregar } = useSetoresDoRanking(empresa?.id);
  const [setores, setSetores] = useState<Setor[]>([]);
  const [salvando, setSalvando] = useState<string | null>(null);
  // Prêmios sendo editados, por setor (texto do campo, para aceitar «1.000,00» enquanto digita).
  const [rascunho, setRascunho] = useState<Record<string, string[]>>({});

  useEffect(() => {
    if (!empresa?.id) return;
    supabase.from('setores').select(COLUNAS_SETOR_DO_FILTRO).eq('empresa_id', empresa.id).order('nome')
      .then(({ data }) => setSetores(setoresDosFiltros(aplicarOrdemSetores((data as unknown as Setor[] | null) ?? [], empresa.id))));
  }, [empresa?.id]);

  const configDe = (id: string) => configurados.find(c => c.setor_id === id);
  const premiosDe = (id: string) => configDe(id)?.premios ?? [...PREMIOS_PADRAO];

  async function gravar(setorId: string, ativo: boolean, premios?: number[]) {
    if (!empresa?.id) return;
    setSalvando(setorId);
    try {
      await definirSetorDoRanking(empresa.id, setorId, ativo, premios);
      await recarregar();
      return true;
    } catch (e) {
      toast.error('Não foi possível salvar o Ranking de quitação', { description: e instanceof Error ? e.message : undefined });
      return false;
    } finally {
      setSalvando(null);
    }
  }

  async function salvarPremios(setorId: string) {
    const valores = (rascunho[setorId] ?? []).map(v => Number(v.replace(/\./g, '').replace(',', '.')));
    if (valores.length !== 6 || valores.some(v => !Number.isFinite(v) || v < 0)) {
      toast.error('Preencha os seis prêmios com valores em reais.');
      return;
    }
    if (await gravar(setorId, true, valores)) {
      setRascunho(r => { const { [setorId]: _, ...resto } = r; return resto; });
      toast.success('Prêmios salvos');
    }
  }

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Medal className="w-4 h-4 text-primary" /> Ranking de quitação
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground leading-relaxed">
          Os setores ligados ganham a aba Ranking de quitação no Analítico, ao lado do Colchão:
          os 6 que mais quitaram no mês, pelo valor. Os prêmios aparecem em cada posição.
        </p>
        {carregando ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {setores.map(s => {
              const ligado = configDe(s.id)?.ativo === true;
              const editando = rascunho[s.id];
              return (
                <li key={s.id} className="px-3 py-2.5 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm">{s.nome}</span>
                    <div className="flex items-center gap-2">
                      {salvando === s.id && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                      <Switch
                        checked={ligado}
                        disabled={salvando === s.id}
                        onCheckedChange={v => void gravar(s.id, v)}
                        aria-label={`Ranking de quitação no ${s.nome}`}
                      />
                    </div>
                  </div>
                  {ligado && (
                    <div className="flex flex-wrap items-end gap-2">
                      {premiosDe(s.id).map((v, i) => (
                        <label key={i} className="w-[84px] space-y-0.5">
                          <span className="text-[10px] text-muted-foreground">{i + 1}º lugar (R$)</span>
                          <Input
                            inputMode="decimal"
                            className="h-8 text-xs tabular-nums"
                            value={editando ? editando[i] : String(v).replace('.', ',')}
                            onChange={e => setRascunho(r => {
                              const atual = r[s.id] ?? premiosDe(s.id).map(p => String(p).replace('.', ','));
                              const novo = [...atual];
                              novo[i] = e.target.value;
                              return { ...r, [s.id]: novo };
                            })}
                          />
                        </label>
                      ))}
                      {editando && (
                        <Button size="sm" className="h-8" disabled={salvando === s.id} onClick={() => void salvarPremios(s.id)}>
                          Salvar prêmios
                        </Button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
