// Os avisos (toasts) do app: Sonner com `richColors`, no canto de cima à
// direita. O `index.css` do app pinta o de sucesso com `--success`.

import { CheckCircle2 } from 'lucide-react';
import { useCurrentFrame } from 'remotion';
import { entre, ms, mola } from '../movimento';
import { APP_L } from './layout';

export type Aviso = { de: number; ate: number; titulo: string; descricao?: string; acao?: string };

export const Avisos: React.FC<{ avisos: Aviso[] }> = ({ avisos }) => {
  const f = useCurrentFrame();
  const visiveis = avisos.filter((a) => f >= a.de && f < a.ate + ms(400));
  return (
    <>
      {visiveis.map((a) => {
        const entra = mola(f, a.de);
        const sai = entre(f, a.ate, a.ate + ms(300), 0, 1);
        return (
          <div
            key={a.de}
            className="absolute flex items-center gap-1.5 rounded-lg border p-4 text-[13px] shadow-lg font-sans"
            style={{
              right: 32,
              top: 32,
              width: 356,
              background: 'var(--success)',
              color: 'var(--success-foreground)',
              borderColor: 'color-mix(in oklch, var(--success) 60%, transparent)',
              opacity: (1 - sai) * Math.min(1, entra * 1.5),
              transform: `translateY(${(1 - entra) * -24 - sai * 10}px) scale(${1 - sai * 0.03})`,
              zIndex: 90,
              maxWidth: APP_L,
            }}
          >
            <CheckCircle2 className="h-4 w-4 shrink-0 self-start mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="font-medium leading-snug">{a.titulo}</div>
              {a.descricao && <div className="mt-0.5 leading-snug opacity-90 text-[12.5px]">{a.descricao}</div>}
            </div>
            {a.acao && (
              <span className="ml-2 shrink-0 rounded px-2 py-1 text-xs font-medium" style={{ background: 'var(--success-foreground)', color: 'var(--success)' }}>
                {a.acao}
              </span>
            )}
          </div>
        );
      })}
    </>
  );
};
