-- =============================================================
-- LGPD: documentos_lgpd + termos_uso + aceites_termo + seeds
-- =============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. TABELA: documentos_lgpd
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.documentos_lgpd (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    UUID        REFERENCES public.empresas(id) ON DELETE CASCADE,
  tipo          TEXT        NOT NULL CHECK (tipo IN (
    'politica_privacidade',
    'ropa',
    'aviso_privacidade_interno',
    'politica_retencao_descarte',
    'plano_resposta_incidentes',
    'termo_responsabilidade_operador'
  )),
  titulo        TEXT        NOT NULL,
  conteudo      TEXT        NOT NULL,
  versao        TEXT        NOT NULL DEFAULT '1.0',
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Um doc global (empresa_id NULL) por tipo
CREATE UNIQUE INDEX IF NOT EXISTS idx_doc_lgpd_tipo_global
  ON public.documentos_lgpd (tipo)
  WHERE empresa_id IS NULL;

-- Um doc personalizado por empresa + tipo
CREATE UNIQUE INDEX IF NOT EXISTS idx_doc_lgpd_tipo_empresa
  ON public.documentos_lgpd (empresa_id, tipo)
  WHERE empresa_id IS NOT NULL;

-- Trigger atualizado_em
CREATE OR REPLACE FUNCTION public.fn_doc_lgpd_set_atualizado()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.atualizado_em = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_doc_lgpd_atualizado ON public.documentos_lgpd;
CREATE TRIGGER trg_doc_lgpd_atualizado
  BEFORE UPDATE ON public.documentos_lgpd
  FOR EACH ROW EXECUTE FUNCTION public.fn_doc_lgpd_set_atualizado();

-- RLS
ALTER TABLE public.documentos_lgpd ENABLE ROW LEVEL SECURITY;

-- Apenas administradores leem (global ou da própria empresa)
CREATE POLICY "doc_lgpd_select" ON public.documentos_lgpd
  FOR SELECT USING (
    auth.role() = 'authenticated'
    AND public.fn_user_has_any_role(ARRAY['administrador','super_admin'])
    AND (empresa_id IS NULL OR public.fn_can_access_empresa(empresa_id))
  );

-- Admins inserem apenas docs da própria empresa (não globais)
CREATE POLICY "doc_lgpd_insert" ON public.documentos_lgpd
  FOR INSERT WITH CHECK (
    empresa_id IS NOT NULL
    AND public.fn_can_access_empresa(empresa_id)
    AND public.fn_user_has_any_role(ARRAY['administrador','super_admin'])
  );

-- Admins atualizam apenas docs da própria empresa
CREATE POLICY "doc_lgpd_update" ON public.documentos_lgpd
  FOR UPDATE
  USING (
    empresa_id IS NOT NULL
    AND public.fn_can_access_empresa(empresa_id)
    AND public.fn_user_has_any_role(ARRAY['administrador','super_admin'])
  )
  WITH CHECK (
    empresa_id IS NOT NULL
    AND public.fn_can_access_empresa(empresa_id)
    AND public.fn_user_has_any_role(ARRAY['administrador','super_admin'])
  );

-- ─────────────────────────────────────────────────────────────
-- 2. TABELA: termos_uso
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.termos_uso (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID        NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  versao     TEXT        NOT NULL,
  titulo     TEXT        NOT NULL,
  conteudo   TEXT        NOT NULL,
  ativo      BOOLEAN     NOT NULL DEFAULT FALSE,
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Garante somente 1 termo ativo por empresa (trigger único ativo)
CREATE UNIQUE INDEX IF NOT EXISTS idx_termos_uso_ativo_empresa
  ON public.termos_uso (empresa_id)
  WHERE ativo = TRUE;

ALTER TABLE public.termos_uso ENABLE ROW LEVEL SECURITY;

-- Qualquer usuário autenticado da empresa pode ler o termo (necessário para o modal de aceite)
CREATE POLICY "termos_uso_select" ON public.termos_uso
  FOR SELECT USING (
    public.fn_can_access_empresa(empresa_id)
  );

CREATE POLICY "termos_uso_insert" ON public.termos_uso
  FOR INSERT WITH CHECK (
    public.fn_can_access_empresa(empresa_id)
    AND public.fn_user_has_any_role(ARRAY['administrador','super_admin'])
  );

CREATE POLICY "termos_uso_update" ON public.termos_uso
  FOR UPDATE
  USING (
    public.fn_can_access_empresa(empresa_id)
    AND public.fn_user_has_any_role(ARRAY['administrador','super_admin'])
  )
  WITH CHECK (
    public.fn_can_access_empresa(empresa_id)
    AND public.fn_user_has_any_role(ARRAY['administrador','super_admin'])
  );

-- ─────────────────────────────────────────────────────────────
-- 3. TABELA: aceites_termo
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.aceites_termo (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  termo_id   UUID        NOT NULL REFERENCES public.termos_uso(id) ON DELETE CASCADE,
  aceito_em  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip         TEXT,
  user_agent TEXT,
  UNIQUE (usuario_id, termo_id)
);

CREATE INDEX IF NOT EXISTS idx_aceites_termo_usuario
  ON public.aceites_termo (usuario_id);

CREATE INDEX IF NOT EXISTS idx_aceites_termo_termo
  ON public.aceites_termo (termo_id);

ALTER TABLE public.aceites_termo ENABLE ROW LEVEL SECURITY;

-- Usuário vê os próprios aceites
CREATE POLICY "aceites_select_own" ON public.aceites_termo
  FOR SELECT USING (auth.uid() = usuario_id);

-- Admin vê todos os aceites (auditoria de conformidade)
CREATE POLICY "aceites_select_admin" ON public.aceites_termo
  FOR SELECT USING (
    public.fn_user_has_any_role(ARRAY['administrador','super_admin'])
  );

-- Qualquer usuário autenticado pode registrar o próprio aceite
CREATE POLICY "aceites_insert_own" ON public.aceites_termo
  FOR INSERT WITH CHECK (auth.uid() = usuario_id);

-- ─────────────────────────────────────────────────────────────
-- 4. SEEDS: 6 Documentos LGPD (empresa_id NULL = padrão global)
-- ─────────────────────────────────────────────────────────────

INSERT INTO public.documentos_lgpd (tipo, titulo, conteudo, versao) VALUES

-- ── Documento 1: Política de Privacidade ──
('politica_privacidade', 'Política de Privacidade', $POL$POLÍTICA DE PRIVACIDADE — AcordosPRO
Versão 1.0 | Vigência: Maio de 2026

1. IDENTIFICAÇÃO DO CONTROLADOR

O AcordosPRO é um sistema de gestão de acordos operado pela empresa contratante (Controlador). O contato para exercício de direitos dos titulares deve ser feito com o administrador do sistema ou com o Encarregado de Dados (DPO) designado pela empresa.

2. DADOS PESSOAIS TRATADOS

O sistema coleta e armazena exclusivamente:
- Nome completo do devedor/profissional associado ao acordo;
- Número de WhatsApp do devedor/profissional.

NÃO são coletados: CPF, RG, endereço, e-mail pessoal, dados bancários, dados de saúde ou qualquer outra categoria de dado pessoal além dos listados acima.

O código de inscrição/NR é um identificador interno da empresa contratante, sem vínculo direto com pessoa física.

3. FINALIDADE DO TRATAMENTO

Os dados são utilizados exclusivamente para:
a) Formalização e gestão de acordos de pagamento;
b) Comunicação via WhatsApp sobre vencimentos, confirmações e atualizações de status;
c) Controle interno, auditoria e cumprimento de obrigações legais e contratuais.

4. BASE LEGAL (ART. 7º, LGPD)

- Execução de contrato (Art. 7º, V): dados necessários para formalização dos acordos;
- Legítimo interesse do controlador (Art. 7º, IX): comunicação e acompanhamento dos acordos, com garantias de segurança e proporcionalidade.

5. TEMPO DE RETENÇÃO

Os dados são mantidos por 5 (cinco) anos a partir da criação ou última modificação do acordo, em cumprimento a obrigações legais e contratuais. Após esse prazo, são anonimizados ou eliminados conforme a Política de Retenção e Descarte de Dados.

6. SEGURANÇA

Os dados são armazenados em servidores Supabase na região sa-east-1 (Brasil), com:
- Controle de acesso por perfil (RBAC: operador, líder, admin, diretoria);
- Criptografia em trânsito (TLS 1.2+);
- Autenticação com credenciais individuais;
- Auditoria de ações via logs de sistema.

7. COMPARTILHAMENTO COM TERCEIROS

Os dados não são compartilhados com terceiros, exceto com o provedor de infraestrutura Supabase, que atua como operador e está sujeito às suas próprias políticas de segurança. Não há transferência internacional de dados.

8. DIREITOS DO TITULAR (ART. 18, LGPD)

O titular tem direito a:
a) Confirmação da existência de tratamento;
b) Acesso aos dados;
c) Correção de dados incompletos ou inexatos;
d) Anonimização, bloqueio ou eliminação de dados desnecessários;
e) Portabilidade dos dados, conforme regulamentação da ANPD;
f) Eliminação dos dados tratados com base em consentimento;
g) Informação sobre compartilhamento com terceiros;
h) Informação sobre a possibilidade de negar consentimento e as consequências.

Para exercer seus direitos, o titular deve contatar o Controlador pelos canais disponibilizados pelo administrador do sistema.

9. ALTERAÇÕES

Esta política pode ser atualizada periodicamente. A versão vigente estará sempre disponível no sistema.$POL$, '1.0'),

-- ── Documento 2: ROPA ──
('ropa', 'ROPA — Registro de Operações de Tratamento de Dados', $ROPA$REGISTRO DE OPERAÇÕES DE TRATAMENTO DE DADOS (ROPA)
Art. 37, Lei nº 13.709/2018 (LGPD) | Versão 1.0

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OPERAÇÃO 1 — Gestão de Acordos de Pagamento
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Categoria do dado    : Nome completo e número de WhatsApp do devedor
Finalidade           : Formalização, acompanhamento e auditoria de acordos de pagamento
Base legal           : Execução de contrato (Art. 7º, V) e Legítimo interesse (Art. 7º, IX)
Sistema              : Supabase PostgreSQL — tabela "acordos" — região sa-east-1 (Brasil)
Tempo de retenção    : 5 anos a partir da criação ou última atualização do registro
Compartilhamento     : Nenhum (exceto provedor de infraestrutura Supabase como operador)
Medidas de segurança : RBAC por perfil, TLS 1.2+, autenticação individual, logs em "historico_acordos" e "logs_sistema"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OPERAÇÃO 2 — Comunicação via WhatsApp
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Categoria do dado    : Número de WhatsApp do devedor
Finalidade           : Envio de lembretes de vencimento, confirmações e atualizações de status
Base legal           : Execução de contrato (Art. 7º, V)
Sistema              : Supabase — tabela "logs_whatsapp" — região sa-east-1 (Brasil)
Tempo de retenção    : 5 anos a partir do envio
Compartilhamento     : Nenhum
Medidas de segurança : Acesso restrito a operadores autenticados com perfil habilitado

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OPERAÇÃO 3 — Controle de Acesso e Auditoria Interna
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Categoria do dado    : Nome e e-mail dos usuários internos (operadores, líderes, admins)
Finalidade           : Autenticação, rastreabilidade de ações e auditoria de segurança
Base legal           : Obrigação legal e Legítimo interesse do controlador
Sistema              : Supabase — tabelas "perfis" e "logs_sistema"
Tempo de retenção    : Enquanto ativo; logs por 5 anos
Compartilhamento     : Nenhum
Medidas de segurança : Senhas com hash bcrypt, sessões com expiração, logs de acesso

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DADOS EXPRESSAMENTE NÃO COLETADOS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
O sistema NÃO coleta: CPF, RG, endereço, e-mail pessoal do devedor, dados bancários, dados de saúde, dados biométricos ou dados de menores de idade.

O código de inscrição/NR não possui vínculo direto com pessoa física — é um identificador interno da empresa contratante.

Responsável pelo ROPA: Administrador do sistema / DPO designado pela empresa.$ROPA$, '1.0'),

-- ── Documento 3: Aviso de Privacidade Interno ──
('aviso_privacidade_interno', 'Aviso de Privacidade Interno — Operadores do Sistema', $AVISO$AVISO DE PRIVACIDADE INTERNO
Destinado a: Operadores, Líderes, Administradores e Diretoria
AcordosPRO | Versão 1.0

Este aviso é direcionado exclusivamente aos usuários internos do sistema. Leia com atenção.

1. FINALIDADE EXCLUSIVA DO TRATAMENTO

Os dados pessoais dos devedores/profissionais presentes no sistema (nome e WhatsApp) são tratados EXCLUSIVAMENTE para fins de gestão de acordos de pagamento. Qualquer uso fora desta finalidade é expressamente proibido e constitui violação à LGPD.

2. PROIBIÇÕES EXPRESSAS

É proibido ao usuário interno:
a) Acessar, copiar, compartilhar ou divulgar dados de devedores para fins pessoais ou externos ao sistema;
b) Utilizar números de WhatsApp cadastrados para contatos não relacionados aos acordos formalizados;
c) Exportar, fotografar ou reproduzir listas de dados fora das funcionalidades oficiais do sistema;
d) Compartilhar credenciais de acesso (usuário/senha) com terceiros, inclusive colegas de trabalho;
e) Acessar registros de setores ou empresas além dos atribuídos ao seu perfil.

3. SIGILO PROFISSIONAL

Todos os usuários estão sujeitos ao sigilo profissional sobre as informações acessadas, inclusive após o encerramento do vínculo com a empresa. A violação pode configurar:
- Infração administrativa à LGPD (Art. 52), com multas de até R$ 50 milhões;
- Responsabilidade civil por danos aos titulares (Art. 42, LGPD);
- Eventual responsabilidade penal (Lei 9.983/2000).

4. RASTREABILIDADE

Todas as ações realizadas no sistema são registradas em logs de auditoria: criação, edição, exclusão de acordos, envio de mensagens e alterações de status. O usuário está ciente de que suas ações são monitoradas para fins de segurança e conformidade legal.

5. COMUNICAÇÃO DE INCIDENTES

Qualquer suspeita de acesso não autorizado, vazamento de dados, perda de dispositivo com acesso ao sistema ou situação que possa comprometer a segurança dos dados deve ser comunicada IMEDIATAMENTE ao administrador do sistema.

6. RESPONSABILIDADE

O descumprimento deste aviso pode acarretar:
- Medidas disciplinares internas, incluindo rescisão do vínculo;
- Ação de reparação civil pelos danos causados;
- Notificação à ANPD conforme Art. 48 da LGPD.

Ao acessar o sistema, o usuário declara ter lido e compreendido este aviso.$AVISO$, '1.0'),

-- ── Documento 4: Política de Retenção e Descarte ──
('politica_retencao_descarte', 'Política de Retenção e Descarte de Dados', $RET$POLÍTICA DE RETENÇÃO E DESCARTE DE DADOS
AcordosPRO | Versão 1.0

1. OBJETIVO

Estabelecer prazos de guarda e procedimentos de descarte dos dados pessoais tratados no sistema AcordosPRO, em conformidade com os Arts. 15 e 16 da LGPD.

2. PRAZOS DE RETENÇÃO

Categoria                | Tabela              | Prazo            | Justificativa
-------------------------|---------------------|------------------|-----------------------------------------
Acordos (nome/WhatsApp)  | acordos             | 5 anos           | Obrigação contratual e ação de cobrança
Histórico de alterações  | historico_acordos   | 5 anos           | Auditoria e compliance
Logs de WhatsApp         | logs_whatsapp       | 5 anos           | Rastreabilidade de comunicações
Logs do sistema          | logs_sistema        | 5 anos           | Auditoria de segurança
Perfis de usuários       | perfis              | Enquanto ativo + 2 anos | Responsabilização em auditorias
Aceites de termos        | aceites_termo       | 10 anos          | Prova de consentimento (Art. 8º)

3. PROCEDIMENTO DE DESCARTE

Após o vencimento do prazo, os dados são tratados da seguinte forma:

3.1 ANONIMIZAÇÃO (preferencial)
Os campos nome_cliente e whatsapp são substituídos por "ANONIMIZADO", mantendo os demais dados para fins estatísticos e de auditoria. Esta é a abordagem preferencial pois preserva a integridade histórica dos relatórios.

3.2 ELIMINAÇÃO
Quando a anonimização não for tecnicamente viável ou quando solicitada pelo titular com base no Art. 18, VI da LGPD (e inexistindo obrigação legal de retenção), o registro é eliminado permanentemente.

4. RESPONSABILIDADES

O administrador do sistema é responsável por:
a) Identificar registros que atingiram o prazo de retenção;
b) Executar o procedimento de descarte aplicável;
c) Registrar o descarte nos logs do sistema;
d) Comunicar ao encarregado de dados (DPO) as ações realizadas.

5. SOLICITAÇÕES DE TITULARES (ART. 18, LGPD)

Ao receber solicitação de eliminação de dados:
a) Verificar a base legal e se há obrigação legal de retenção;
b) Se não houver obrigação: anonimizar ou eliminar em até 15 dias úteis;
c) Comunicar ao titular a conclusão do procedimento;
d) Registrar a solicitação e a ação nos logs do sistema.

6. REVISÃO

Esta política deve ser revisada anualmente ou sempre que houver mudança substancial nos processos de tratamento.$RET$, '1.0'),

-- ── Documento 5: Plano de Resposta a Incidentes ──
('plano_resposta_incidentes', 'Plano de Resposta a Incidentes de Segurança', $INC$PLANO DE RESPOSTA A INCIDENTES DE SEGURANÇA (SIMPLIFICADO)
AcordosPRO | Versão 1.0

1. OBJETIVO

Estabelecer procedimentos para resposta a incidentes de segurança envolvendo dados pessoais, em conformidade com o Art. 48 da LGPD.

2. DEFINIÇÃO DE INCIDENTE

Considera-se incidente qualquer evento que possa resultar em:
- Acesso não autorizado a dados pessoais;
- Perda, destruição ou alteração indevida de dados;
- Vazamento de dados a terceiros não autorizados;
- Comprometimento de credenciais de acesso ao sistema.

3. CLASSIFICAÇÃO DE SEVERIDADE

ALTO   — Dados expostos a terceiros externos (ex.: vazamento de base, invasão por agente externo)
MÉDIO  — Acesso interno não autorizado ou suspeito (ex.: uso de credencial alheia)
BAIXO  — Incidente contido sem exposição confirmada (ex.: tentativa bloqueada, senha comprometida mas trocada)

4. NOTIFICAÇÕES INTERNAS OBRIGATÓRIAS

Ao identificar qualquer incidente:
- IMEDIATAMENTE     : Notificar o Administrador do sistema e o Responsável de TI
- ATÉ 2 HORAS       : Administrador notifica a Diretoria da empresa
- ATÉ 24 HORAS      : Avaliação inicial do impacto e identificação dos dados afetados

5. COMUNICAÇÃO À ANPD (ART. 48, LGPD)

Para incidentes de nível ALTO, comunicar à ANPD em até 72 horas após ciência do incidente:
- Natureza dos dados afetados (nome e/ou WhatsApp)
- Número estimado de titulares impactados
- Medidas adotadas ou planejadas
- Riscos relacionados ao incidente

Canal ANPD: https://www.gov.br/anpd/pt-br

6. COMUNICAÇÃO AO TITULAR

Quando o incidente puder causar risco ou dano relevante ao titular:

Modelo de comunicação:
"Prezado(a) [Nome], informamos que identificamos um incidente de segurança que pode ter envolvido seus dados no sistema AcordosPRO. Os dados potencialmente afetados são: [nome / WhatsApp]. Tomamos as seguintes medidas: [ações tomadas]. Para dúvidas, contate: [e-mail do controlador]."

7. AÇÕES IMEDIATAS (INCIDENTE ALTO/MÉDIO)

1. Revogar imediatamente os acessos comprometidos
2. Alterar senhas e tokens de acesso afetados
3. Notificar a Supabase pelo canal de suporte de segurança
4. Preservar logs de auditoria para investigação
5. Documentar o incidente para o Registro de Incidentes

8. REGISTRO DO INCIDENTE

Todo incidente deve ser documentado com:
- Data e hora de detecção
- Descrição do incidente e dados afetados
- Número estimado de titulares impactados
- Medidas tomadas e resultado
- Data de comunicação à ANPD (quando aplicável)$INC$, '1.0'),

-- ── Documento 6: Termo de Responsabilidade do Operador ──
('termo_responsabilidade_operador', 'Termo de Responsabilidade do Operador', $TRO$TERMO DE RESPONSABILIDADE DO OPERADOR
AcordosPRO | Versão 1.0

Ao aceitar o Termo de Uso e acessar o sistema AcordosPRO, o usuário (Operador) declara ter lido, compreendido e concordado integralmente com as obrigações abaixo:

1. FINALIDADE EXCLUSIVA

O Operador compromete-se a utilizar os dados pessoais acessados pelo sistema (nome completo e número de WhatsApp dos devedores/profissionais) EXCLUSIVAMENTE para fins de gestão de acordos de pagamento, conforme as atribuições do seu cargo.

2. PROIBIÇÃO DE USO EXTERNO

O Operador declara que NÃO utilizará, compartilhará, divulgará, copiará ou reproduzirá os dados pessoais acessados para finalidades pessoais, comerciais ou quaisquer outras que extrapolem as atividades do sistema AcordosPRO.

3. CONFIDENCIALIDADE

O Operador compromete-se a manter sigilo sobre todas as informações acessadas no sistema, inclusive após encerramento do vínculo profissional com a empresa, pelo prazo de 5 (cinco) anos.

4. SEGURANÇA DAS CREDENCIAIS

O Operador é responsável pela guarda de suas credenciais (usuário e senha) e declara que:
a) Não compartilhará suas credenciais com terceiros;
b) Comunicará ao administrador qualquer suspeita de uso indevido;
c) Não acessará o sistema em dispositivos não autorizados.

5. COMUNICAÇÃO DE INCIDENTES

O Operador compromete-se a notificar o administrador imediatamente ao tomar conhecimento de qualquer incidente de segurança, acesso não autorizado ou situação irregular envolvendo dados do sistema.

6. CIÊNCIA DAS PENALIDADES

O Operador está ciente de que o descumprimento pode acarretar:
a) Medidas disciplinares internas, incluindo rescisão do vínculo;
b) Responsabilidade civil por danos aos titulares (Art. 42, LGPD);
c) Responsabilidade penal, quando configurada;
d) Penalidades administrativas da ANPD (Art. 52, LGPD) — multas de até R$ 50.000.000,00 por infração para o controlador.

7. VIGÊNCIA

Este Termo tem vigência a partir da data de aceite e permanece em vigor durante todo o período de acesso ao sistema.

Ao clicar em "Aceitar e Continuar" no modal de Termos de Uso, o Operador confirma que:
- Leu e compreendeu este Termo na íntegra;
- O aceite é livre, informado e inequívoco;
- Está de acordo com todas as obrigações aqui estabelecidas.$TRO$, '1.0')

ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- 5. SEED: Termo de Uso para Bookplay e Pagueplay
-- ─────────────────────────────────────────────────────────────
INSERT INTO public.termos_uso (empresa_id, versao, titulo, conteudo, ativo)
SELECT
  e.id,
  '1.0',
  'Termo de Uso e Política de Privacidade — AcordosPRO',
  $TERMO$TERMO DE USO E POLÍTICA DE PRIVACIDADE — AcordosPRO
Versão 1.0

Ao acessar o sistema AcordosPRO, você ("Usuário") concorda com este Termo e com a Política de Privacidade da empresa. Se não concordar, clique em "Recusar e sair".

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. IDENTIFICAÇÃO DO SISTEMA E DO CONTROLADOR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
O AcordosPRO é um sistema de gestão de acordos de pagamento para uso interno de empresas. O Controlador dos dados é a empresa contratante do sistema.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
2. DADOS PESSOAIS TRATADOS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
No exercício de suas funções, o Usuário terá acesso a dados pessoais de devedores/profissionais, limitados a:
- Nome completo;
- Número de WhatsApp.

Esses dados são tratados exclusivamente para gestão de acordos de pagamento. NÃO são coletados CPF, endereço, e-mail pessoal do devedor ou dados bancários.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
3. OBRIGAÇÕES DO USUÁRIO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
O Usuário compromete-se a:
a) Utilizar os dados acessados SOMENTE para as finalidades do sistema;
b) Manter sigilo sobre as informações acessadas, inclusive após o término do vínculo;
c) Não compartilhar suas credenciais de acesso com terceiros;
d) Comunicar imediatamente qualquer suspeita de incidente de segurança ao administrador.

É expressamente proibido:
a) Usar dados de devedores para fins pessoais ou externos ao sistema;
b) Exportar ou reproduzir listas de dados fora das funcionalidades oficiais;
c) Acessar informações de setores não atribuídos ao seu perfil.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
4. BASE LEGAL DO TRATAMENTO (LGPD)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
O tratamento dos dados fundamenta-se em:
- Execução de contrato (Art. 7º, V, LGPD);
- Legítimo interesse do controlador (Art. 7º, IX, LGPD).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
5. SEGURANÇA E RASTREABILIDADE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
O sistema utiliza autenticação individual, controle de acesso por perfil (RBAC), criptografia em trânsito (TLS 1.2+) e logs de auditoria. TODAS as ações realizadas no sistema são registradas e associadas ao usuário responsável.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
6. DIREITOS DOS TITULARES (ART. 18, LGPD)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Os devedores/profissionais (titulares dos dados) têm direito a: confirmação do tratamento, acesso, correção, anonimização, portabilidade e eliminação dos dados. Solicitações devem ser encaminhadas ao administrador do sistema para processamento em até 15 dias úteis.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
7. PENALIDADES POR DESCUMPRIMENTO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
O descumprimento das obrigações deste Termo pode acarretar medidas disciplinares internas, responsabilidade civil (Art. 42, LGPD) e penalidades administrativas impostas pela ANPD (Art. 52, LGPD).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
8. VIGÊNCIA E ATUALIZAÇÃO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Este Termo está em vigor a partir da data de aceite. Em caso de atualização, o Usuário será solicitado a aceitar a nova versão no próximo acesso.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
9. CONTATO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Para exercer direitos de titular, reportar incidentes ou esclarecer dúvidas sobre privacidade, entre em contato com o administrador do sistema ou com o Encarregado de Dados (DPO) da empresa contratante.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Ao clicar em "Aceitar e Continuar", o Usuário declara:
- Que leu e compreendeu este Termo na íntegra;
- Que aceita o tratamento dos dados conforme descrito;
- Que está ciente de suas obrigações como usuário interno do sistema AcordosPRO;
- Que o aceite é livre, informado e inequívoco.$TERMO$,
  TRUE
FROM public.empresas e
WHERE e.slug IN ('bookplay', 'pagueplay')
  AND NOT EXISTS (
    SELECT 1 FROM public.termos_uso t
    WHERE t.empresa_id = e.id AND t.ativo = TRUE
  );
