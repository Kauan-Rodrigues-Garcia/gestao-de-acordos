import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Bot, Save, Settings2, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { fetchAIConfig, saveAIConfig, type AIConfigInput } from '@/services/aiConfig.service';

const DEFAULT_PROMPT = `Você é um assistente especializado em normalizar dados de acordos financeiros importados de planilhas Excel brasileiras.

FORMATOS DE PLANILHA QUE VOCÊ DEVE RECONHECER:

1. BLOCOS POR DATA (mais comum):
   - Uma linha contém APENAS uma data no formato brasileiro DD/MM ou DD/MM/YYYY (ex: "01/02", "03/02/2025") — essa é a DATA DE VENCIMENTO do bloco
   - Logo abaixo pode haver uma linha de cabeçalho repetida (NR, VALOR, WHATS, STATUS, etc.) — IGNORE essa linha
   - As linhas seguintes são os acordos/clientes que pertencem a essa data de vencimento
   - Use a data do bloco como "vencimento" para TODOS os registros abaixo dela, até encontrar a próxima linha de data
   - Se a data tem apenas DD/MM (sem ano), use o ano da referência "hoje" fornecida; em caso de virada de ano (data DD/MM anterior a "hoje" mas em contexto de vencimento futuro), prefira o ano seguinte

2. TABELA CONTÍNUA:
   - Uma linha de cabeçalho no topo com nomes de colunas
   - Todas as linhas abaixo são dados

REGRAS DE EXTRAÇÃO:
- Responda APENAS com JSON válido: {"records":[...], "notes":[...]}
- Cada record: linhaOriginal (number), nome_cliente (string|null), nr_cliente (string|null), vencimento (YYYY-MM-DD|null), valor (number|null), whatsapp (string|null), status (string|null), tipo (string|null), parcelas (number|null), observacoes (string|null), instituicao (string|null)
- Se um campo não estiver claro, use null — NÃO invente dados
- status: preferir pendente, pago, verificar, vencido, cancelado, em_acompanhamento
- tipo: preferir boleto, pix, cartao. Textos como "PIX AUTO" ou "RECORRENTE" podem indicar tipo ou ir para observacoes
- valor: número decimal (ex: 1234.56). Converter "R$ 266,66" → 266.66
- whatsapp: manter formato original com DDD, ex: (93)99158-1981
- Linhas de cabeçalho (NR, VALOR, WHATS, STATUS) e linhas vazias devem ser IGNORADAS, não gerar records
- Linhas que contêm APENAS uma data são marcadores de bloco — não gerar record para elas, apenas usar como vencimento`;

export default function AdminIA() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<AIConfigInput>({
    enabled: false,
    model: 'gpt-4o-mini',
    temperature: 0.2,
    max_rows: 120,
    max_cols: 20,
    prompt_system: DEFAULT_PROMPT,
  });

  const tempText = useMemo(() => String(form.temperature ?? 0.2), [form.temperature]);

  useEffect(() => {
    (async () => {
      try {
        const cfg = await fetchAIConfig();
        if (cfg) {
          setForm({
            enabled: cfg.enabled,
            model: cfg.model,
            temperature: Number(cfg.temperature),
            max_rows: Number(cfg.max_rows),
            max_cols: Number(cfg.max_cols),
            prompt_system: cfg.prompt_system || DEFAULT_PROMPT,
          });
        }
      } catch (e) {
        toast.error('Erro ao carregar configurações de IA');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function salvar() {
    setSaving(true);
    try {
      const t = Number(form.temperature);
      if (!Number.isFinite(t) || t < 0 || t > 2) {
        toast.error('Temperatura inválida (0 a 2)');
        return;
      }
      if (!form.model?.trim()) {
        toast.error('Informe o modelo');
        return;
      }
      if (form.max_rows < 10 || form.max_rows > 200) {
        toast.error('max_rows deve estar entre 10 e 200');
        return;
      }
      if (form.max_cols < 5 || form.max_cols > 30) {
        toast.error('max_cols deve estar entre 5 e 30');
        return;
      }

      await saveAIConfig({
        enabled: form.enabled,
        model: form.model.trim(),
        temperature: t,
        max_rows: Math.trunc(form.max_rows),
        max_cols: Math.trunc(form.max_cols),
        prompt_system: form.prompt_system?.trim() || DEFAULT_PROMPT,
      });
      toast.success('Configurações de IA salvas!');
    } catch (e) {
      toast.error('Erro ao salvar configurações de IA');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Bot className="w-5 h-5 text-primary" /> IA (OpenAI)
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Configuração do organizador inteligente de dados na importação
          </p>
        </div>
        <Button onClick={salvar} disabled={loading || saving} className="gap-2">
          <Save className="w-4 h-4" />
          {saving ? 'Salvando...' : 'Salvar'}
        </Button>
      </div>

      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Settings2 className="w-4 h-4 text-primary" /> Configurações
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between gap-3 p-3 border border-border rounded-lg">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Ativar IA na Importação</p>
              <p className="text-xs text-muted-foreground">
                Quando ativado, a tela de Importação pode organizar colunas/linhas com ajuda de IA.
              </p>
            </div>
            <Switch
              checked={form.enabled}
              onCheckedChange={(v) => setForm((p) => ({ ...p, enabled: v }))}
              disabled={loading}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Modelo</Label>
              <Input
                value={form.model}
                onChange={(e) => setForm((p) => ({ ...p, model: e.target.value }))}
                placeholder="gpt-4o-mini"
                className="h-9 text-sm font-mono"
                disabled={loading}
              />
              <p className="text-[11px] text-muted-foreground">
                Recomenda-se um modelo rápido e econômico para importação.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Temperatura (0 a 2)</Label>
              <Input
                value={tempText}
                onChange={(e) => setForm((p) => ({ ...p, temperature: Number(e.target.value) }))}
                placeholder="0.2"
                className="h-9 text-sm font-mono"
                disabled={loading}
              />
              <p className="text-[11px] text-muted-foreground">
                Quanto menor, mais consistente a organização dos dados.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Máx. linhas analisadas</Label>
              <Input
                type="number"
                min={10}
                max={200}
                value={form.max_rows}
                onChange={(e) => setForm((p) => ({ ...p, max_rows: Number(e.target.value) }))}
                className="h-9 text-sm font-mono"
                disabled={loading}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Máx. colunas analisadas</Label>
              <Input
                type="number"
                min={5}
                max={30}
                value={form.max_cols}
                onChange={(e) => setForm((p) => ({ ...p, max_cols: Number(e.target.value) }))}
                className="h-9 text-sm font-mono"
                disabled={loading}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-medium">Prompt do sistema</Label>
            <Textarea
              value={form.prompt_system}
              onChange={(e) => setForm((p) => ({ ...p, prompt_system: e.target.value }))}
              className="text-sm min-h-[320px] font-mono"
              disabled={loading}
            />
            <div className="flex items-start gap-2 text-xs text-muted-foreground">
              <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
              <p>
                Não coloque chaves de API aqui. A chave da OpenAI deve ficar em Secrets do Supabase para a Edge Function.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {!loading && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4 text-xs text-muted-foreground">
          Para habilitar a IA em produção, configure a secret <strong>OPENAI_API_KEY</strong> no Supabase e publique a função
          <strong> ai-normalize-import</strong>.
        </motion.div>
      )}
    </div>
  );
}

