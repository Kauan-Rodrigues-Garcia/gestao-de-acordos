/**
 * Campanhas de WhatsApp — os dois tutoriais do seletor «Abrir no»:
 *
 * • Mesma aba (WhatsApp Web): instalar o Tampermonkey e o script que leva a
 *   conversa para a aba aberta (ver `ponteWhatsapp.ts`).
 * • Trocar aplicativo (app do computador): o site não escolhe o aplicativo —
 *   o link `whatsapp://` vai para o Windows, que pergunta na primeira vez e
 *   lembra. Trocar é nas configurações do Windows.
 */
import { useState, type ReactNode } from 'react';
import { Check, CheckCircle2, Copy, Download, ExternalLink, RefreshCw, Settings } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { copiarTextoSilencioso } from '@/lib/clipboard';
import { LOJA_TAMPERMONKEY, URL_SCRIPT, qualNavegador } from './ponteWhatsapp';

function Passo({ n, feito, children }: { n: number; feito?: boolean; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span
        className={
          'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold '
          + (feito ? 'bg-emerald-600 text-white' : 'bg-primary text-primary-foreground')
        }
      >
        {feito ? <Check className="h-3.5 w-3.5" /> : n}
      </span>
      <div className="min-w-0 flex-1 space-y-2 text-sm">{children}</div>
    </li>
  );
}

function Endereco({ texto }: { texto: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/50 py-0.5 pl-2 pr-0.5 font-mono text-xs">
      {texto}
      <button
        type="button" aria-label={`Copiar ${texto}`}
        className="rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground"
        onClick={async () => {
          if (await copiarTextoSilencioso(texto)) { setCopiado(true); setTimeout(() => setCopiado(false), 2000); }
        }}
      >
        {copiado ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
      </button>
    </span>
  );
}

export function DialogoMesmaAba({ instalado, onFechar }: { instalado: boolean; onFechar: () => void }) {
  const nav = qualNavegador();
  const nomeNav = nav === 'edge' ? 'Edge' : 'Chrome';

  async function copiarCodigo() {
    try {
      const codigo = await (await fetch(URL_SCRIPT)).text();
      if (await copiarTextoSilencioso(codigo)) toast.success('Código copiado.');
      else toast.error('Não foi possível copiar o código.');
    } catch {
      toast.error('Não foi possível copiar o código.');
    }
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onFechar(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>WhatsApp Web sempre na mesma aba</DialogTitle>
          <DialogDescription>
            O WhatsApp não deixa o gestão usar a aba que já está aberta, e por isso cada envio abria uma aba nova.
            Com um ajuste de 2 minutos no navegador, as mensagens passam a abrir sempre na mesma aba.
          </DialogDescription>
        </DialogHeader>

        {instalado ? (
          <div className="space-y-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm">
            <p className="flex items-center gap-2 font-medium text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" /> Tudo certo, já está funcionando.
            </p>
            <p className="text-muted-foreground">
              A primeira mensagem abre o WhatsApp Web. As próximas vão para essa mesma aba, que já abre na conversa.
              Deixe a aba do WhatsApp aberta enquanto envia a campanha.
            </p>
          </div>
        ) : (
          <ol className="space-y-4 py-1">
            <Passo n={1}>
              <p>Instale a extensão <strong>Tampermonkey</strong> no {nomeNav}.</p>
              <Button asChild size="sm" variant="outline" className="gap-1.5">
                <a href={LOJA_TAMPERMONKEY[nav]} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3.5 w-3.5" /> Abrir a loja e clicar em «{nav === 'edge' ? 'Obter' : 'Usar no Chrome'}»
                </a>
              </Button>
            </Passo>
            <Passo n={2}>
              {nav === 'edge' ? (
                <p>
                  Cole <Endereco texto="edge://extensions" /> na barra de endereço e ligue o
                  {' '}<strong>Modo de desenvolvedor</strong> (no canto esquerdo da página).
                </p>
              ) : (
                <p>
                  Cole <Endereco texto="chrome://extensions" /> na barra de endereço. No Tampermonkey, clique em
                  {' '}<strong>Detalhes</strong> e ligue <strong>Permitir scripts do usuário</strong>. Se essa opção não
                  aparecer, ligue o <strong>Modo do desenvolvedor</strong>, no canto superior direito.
                </p>
              )}
            </Passo>
            <Passo n={3}>
              <p>Instale o script do gestão. Vai abrir uma página do Tampermonkey: clique em <strong>Instalar</strong>.</p>
              <div className="flex flex-wrap items-center gap-2">
                <Button asChild size="sm" className="gap-1.5">
                  <a href={URL_SCRIPT} target="_blank" rel="noopener noreferrer">
                    <Download className="h-3.5 w-3.5" /> Instalar o script
                  </a>
                </Button>
                <button
                  type="button" onClick={() => void copiarCodigo()}
                  className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                >
                  Não abriu? Copiar o código
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Se copiar o código: no Tampermonkey, clique em <strong>Criar um novo script</strong>, apague o que
                estiver lá, cole e salve com <strong>Ctrl+S</strong>.
              </p>
            </Passo>
            <Passo n={4}>
              <p>Recarregue esta página e a do WhatsApp Web, se já estiver aberta.</p>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => window.location.reload()}>
                <RefreshCw className="h-3.5 w-3.5" /> Recarregar esta página
              </Button>
            </Passo>
          </ol>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DialogoTrocarApp({ onFechar }: { onFechar: () => void }) {
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onFechar(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Qual aplicativo abre o WhatsApp</DialogTitle>
          <DialogDescription>
            Quem escolhe o aplicativo é o Windows, não o gestão. Você escolhe uma vez, e ele passa a abrir sempre no mesmo.
          </DialogDescription>
        </DialogHeader>

        <ol className="space-y-4 py-1">
          <Passo n={1}>
            <p>
              No primeiro envio, o navegador pergunta <strong>«Abrir WhatsApp?»</strong>. Marque
              {' '}<strong>Sempre permitir</strong> e clique em <strong>Abrir</strong>.
            </p>
          </Passo>
          <Passo n={2}>
            <p>
              Se o computador tiver mais de um (por exemplo WhatsApp e WhatsApp Business), o Windows pergunta qual usar.
              Escolha o que está conectado e marque <strong>Sempre usar este aplicativo</strong>.
            </p>
          </Passo>
        </ol>

        <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-4 text-sm">
          <p className="font-medium">Para trocar depois</p>
          <p className="text-muted-foreground">
            Nas configurações do Windows, abra <strong>Aplicativos padrão</strong>, procure por
            {' '}<Endereco texto="WHATSAPP" /> em <strong>Escolher padrões por tipo de link</strong> e clique no
            aplicativo atual para escolher outro.
          </p>
          <Button asChild size="sm" variant="outline" className="gap-1.5">
            <a href="ms-settings:defaultapps"><Settings className="h-3.5 w-3.5" /> Abrir Aplicativos padrão</a>
          </Button>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
