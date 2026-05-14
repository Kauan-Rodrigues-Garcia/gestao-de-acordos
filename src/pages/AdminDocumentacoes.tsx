import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Shield, FileText, Users, Archive, AlertTriangle, ClipboardCheck,
  Pencil, Save, X, Printer, Eye, ChevronRight,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { supabase } from '@/lib/supabase';
import type { DocumentoLgpd, TipoDocumentoLgpd } from '@/lib/supabase';
import { toast } from 'sonner';
import { useEmpresa } from '@/hooks/useEmpresa';

// ── Metadados dos 6 tipos de documento ──────────────────────
const TIPO_META: Record<TipoDocumentoLgpd, {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  desc: string;
}> = {
  politica_privacidade: {
    label: 'Política de Privacidade',
    icon: Shield,
    desc: 'Base legal, dados coletados, finalidade, retenção, direitos dos titulares.',
  },
  ropa: {
    label: 'ROPA — Registro de Operações',
    icon: FileText,
    desc: 'Tabela de operações de tratamento (Art. 37, LGPD).',
  },
  aviso_privacidade_interno: {
    label: 'Aviso de Privacidade Interno',
    icon: Users,
    desc: 'Diretrizes de privacidade para operadores e líderes.',
  },
  politica_retencao_descarte: {
    label: 'Política de Retenção e Descarte',
    icon: Archive,
    desc: 'Prazos de guarda e procedimentos de descarte de dados.',
  },
  plano_resposta_incidentes: {
    label: 'Plano de Resposta a Incidentes',
    icon: AlertTriangle,
    desc: 'Procedimentos em caso de vazamento ou acesso não autorizado.',
  },
  termo_responsabilidade_operador: {
    label: 'Termo de Responsabilidade do Operador',
    icon: ClipboardCheck,
    desc: 'Obrigações de confidencialidade e uso aceitável pelos operadores.',
  },
};

function incrementarVersao(versao: string): string {
  const parts = versao.split('.');
  const minor = parseInt(parts[1] ?? '0', 10) + 1;
  return `${parts[0]}.${minor}`;
}

function formatarData(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
}

function exportarPDF(doc: DocumentoLgpd) {
  const win = window.open('', '_blank', 'width=820,height=680');
  if (!win) {
    toast.error('Permita pop-ups para exportar PDF');
    return;
  }
  const conteudoEscapado = doc.conteudo
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  win.document.write(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>${doc.titulo}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: 'Times New Roman', serif; font-size: 12pt; line-height: 1.7;
           margin: 0; padding: 2cm; color: #000; background: #fff; }
    h1 { font-size: 15pt; text-align: center; margin-bottom: 6pt; }
    .meta { text-align: center; font-size: 9pt; color: #555; margin-bottom: 20pt; }
    hr { margin: 14pt 0; border: none; border-top: 1px solid #999; }
    pre { font-family: inherit; white-space: pre-wrap; font-size: 11pt; margin: 0; }
    .aviso { margin-top: 28pt; padding: 10pt; border: 1px solid #ccc;
             font-size: 9pt; color: #555; font-style: italic; }
    @media print {
      body { padding: 1.5cm; }
      .aviso { page-break-before: avoid; }
    }
  </style>
</head>
<body>
  <h1>${doc.titulo}</h1>
  <div class="meta">Versão ${doc.versao} | Atualizado em ${formatarData(doc.atualizado_em)}</div>
  <hr/>
  <pre>${conteudoEscapado}</pre>
  <div class="aviso">
    Rascunho técnico. Recomenda-se validação jurídica antes do uso oficial.
  </div>
  <script>window.addEventListener('load', () => window.print());</script>
</body>
</html>`);
  win.document.close();
}

// ── Componente principal ─────────────────────────────────────
export default function AdminDocumentacoes() {
  const { empresa } = useEmpresa();

  const [docs, setDocs] = useState<Record<TipoDocumentoLgpd, DocumentoLgpd | null>>({
    politica_privacidade: null,
    ropa: null,
    aviso_privacidade_interno: null,
    politica_retencao_descarte: null,
    plano_resposta_incidentes: null,
    termo_responsabilidade_operador: null,
  });
  const [loading, setLoading] = useState(true);

  // Modal de visualização/edição
  const [modalDoc, setModalDoc] = useState<DocumentoLgpd | null>(null);
  const [modoEdicao, setModoEdicao] = useState(false);
  const [rascunho, setRascunho] = useState('');
  const [saving, setSaving] = useState(false);

  async function carregarDocumentos() {
    if (!empresa?.id) return;
    setLoading(true);

    const { data, error } = await supabase
      .from('documentos_lgpd')
      .select('*')
      .or(`empresa_id.is.null,empresa_id.eq.${empresa.id}`)
      .order('empresa_id', { nullsFirst: false });

    if (error) {
      toast.error('Erro ao carregar documentos');
      setLoading(false);
      return;
    }

    // Deduplicar por tipo: preferir doc da empresa sobre global
    const mapa = {} as Record<TipoDocumentoLgpd, DocumentoLgpd | null>;
    for (const d of (data as DocumentoLgpd[])) {
      const tipo = d.tipo as TipoDocumentoLgpd;
      if (!mapa[tipo] || d.empresa_id !== null) {
        mapa[tipo] = d;
      }
    }

    setDocs(prev => ({ ...prev, ...mapa }));
    setLoading(false);
  }

  useEffect(() => { carregarDocumentos(); }, [empresa?.id]);

  function abrirVisualizacao(doc: DocumentoLgpd) {
    setModalDoc(doc);
    setModoEdicao(false);
    setRascunho(doc.conteudo);
  }

  function entrarEdicao() {
    if (!modalDoc) return;
    setRascunho(modalDoc.conteudo);
    setModoEdicao(true);
  }

  async function salvarEdicao() {
    if (!modalDoc || !empresa?.id) return;
    setSaving(true);

    const novaVersao = incrementarVersao(modalDoc.versao);

    if (modalDoc.empresa_id === null) {
      // Cria versão personalizada para a empresa
      const { error } = await supabase.from('documentos_lgpd').insert({
        empresa_id: empresa.id,
        tipo: modalDoc.tipo,
        titulo: modalDoc.titulo,
        conteudo: rascunho,
        versao: novaVersao,
      });
      if (error) { toast.error(`Erro: ${error.message}`); setSaving(false); return; }
    } else {
      // Atualiza versão personalizada existente
      const { error } = await supabase
        .from('documentos_lgpd')
        .update({ conteudo: rascunho, versao: novaVersao })
        .eq('id', modalDoc.id);
      if (error) { toast.error(`Erro: ${error.message}`); setSaving(false); return; }
    }

    toast.success(`Documento salvo como v${novaVersao}`);
    setSaving(false);
    setModoEdicao(false);
    setModalDoc(null);
    await carregarDocumentos();
  }

  const tiposOrdenados = Object.keys(TIPO_META) as TipoDocumentoLgpd[];

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">

      {/* Grid de cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {tiposOrdenados.map(tipo => {
          const doc = docs[tipo];
          const meta = TIPO_META[tipo];
          const Icon = meta.icon;
          const personalizado = doc?.empresa_id !== null && doc?.empresa_id !== undefined;

          return (
            <motion.div
              key={tipo}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
            >
              <Card className="border-border hover:border-primary/30 transition-colors h-full flex flex-col">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Icon className="w-4 h-4 text-primary" />
                      </div>
                      <CardTitle className="text-xs font-semibold leading-snug line-clamp-2">
                        {meta.label}
                      </CardTitle>
                    </div>
                    <Badge
                      variant="outline"
                      className={personalizado
                        ? 'text-xs flex-shrink-0 border-violet-500/40 text-violet-600'
                        : 'text-xs flex-shrink-0 border-muted-foreground/30 text-muted-foreground'}
                    >
                      {personalizado ? 'Personalizado' : 'Padrão'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 flex flex-col flex-1 justify-between gap-3">
                  <p className="text-xs text-muted-foreground leading-relaxed">{meta.desc}</p>

                  {doc ? (
                    <div className="space-y-2">
                      <p className="text-[11px] text-muted-foreground/70">
                        v{doc.versao} · Atualizado em {formatarData(doc.atualizado_em)}
                      </p>
                      <div className="flex gap-1.5 flex-wrap">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1.5 flex-1"
                          onClick={() => abrirVisualizacao(doc)}
                        >
                          <Eye className="w-3 h-3" /> Ver
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs gap-1.5"
                          title="Exportar PDF"
                          onClick={() => exportarPDF(doc)}
                        >
                          <Printer className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground/60">
                      {loading ? (
                        <span>Carregando...</span>
                      ) : (
                        <span>Documento não encontrado no banco.</span>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Rodapé com aviso legal */}
      <p className="text-xs text-muted-foreground/70 text-center border-t border-border pt-4">
        Estes documentos são rascunhos técnicos. Recomenda-se validação jurídica antes de uso oficial.
      </p>

      {/* Modal de visualização/edição */}
      <Dialog
        open={!!modalDoc}
        onOpenChange={o => { if (!o && !saving) { setModalDoc(null); setModoEdicao(false); } }}
      >
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col gap-4">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center gap-2 text-base">
              {modalDoc && (() => {
                const Icon = TIPO_META[modalDoc.tipo as TipoDocumentoLgpd]?.icon ?? FileText;
                return <Icon className="w-4 h-4 text-primary flex-shrink-0" />;
              })()}
              {modalDoc?.titulo}
            </DialogTitle>
            <DialogDescription className="flex items-center gap-2 text-xs">
              {modalDoc && (
                <>
                  v{modoEdicao ? incrementarVersao(modalDoc.versao) : modalDoc.versao}
                  <span className="text-muted-foreground/40">·</span>
                  <Badge variant="outline" className={
                    modalDoc.empresa_id !== null
                      ? 'text-[10px] border-violet-500/40 text-violet-600'
                      : 'text-[10px] border-muted-foreground/30 text-muted-foreground'
                  }>
                    {modalDoc.empresa_id !== null ? 'Personalizado' : 'Padrão'}
                  </Badge>
                  {modoEdicao && (
                    <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-600">
                      Em edição
                    </Badge>
                  )}
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {/* Conteúdo */}
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col gap-3">
            {modoEdicao ? (
              <Textarea
                value={rascunho}
                onChange={e => setRascunho(e.target.value)}
                className="flex-1 text-xs font-mono resize-none min-h-0"
                style={{ height: '50vh' }}
              />
            ) : (
              <div className="flex-1 overflow-y-auto border border-border rounded-md p-4 text-xs leading-relaxed whitespace-pre-wrap font-mono bg-muted/20 min-h-0" style={{ maxHeight: '56vh' }}>
                {modalDoc?.conteudo}
              </div>
            )}
          </div>

          {/* Ações do modal */}
          <div className="flex-shrink-0 flex items-center justify-between gap-2 pt-2 border-t border-border">
            <div className="flex gap-2">
              {!modoEdicao && modalDoc && (
                <>
                  <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs" onClick={entrarEdicao}>
                    <Pencil className="w-3 h-3" /> Editar
                  </Button>
                  <Button size="sm" variant="ghost" className="gap-1.5 h-8 text-xs" onClick={() => exportarPDF(modalDoc)}>
                    <Printer className="w-3 h-3" /> Exportar PDF
                  </Button>
                </>
              )}
            </div>
            <div className="flex gap-2">
              {modoEdicao ? (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="gap-1.5 h-8 text-xs"
                    onClick={() => setModoEdicao(false)}
                    disabled={saving}
                  >
                    <X className="w-3 h-3" /> Cancelar
                  </Button>
                  <Button
                    size="sm"
                    className="gap-1.5 h-8 text-xs"
                    onClick={salvarEdicao}
                    disabled={saving || !rascunho.trim()}
                  >
                    <Save className="w-3 h-3" />
                    {saving ? 'Salvando...' : 'Salvar nova versão'}
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 h-8 text-xs"
                  onClick={() => { setModalDoc(null); setModoEdicao(false); }}
                >
                  <ChevronRight className="w-3 h-3" /> Fechar
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
