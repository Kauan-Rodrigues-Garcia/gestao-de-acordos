/**
 * CardBancoDeDados — o status da coluna `acordos.instituicao` e o SQL para
 * criá-la quando falta.
 *
 * Morava em Configurações › Geral; foi para Administração › Dados no Mapa de
 * Abas (29/09/2026) — é ferramenta de desenvolvimento, não configuração da
 * empresa. A chave é a mesma, `ver_banco_dados`, e quem confere é a tela que o
 * desenha.
 *
 * Só LÊ: a sonda é um `select … limit(0)`. O SQL é copiado para o editor do
 * Supabase, e rodá-lo é decisão de gente, não deste card.
 */
import { useEffect, useRef, useState } from 'react';
import { Check, CheckCircle2, AlertTriangle, Copy, Database } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { copiarTexto } from '@/lib/clipboard';

const MIGRATION_SQL = `ALTER TABLE public.acordos
  ADD COLUMN IF NOT EXISTS instituicao TEXT;

CREATE INDEX IF NOT EXISTS idx_acordos_instituicao
  ON public.acordos(instituicao)
  WHERE instituicao IS NOT NULL;`;

export default function CardBancoDeDados() {
  const [schemaStatus, setSchemaStatus] = useState<'checking' | 'ok' | 'missing'>('checking');
  const [sqlCopiado, setSqlCopiado] = useState(false);

  useEffect(() => {
    void (async () => {
      const { error } = await supabase.from('acordos').select('instituicao').limit(0);
      setSchemaStatus(!error ? 'ok' : 'missing');
    })();
  }, []);

  // Timer guardado em ref: um setTimeout solto dava setState depois de sair da
  // página.
  const timerCopiadoRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timerCopiadoRef.current) clearTimeout(timerCopiadoRef.current);
  }, []);

  async function copiarSQL() {
    const ok = await copiarTexto(MIGRATION_SQL, 'SQL copiado', 'Não foi possível copiar o SQL.');
    if (!ok) return;
    setSqlCopiado(true);
    if (timerCopiadoRef.current) clearTimeout(timerCopiadoRef.current);
    timerCopiadoRef.current = setTimeout(() => {
      timerCopiadoRef.current = null;
      setSqlCopiado(false);
    }, 3000);
  }

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Database className="w-4 h-4 text-primary" /> Banco de Dados / Migrations
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-start gap-3 p-3 rounded-lg border border-border">
          {schemaStatus === 'checking' && (
            <div className="w-4 h-4 rounded-full border-2 border-muted-foreground border-t-primary animate-spin mt-0.5 flex-shrink-0" />
          )}
          {schemaStatus === 'ok' && (
            <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-500 mt-0.5 flex-shrink-0" />
          )}
          {schemaStatus === 'missing' && (
            <AlertTriangle className="w-4 h-4 text-amber-700 dark:text-amber-500 mt-0.5 flex-shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">
              Coluna <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">acordos.instituicao</code>
              {schemaStatus === 'ok'   && <span className="ml-2 text-xs text-green-600 font-normal">✓ Disponível</span>}
              {schemaStatus === 'missing' && <span className="ml-2 text-xs text-amber-600 font-normal">⚠ Pendente</span>}
            </p>
            {schemaStatus === 'missing' && (
              <div className="mt-2 space-y-2">
                <p className="text-xs text-muted-foreground">
                  A coluna <code className="font-mono">instituicao</code> ainda não existe na tabela.
                  Execute o SQL abaixo no <strong>Supabase Dashboard → SQL Editor</strong>.
                  Até lá, a instituição será salva em "Observações" como fallback.
                </p>
                <div className="relative">
                  <pre className="text-xs bg-muted/60 rounded p-3 font-mono overflow-x-auto whitespace-pre-wrap border border-border">
{MIGRATION_SQL}
                  </pre>
                  <Button
                    size="sm"
                    variant="outline"
                    className="absolute top-2 right-2 h-7 text-xs gap-1.5"
                    onClick={copiarSQL}
                  >
                    {sqlCopiado ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {sqlCopiado ? 'Copiado!' : 'Copiar SQL'}
                  </Button>
                </div>
                <a
                  href="https://supabase.com/dashboard/project/vfrvvoetidtsqbbhdkmj/sql/new"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary underline underline-offset-2"
                >
                  Abrir SQL Editor do projeto →
                </a>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
