/**
 * Página de DEMO isolada (dev-only) da leitura de acordo por imagem.
 *
 * Serve o componente real `DropzoneImagensAcordo` SEM login/Supabase, para
 * validar rápido o upload/colar de prints e a extração dos campos (via OCR
 * local, já que a IA ainda não está configurada).
 *
 * Acesse em: http://localhost:8080/demo-visao.html
 * Não entra no build de produção (não está em rollupOptions.input).
 */
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'sonner';
import '../index.css';
import { DropzoneImagensAcordo } from '@/components/acordo-visao/DropzoneImagensAcordo';
import type { DadosExtraidosAcordo } from '@/services/acordo-visao/types';

const CAMPOS: { key: keyof DadosExtraidosAcordo; label: string }[] = [
  { key: 'nr_cliente', label: 'NR' },
  { key: 'vencimento', label: 'Vencimento' },
  { key: 'valor', label: 'Valor (por parcela)' },
  { key: 'parcelas', label: 'Parcelas' },
  { key: 'tipo', label: 'Forma de pagamento' },
  { key: 'status', label: 'Status' },
  { key: 'nome_cliente', label: 'Nome do cliente' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'instituicao', label: 'Instituição' },
];

function Demo() {
  const [dados, setDados] = useState<DadosExtraidosAcordo | null>(null);

  return (
    <div className="dark min-h-screen bg-background text-foreground">
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        <header className="space-y-1">
          <h1 className="text-lg font-bold flex items-center gap-2">
            Demo — Leitura de acordo por imagem
            <span className="text-[10px] font-semibold uppercase tracking-wide bg-amber-500/15 text-amber-500 rounded px-1.5 py-0.5">
              dev
            </span>
          </h1>
          <p className="text-sm text-muted-foreground">
            Preview isolado (sem login). Envie 1+ prints de um acordo BookPlay — os
            campos são preenchidos automaticamente. Sem chave de IA, usa o OCR local.
          </p>
        </header>

        <div className="rounded-lg border border-border bg-card p-4">
          <DropzoneImagensAcordo onDados={setDados} />
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-semibold mb-3">Campos que iriam preencher o formulário</h2>
          {dados ? (
            <>
              <table className="w-full text-sm">
                <tbody>
                  {CAMPOS.map(({ key, label }) => {
                    const v = dados[key];
                    const preenchido = typeof v === 'string' && v.trim() !== '';
                    return (
                      <tr key={key} className="border-b border-border/50 last:border-0">
                        <td className="py-1.5 pr-4 text-muted-foreground w-1/2">{label}</td>
                        <td className={`py-1.5 font-mono ${preenchido ? 'text-foreground' : 'text-muted-foreground/40'}`}>
                          {preenchido ? String(v) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {dados._fonte && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Motor usado: <strong>{dados._fonte === 'ia' ? 'IA de visão' : 'OCR local (Tesseract)'}</strong>
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground/60">Nenhuma leitura ainda.</p>
          )}
        </div>
      </div>
      <Toaster richColors position="top-right" />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Demo />);
