/**
 * AfastamentosDaPessoa — o histórico de afastamentos na ficha (aba Usuários).
 *
 * Mostra o que está em curso, o que vem pela frente e o que já passou, com
 * quem lançou. «Encerrar» é «a pessoa voltou»: o último dia vira ontem, e o
 * que ainda não começou sai (`fn_usuarios_encerrar_afastamento`).
 */
import { useEffect, useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { getTodayISO } from '@/lib/index';
import { rotuloDoPeriodo, FIM_SEM_VOLTA } from '@/lib/ausencias';
import { buscarAfastamentos, encerrarAfastamento, type Afastamento } from '@/services/afastamentos.service';
import { motivoDoTipo } from './afastamento';

interface Props {
  operadorId: string;
  empresaId: string;
  podeAgir: boolean;
  /** Sobe quando algo fora daqui muda a situação: relê. */
  versao: number;
  onAfastar: () => void;
  /** Encerrou um afastamento: a tela recarrega situação e etiquetas. */
  onMudou: () => void;
}

export function AfastamentosDaPessoa({ operadorId, empresaId, podeAgir, versao, onAfastar, onMudou }: Props) {
  const [lista, setLista] = useState<Afastamento[] | null>(null);
  const [encerrando, setEncerrando] = useState<string | null>(null);
  const hoje = getTodayISO();

  useEffect(() => {
    let vivo = true;
    setLista(null);
    void buscarAfastamentos(empresaId, operadorId).then(r => { if (vivo) setLista(r.dado ?? []); });
    return () => { vivo = false; };
  }, [operadorId, empresaId, versao]);

  async function encerrar(a: Afastamento) {
    setEncerrando(a.id);
    try {
      const r = await encerrarAfastamento(a.id);
      if (!r.ok) { toast.error(r.erro ?? 'Não foi possível encerrar.'); return; }
      toast.success(a.inicio >= hoje ? `${a.rotulo} cancelado.` : `${a.rotulo} encerrado: a pessoa volta hoje.`);
      onMudou();
    } finally { setEncerrando(null); }
  }

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="us-rot">Afastamentos</h3>
        {podeAgir && (
          <button type="button" className="us-link inline-flex items-center gap-1" onClick={onAfastar}>
            <Plus className="h-3 w-3" />afastar
          </button>
        )}
      </div>
      {lista === null ? (
        <p className="text-xs text-muted-foreground">Carregando…</p>
      ) : lista.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum afastamento lançado.</p>
      ) : (
        <ul className="grid gap-2">
          {lista.map(a => {
            const fimBanco = a.fim ?? FIM_SEM_VOLTA;
            const estado = fimBanco < hoje ? 'encerrado' : a.inicio > hoje ? 'marcado' : 'em curso';
            const nome = a.tipo === 'outros' ? (a.observacao || 'Outro motivo') : (motivoDoTipo(a.tipo)?.rotulo ?? a.rotulo);
            return (
              <li key={a.id} className="rounded-lg border border-border px-3 py-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {nome}
                      <span className={estado === 'em curso' ? 'ml-1.5 text-xs font-semibold text-info' : 'ml-1.5 text-xs text-muted-foreground'}>
                        · {estado}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {rotuloDoPeriodo({ inicio: a.inicio, fim: fimBanco, meio_periodo: false })}
                      {a.fora_das_contas ? ' · fora dos rankings e quartis' : ' · aparece nos rankings'}
                    </p>
                    {a.observacao && a.tipo !== 'outros' && (
                      <p className="mt-0.5 text-xs italic text-muted-foreground">«{a.observacao}»</p>
                    )}
                    {a.criado_por_nome && (
                      <p className="mt-0.5 text-[11px] text-muted-foreground/80">lançado por {a.criado_por_nome}</p>
                    )}
                  </div>
                  {podeAgir && estado !== 'encerrado' && (
                    <Button size="sm" variant="outline" className="h-7 shrink-0 text-xs"
                      disabled={encerrando === a.id} onClick={() => void encerrar(a)}>
                      {encerrando === a.id && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                      {estado === 'marcado' ? 'Cancelar' : 'Encerrar'}
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
