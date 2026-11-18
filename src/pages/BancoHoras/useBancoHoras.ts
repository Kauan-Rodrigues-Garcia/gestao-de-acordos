/**
 * Os dados da aba Banco de Horas: os relatórios que a pessoa alcança (a RLS
 * recorta), os vínculos de setor e as fotos do cadastro.
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { normalizar } from '@/lib/bancoHoras/formato';
import {
  ehEstruturaAusente, listarBancoHoras, listarVinculos, type PosicaoBH, type VinculoBH,
} from '@/services/bancoHoras/bancoHoras.service';

export function useBancoHoras(empresaId: string | null, ativo: boolean) {
  const [posicoes, setPosicoes] = useState<PosicaoBH[]>([]);
  const [vinculos, setVinculos] = useState<VinculoBH[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [semEstrutura, setSemEstrutura] = useState(false);

  const recarregar = useCallback(async () => {
    if (!empresaId || !ativo) { setCarregando(false); return; }
    setErro(null);
    try {
      const [p, v] = await Promise.all([listarBancoHoras(empresaId), listarVinculos(empresaId)]);
      setPosicoes(p);
      setVinculos(v);
      setSemEstrutura(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (ehEstruturaAusente(msg)) setSemEstrutura(true); else setErro(msg);
    } finally {
      setCarregando(false);
    }
  }, [empresaId, ativo]);

  useEffect(() => { void recarregar(); }, [recarregar]);

  return { posicoes, vinculos, carregando, erro, semEstrutura, recarregar };
}

/**
 * Fotos do cadastro, pelo nome. Nome repetido no cadastro fica sem foto: melhor
 * a inicial do que o rosto de outra pessoa.
 */
export function useFotosPorNome(empresaId: string | null, ativo: boolean) {
  const [fotos, setFotos] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    if (!empresaId || !ativo) return;
    let cancelado = false;
    void (async () => {
      const m = new Map<string, string>();
      const repetidos = new Set<string>();
      for (let de = 0; de < 10000; de += 1000) {
        const { data, error } = await supabase
          .from('perfis')
          .select('nome, foto_url')
          .eq('empresa_id', empresaId)
          .not('foto_url', 'is', null)
          .range(de, de + 999);
        if (error || !data) break;
        for (const p of data as { nome: string | null; foto_url: string | null }[]) {
          const k = normalizar(p.nome);
          if (!k || !p.foto_url) continue;
          if (m.has(k)) repetidos.add(k); else m.set(k, p.foto_url);
        }
        if (data.length < 1000) break;
      }
      for (const k of repetidos) m.delete(k);
      if (!cancelado) setFotos(m);
    })();
    return () => { cancelado = true; };
  }, [empresaId, ativo]);
  return fotos;
}
