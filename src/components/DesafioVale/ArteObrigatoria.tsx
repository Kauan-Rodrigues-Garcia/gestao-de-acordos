/**
 * A arte obrigatória do Desafio do Vale (23/11/2026): liberado o desafio, a
 * primeira coisa que cada pessoa vê ao entrar no Gestão é a arte da campanha,
 * e ela só fecha no «Bora pra cima!» — que libera depois de 5 segundos, para
 * dar tempo de ler. Sem X, sem clicar fora, sem Esc.
 *
 * O «Bora pra cima» grava no banco (`fn_desafio_vale_vi`): não volta em outro
 * PC, e entra na contagem de quem viu. Também marca a abertura da gaveta como
 * vista, para a pessoa não ver a mesma arte duas vezes.
 */
import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { toast } from 'sonner';
import { atributosDoTema } from '@/components/DesafioCobranca/temas';
import { PiscaPisca } from '@/components/DesafioCobranca/Enfeites';
import { marcarArteVista, type DesafioVale } from '@/services/desafioVale/desafioVale.service';
import { hojeEmSaoPaulo } from '@/services/desafioCobranca/regras';
import { AberturaVale } from './AberturaVale';
import { useTemaDoVale } from './temasVale';
import '@/components/DesafioCobranca/desafio-cobranca.css';
import './desafio-vale.css';

/** Segundos até o «Bora pra cima!» liberar. */
export const ESPERA_DA_ARTE = 5;

export function ArteObrigatoria({ d, chaveAbertura, onConfirmou, previa = false }: {
  d: DesafioVale;
  /** A chave da abertura da gaveta (localStorage), marcada junto. */
  chaveAbertura: string | null;
  onConfirmou: () => void;
  /** Só para conferir (tela do super_admin): não grava nada. */
  previa?: boolean;
}) {
  const tema = useTemaDoVale();
  const [gravando, setGravando] = useState(false);

  async function confirmar() {
    if (gravando) return;
    setGravando(true);
    try {
      if (!previa) {
        await marcarArteVista(d.id);
        if (chaveAbertura) { try { localStorage.setItem(chaveAbertura, '1'); } catch { /* sem armazenamento */ } }
      }
      onConfirmou();
    } catch {
      // Não prende a pessoa na tela: fecha e tenta de novo na próxima entrada.
      toast.error('Não deu para registrar agora — a arte volta na próxima vez.');
      onConfirmou();
    } finally {
      setGravando(false);
    }
  }

  return (
    <Dialog.Root open onOpenChange={() => { /* só fecha pelo botão */ }}>
      <Dialog.Portal>
        <Dialog.Overlay className="veu-desfocado fixed inset-0 z-[60] bg-black/60 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          aria-describedby={undefined}
          onEscapeKeyDown={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          {...atributosDoTema(tema)}
          className="dc dv dv-arte-obrigatoria fixed left-1/2 top-1/2 z-[60] flex max-h-[94vh] w-[640px] max-w-[calc(100vw-1rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl shadow-2xl outline-none data-[state=open]:animate-in data-[state=open]:zoom-in-95 data-[state=open]:fade-in-0"
        >
          <PiscaPisca largura={640} luzes={22} className="dc-so-natal dc-luzes-topo" />
          <Dialog.Title className="sr-only">{d.titulo} — campanha especial</Dialog.Title>
          <div className="dc-corpo">
            <AberturaVale
              d={d} hoje={hojeEmSaoPaulo()} onEntrar={confirmar}
              rotuloBotao={gravando ? 'Registrando…' : 'Bora pra cima!'} esperaSegundos={ESPERA_DA_ARTE}
            />
            <p className="dv-arte-nota">Ao tocar em «Bora pra cima!» você confirma que leu as regras da campanha.</p>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
