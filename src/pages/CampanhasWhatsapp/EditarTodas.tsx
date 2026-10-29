/**
 * «Editar todas» — o operador reescreve a mensagem da parte dele de uma vez
 * (28/10/2026, migration 20261028160000).
 *
 * Ele mexe no MODELO, o texto com as variáveis ({{nome}}, {{quitacao}}…), e o
 * banco refaz cada pendente com os valores daquele cliente. As enviadas e as
 * que «não deu» não mudam. A prévia mostra o texto montado para o primeiro
 * cliente da fila.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Loader2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { CampaignCore } from '@/pages/CampanhaFacil/lib/campaign-core';
import { VARIABLE_LABELS, insertVariable } from '@/pages/CampanhaFacil/VariaveisMensagem';
import { reaisDuplicados, variaveisDesconhecidas } from '@/pages/CampanhaFacil/detalheDasVariaveis';
import { mensagemUsaValores } from '@/pages/CampanhaFacil/regras-mensagem';
import { CampanhaIndisponivel, meuModelo, type MeuModelo } from './campanhasWhatsapp.service';

const ROTULO = new Map(VARIABLE_LABELS);

/** O que impede salvar, ou avisa antes. `bloqueia` não deixa gravar. */
// eslint-disable-next-line react-refresh/only-export-components -- a regra mora junto do diálogo que a mostra; o teste lê a mesma.
export function avisosDoModelo(texto: string, semValores: boolean): { texto: string; bloqueia: boolean }[] {
  const avisos: { texto: string; bloqueia: boolean }[] = [];
  if (semValores && mensagemUsaValores(texto)) {
    avisos.push({ texto: 'Esta campanha veio do relatório sem valores (245): a mensagem não pode citar valores.', bloqueia: true });
  }
  const desconhecidas = variaveisDesconhecidas(texto);
  if (desconhecidas.length) {
    avisos.push({
      texto: `Variável que não existe: ${desconhecidas.map((v) => `{{${v}}}`).join(', ')}. Ela sairia em branco.`,
      bloqueia: true,
    });
  }
  const reais = reaisDuplicados(texto);
  if (reais.length) {
    avisos.push({
      texto: `${reais.map((v) => `{{${v}}}`).join(', ')} já sai com «R$»: tire o «R$» ou o «,00» em volta.`,
      bloqueia: false,
    });
  }
  return avisos;
}

export function DialogoEditarTodas({ envioId, onFechar, onSalvar }: {
  envioId: string;
  onFechar: () => void;
  /** `null` volta ao modelo do líder. `true` = gravou. */
  onSalvar: (modelo: string | null) => Promise<boolean>;
}) {
  const [dados, setDados] = useState<MeuModelo | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  const [texto, setTexto] = useState('');
  const [salvando, setSalvando] = useState(false);
  const caixa = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let vivo = true;
    meuModelo(envioId)
      .then((d) => { if (vivo) { setDados(d); setTexto(d.modelo ?? ''); } })
      .catch((err) => {
        if (!vivo) return;
        setFalha(err instanceof CampanhaIndisponivel ? err.message : 'Não foi possível abrir a mensagem desta campanha.');
      });
    return () => { vivo = false; };
  }, [envioId]);

  const exemplo = useMemo(() => dados?.exemplo ?? {}, [dados]);
  // Só as variáveis que este cliente tem preenchidas: são as que a campanha
  // sabe escrever (no 245, as de valor vêm vazias).
  const chips = useMemo(
    () => Object.keys(exemplo).filter((k) => ROTULO.has(k) && exemplo[k] !== '').map((k) => [k, ROTULO.get(k)!] as const),
    [exemplo],
  );
  const previa = useMemo(() => CampaignCore.renderTemplate(texto, exemplo), [texto, exemplo]);
  const avisos = useMemo(() => avisosDoModelo(texto, !!dados?.sem_valores), [texto, dados?.sem_valores]);
  const bloqueado = avisos.some((a) => a.bloqueia);
  const mudou = !!dados && texto.trim() !== (dados.modelo ?? '').trim();
  const semModelo = !!dados && !dados.modelo_lider;

  async function salvar(modelo: string | null) {
    setSalvando(true);
    try { if (await onSalvar(modelo)) onFechar(); } finally { setSalvando(false); }
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v && !salvando) onFechar(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Editar todas as mensagens</DialogTitle>
          <DialogDescription>
            Muda as {dados ? dados.pendentes.toLocaleString('pt-BR') : '…'} mensagens pendentes desta campanha, cada uma
            com os dados do seu cliente — inclusive as que você editou uma a uma. As enviadas não mudam.
          </DialogDescription>
        </DialogHeader>

        {falha ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{falha}</p>
        ) : !dados ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Abrindo a mensagem…
          </div>
        ) : semModelo ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Esta campanha é antiga e não guardou a mensagem com as variáveis. Dá para editar uma por vez.
          </p>
        ) : (
          <div className="space-y-3">
            {chips.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {chips.map(([k, rotulo]) => (
                  <button
                    key={k} type="button"
                    onClick={() => insertVariable(caixa, texto, setTexto, k)}
                    className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    title={`Inserir {{${k}}}`}
                  >
                    {rotulo}
                  </button>
                ))}
              </div>
            )}
            <Textarea
              ref={caixa} value={texto} onChange={(e) => setTexto(e.target.value)}
              rows={9} className="resize-y font-mono text-xs leading-relaxed" autoFocus
              aria-label="Mensagem com as variáveis"
            />
            {avisos.map((a) => (
              <p key={a.texto} className={a.bloqueia ? 'flex gap-1.5 text-xs text-destructive' : 'flex gap-1.5 text-xs text-amber-600 dark:text-amber-400'}>
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {a.texto}
              </p>
            ))}
            {dados.pendentes_sem_variaveis > 0 && (
              <p className="text-xs text-muted-foreground">
                {dados.pendentes_sem_variaveis.toLocaleString('pt-BR')} pendentes não guardaram os dados do cliente e ficam como estão.
              </p>
            )}
            <div className="space-y-1">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Como fica para o primeiro cliente da fila</p>
              <div className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-md border bg-muted/40 p-3 text-sm leading-relaxed">
                {previa.trim() || <span className="text-muted-foreground">A mensagem está vazia.</span>}
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          {dados?.personalizado ? (
            <Button variant="ghost" className="gap-1.5" disabled={salvando} onClick={() => void salvar(null)}>
              <RotateCcw className="h-4 w-4" /> Voltar à do líder
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="outline" disabled={salvando} onClick={onFechar}>Cancelar</Button>
            <Button
              disabled={salvando || !dados || semModelo || !!falha || !mudou || !texto.trim() || bloqueado || dados.pendentes === 0}
              onClick={() => void salvar(texto)}
            >
              {salvando ? 'Salvando…' : 'Salvar em todas'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
