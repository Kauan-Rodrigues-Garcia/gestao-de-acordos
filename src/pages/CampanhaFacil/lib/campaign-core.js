// ─────────────────────────────────────────────────────────────────────────────
// Lógica pura do Campanha Fácil — PORTADA VERBATIM do app original (vanilla JS).
// Só o cabeçalho/rodapé mudaram: IIFE global → ES module export. NÃO alterar a
// lógica aqui; se precisar mexer no comportamento, alinhar com o app de origem.
// Tipos públicos ficam em campaign-core.d.ts.
// ─────────────────────────────────────────────────────────────────────────────

  const DEFAULT_DISCOUNTS = Object.freeze({
    overdue: 7,
    settlement: 30,
    interest: 0,
    bundle: 15,
    annual: 25,
  });

  const DEFAULT_SENDERS = Object.freeze([]);

  const TEMPLATES = Object.freeze([
    {
      id: "garanta-desconto",
      name: "GARANTA SEU DESCONTO HOJE",
      category: "Cobrança",
      description: "Oferta completa com parcela, junção, quitação e plano anual.",
      body: `*🌟 GARANTA SEU DESCONTO HOJE*

Olá *{{primeiro_nome}}*, *protocolo {{protocolo}}*.

A *{{empresa}}* liberou DESCONTOS especiais nas suas parcelas.

1️⃣ *Pagamento da parcela em atraso: {{parcela_desconto}}*
2️⃣ *Pagamento da junção (atrasada + próxima): {{juncao}}*
3️⃣ *Quitação via Pix: {{quitacao}}*
4️⃣ *Quitação em 12x no cartão: {{cartao_quitacao}} (sem juros, podendo ser de terceiros)*
5️⃣ *Plano anual em 12x no cartão: {{cartao_anual}}*
6️⃣ *PIX AUTOMÁTICO no valor de R$ 00,00 por parcela*

💬 *Estamos à disposição! Qual opção de pagamento você escolhe?*
📞 Atendimento: 0800 777 2020`,
    },
    {
      id: "em-dia",
      name: "EM DIA",
      category: "Relacionamento",
      description: "Reconhecimento com benefício para clientes em dia.",
      body: `🚨 *{{primeiro_nome}}, condição exclusiva liberada!*

📄 Protocolo: *{{protocolo}}*

Você foi selecionada para uma condição especial em seu contrato com a *{{empresa}}* com benefícios exclusivos:

🟢 20% de desconto na quitação total
🎁 + 6 meses de acesso gratuitos

ou

🔁 PIX automático nas parcelas
💳 10% de desconto em cada pagamento

⏰ *Prazo final: HOJE às 23:59 (improrrogável)*

👇 Escolha uma opção para continuar:

1️⃣ *Quitar com 20% de desconto*
2️⃣ *Ativar PIX automático (10% OFF)*
3️⃣ *Falar com atendimento*

👉 Responda com o número da opção 😉
📞 Atendimento: 0800 777 2020`,
    },
    {
      id: "preventivo",
      name: "MENSAGEM DE PREVENTIVO",
      category: "Preventivo",
      description: "Contato do dia para auxiliar o cliente sobre o contrato.",
      // Não afirma que o pagamento está agendado para hoje: o relatório
      // cadastral não traz data de pagamento, então a frase antiga afirmava um
      // fato que ninguém conferiu — e o cliente respondia dizendo que não tinha
      // agendado nada.
      body: `📌*LEMBRETE DE PAGAMENTO*

Olá *{{nome}}*, tudo bem? Estou entrando em contato hoje para te auxiliar com o seu contrato *{{contrato}}* da *{{empresa}}*.

Para facilitar, caso ainda não tenha realizado o pagamento posso encaminhar o link PIX?

1️⃣ *Preciso do link PIX para pagamento da minha parcela*
2️⃣ *Ativar PIX automático (10% OFF)*
3️⃣ *Quero quitar meu contrato com desconto EXCLUSIVO*
4️⃣ *Já realizei o pagamento e enviarei o comprovante*

Aguardamos sua escolha para seguirmos com o melhor atendimento!
_Agradecemos pela parceria e confiança._
📞 Atendimento: 0800 777 2020`,
    },
    {
      id: "negociacao-recebida",
      name: "SOLICITAÇÃO DE NEGOCIAÇÃO RECEBIDA",
      category: "Retorno",
      description: "Resposta para quem demonstrou interesse em negociar.",
      body: `*📌SOLICITAÇÃO DE NEGOCIAÇÃO RECEBIDA*

Olá *{{nome}}*, tudo bem?

Identificamos que você acessou nosso site e demonstrou interesse em negociar seu contrato *{{contrato}}* com a *{{empresa}}*.

Estou aqui para te ajudar a encontrar a melhor condição para regularização 💬

Por favor, me informe qual opção você deseja:

1️⃣ Quero receber proposta para negociação da minha parcela
2️⃣ Tenho interesse em quitar meu contrato com desconto especial
3️⃣ Quero falar com um atendente

Fico no aguardo da sua resposta para seguirmos com a melhor solução para você 😊
Agradecemos seu interesse e estamos à disposição!
📞 Atendimento: 0800 779 6000`,
    },
    {
      id: "regularizacao-um-minuto",
      name: "ATENÇÃO: REGULARIZAÇÃO EM 1 MINUTO!",
      category: "Entrada",
      description: "Abordagem curta para confirmar ou concluir o pagamento.",
      body: `*ATENÇÃO: REGULARIZAÇÃO EM 1 MINUTO!*

🚨 *Atenção, temos uma pendência com a {{empresa}}!*
*{{nome}}*
Para liberar todo o seu acesso, precisamos resolver um detalhe rapidinho.
*(Contrato {{contrato}})*

Me responde só:

1️⃣ - *Já quitei, pode verificar!*
2️⃣ - *Quero fazer o pagamento agora e continuar aproveitando!*

O que você prefere? Vamos resolver isso juntos? 😉

👉 PROMOÇÃO BLACK ANTECIPADA: LIBERE SEU CPF SERASA COM DESCONTO!
⚠️ INFORME IMPORTANTE: Verifique agora a situação do seu CPF e aproveite as condições especiais da Black Friday antecipada!`,
    },
    {
      id: "boleto-venceu",
      name: "SEU BOLETO VENCEU? PAGUE COM DESCONTO",
      category: "Cobrança",
      description: "Oferta objetiva para boleto vencido.",
      body: `*_SEU BOLETO VENCEU? PAGUE COM DESCONTO_*

Olá *_{{nome}}_* - *_CPF: {{cpf}}_*

O seu contrato (*{{contrato}}*) foi selecionado para pagamento com um *DESCONTO ÚNICO!*

⏳ Durante *UMA HORA* você vai ter *_ISENÇÃO TOTAL_* dos juros de sua parcela em atraso. Por favor me informe uma das opções abaixo:

1️⃣ Quitação total de ~{{valor_com_juros}}~ no PIX por *{{quitacao}}*
2️⃣ Quitação pelo cartão de crédito em 12x de *{{cartao_quitacao}}* (podendo ser de terceiros)
3️⃣ Junção com *10% OFF* por *{{juncao}}*
4️⃣ Parcela em atraso com *JUROS OFF* no PIX por *{{parcela_desconto}}*

*Qual opção de desconto você deseja?*
📞 Atendimento: 0800 779 6000`,
    },
    {
      id: "pagamento-nao-identificado",
      name: "PAGAMENTO NÃO IDENTIFICADO",
      category: "Cobrança",
      description: "Aviso para mensalidade ainda não localizada.",
      body: `🚨 *PAGAMENTO NÃO IDENTIFICADO!* 🚨

*Olá, {{primeiro_nome}}!*
*Verificamos que o pagamento da sua mensalidade do contrato {{contrato}} ainda não foi identificado em nosso sistema.*

*Para te ajudar a regularizar sem juros e sem dor de cabeça, liberamos essas condições especiais:*

1️⃣ *Parcela em atraso SEM JUROS via PIX – {{parcela_desconto}}*
2️⃣ *Junção (parcela em atraso + a vencer) com 15% OFF – {{juncao}}*
3️⃣ *Quitação total com 30% OFF via PIX – {{quitacao}}*
4️⃣ *Quitação total no cartão de crédito em 12x de {{cartao_quitacao}} (inclusive de terceiros)*

💬 *Estamos aqui para te ajudar!*
⚡ *Qual opção funciona melhor pra você hoje?*
📞 Atendimento: 0800 779 6000`,
    },
    {
      id: "ultimo-aviso",
      name: "ÚLTIMO AVISO: DESCONTO SÓ HOJE!",
      category: "Urgência",
      description: "Último aviso com as principais condições de pagamento.",
      body: `🚨 *ÚLTIMO AVISO: DESCONTO SÓ HOJE!*

Olá *{{primeiro_nome}}*, tudo bem?
*Protocolo: {{protocolo}}* – Seu contrato com a *{{empresa}}* está em atraso. Evite negativação!

Aproveite o desconto via PIX Automático HOJE:

1️⃣ *PIX Automático: {{parcela_desconto}} (5% OFF)*
2️⃣ *Quitação à vista: {{quitacao}} ou 12x de {{cartao_quitacao}} (25% OFF)*
3️⃣ *Junção (atrasada + a vencer): {{juncao}} (15% OFF)*
4️⃣ *Parcela em atraso: {{parcela_desconto}}*

⚠️ *Confirma hoje? Após isso, perde o desconto!*
📞 Atendimento: 0800 779 6000`,
    },
    {
      id: "negociacao-nao-concluida",
      name: "NEGOCIAÇÃO NÃO CONCLUÍDA – URGENTE",
      category: "Negociação",
      description: "Retomada de acordo sem pagamento identificado.",
      body: `⚠️ *NEGOCIAÇÃO NÃO CONCLUÍDA – URGENTE*

Protocolo: *{{protocolo}}*

*{{nome}}*, não identificamos pagamento da sua negociação com a *{{empresa}}*.

❗ A falta de regularização pode gerar:

Negativação do *CPF ({{cpf}})* nos órgãos de proteção ao crédito (SPC/Serasa)

Acréscimo de juros, multas contratuais e custas administrativas

Medidas de cobrança e possível ação judicial

⏰ Regularize ainda HOJE:
🔹 DIGITE 1 – Quitação total
🔹 DIGITE 2 – Parcelamento no cartão
🔹 DIGITE 3 – Parcelas vencidas + a vencer
🔹 DIGITE 4 – Apenas parcelas vencidas

📲 Envie o número da opção.
Sem resposta, o acordo poderá ser cancelado e as medidas iniciadas imediatamente.

💬*Estamos aqui para lhe ajudar,*
📞 Atendimento: 0800 779 6000`,
    },
    {
      id: "pix-automatico",
      name: "CHEGA DE BOLETO! PIX AUTOMÁTICO É MAIS FÁCIL E AINDA TEM DESCONTO!",
      category: "Conversão",
      description: "Convite para migrar pagamentos ao PIX automático.",
      body: `*CHEGA DE BOLETO! PIX AUTOMÁTICO É MAIS FÁCIL E AINDA TEM DESCONTO!*

Oi, {{nome}}
Tudo bem?
Estou aqui para facilitar sua vida?
Com o PIX automático da *{{empresa}}*, você não precisa mais se preocupar com datas. O pagamento acontece todo mês de forma segura, rápida e sem complicações!

*E o melhor: migrando agora, você GANHA DESCONTO em todas as parcelas!*

*Confira suas condições especiais no contrato {{contrato}}:*

1️⃣ Quitar tudo com 25% OFF: *{{quitacao}}*
2️⃣ Pagar a parcela em atraso (sem juros): *{{parcela_desconto}}*
3️⃣ Quitar no cartão: *12x de {{cartao_quitacao}}* (podendo ser de terceiros)
4️⃣ Regularizar a junção: *{{juncao}}*
5️⃣ *Migrar pro PIX automático com desconto: {{parcela_desconto}}*

*Escolha a opção que faz mais sentido pra você e me chama aqui! Vamos ativar sua condição especial ainda hoje!*
💬*Estamos aqui para lhe ajudar,*
📞 Atendimento: 0800 779 6000`,
    },
    {
      id: "quitacao-cartao",
      name: "CONDIÇÃO IMPERDÍVEL PARA QUITAR NO CARTÃO!",
      category: "Cartão",
      description: "Condições com destaque para parcelamento no cartão.",
      body: `🎯 *CONDIÇÃO IMPERDÍVEL PARA QUITAR NO CARTÃO!*

*Olá, {{nome}},*
*Referente ao contrato {{contrato}} — CPF {{cpf}}.*

*Estamos oferecendo uma oportunidade com desconto exclusivo para você regularizar com facilidade e segurança — direto no cartão!*

1️⃣ *Parcela em atraso SEM JUROS via PIX – {{parcela_desconto}}*
2️⃣ *Junção (parcela em atraso + a vencer) com 15% OFF – {{juncao}}*
3️⃣ *Quitação total com 30% OFF via PIX – {{quitacao}}*
4️⃣ *Quitação total no cartão de crédito em 12x de {{cartao_quitacao}} (inclusive de terceiros)*

💬 *Estamos aqui para te ajudar!*
⚡ *Qual opção funciona melhor pra você hoje?*
📞 Atendimento: 0800 779 6000`,
    },
    {
      id: "negativacao",
      name: "ÚLTIMO AVISO: NEGATIVAÇÃO AO CPF",
      category: "Negativação",
      description: "Condições para regularização antes de possíveis restrições.",
      body: `🚨 *ÚLTIMO AVISO: NEGATIVAÇÃO AO CPF {{cpf}}*

Olá *{{primeiro_nome}}*, tudo bem?
*Protocolo: {{protocolo}}* – Seu contrato com a *{{empresa}}* está em atraso. Evite negativação HOJE!

Aproveite o desconto e evite maiores transtornos em seu CPF:

1️⃣ Parcela em atraso: *{{parcela_desconto}}*
2️⃣ Quitação à vista: *{{quitacao}} ou 12x de {{cartao_quitacao}} (25% OFF)*
3️⃣ Junção (atrasada + a vencer): *{{juncao}} (10% OFF)*

⚠️ *Confirma hoje? Após isso, perde o desconto e o processo de negativação segue automaticamente.*
📞 Atendimento: 0800 779 6000`,
    },
    {
      id: "cpf-negativado",
      name: "CPF NEGATIVADO – REGULARIZE PARA RETIRADA DA RESTRIÇÃO",
      category: "Negativação",
      description: "Mensagem destinada a contratos com restrição registrada.",
      body: `⚠️ *CPF NEGATIVADO – REGULARIZE PARA RETIRADA DA RESTRIÇÃO*

*⚠️INFORME IMPORTANTE: VERIFIQUE A SITUAÇÃO DO SEU CPF*

Oi, *{{primeiro_nome}}*!
Devido à falta de pagamento do contrato *{{contrato}}*, seu CPF foi encaminhado para o SPC/SERASA para ser negativado.
Sabemos que imprevistos acontecem. Queremos te ajudar a resolver o quanto antes:

1️⃣ Parcela vencida via PIX: *{{parcela_desconto}}*
2️⃣ Junção das parcelas vencida + à vencer com *10% OFF*: *{{juncao}}*
3️⃣ Quitação total com *25% OFF*: *{{quitacao}}*
4️⃣ Parcelamento no cartão: *12x de {{cartao_quitacao}}* (podendo ser de terceiros)

_Assim que o pagamento for confirmado, damos início à baixa da restrição junto aos órgãos de proteção ao crédito._

⚡*Qual melhor opção de pagamento para hoje?*
📞 Atendimento: 0800 779 6000`,
    },
    {
      id: "protesto",
      name: "ATENÇÃO, EVITE O PROTESTO EM CARTÓRIO",
      category: "Protesto",
      description: "Última oportunidade de negociação antes de possível protesto.",
      body: `🔔 ATENÇÃO: EVITE O PROTESTO EM CARTÓRIO

Bom dia *{{nome}}*,

⚠️ Evite transtornos que poderão afetar seu CPF, incluindo o risco de protesto em cartório.

Como última oportunidade de negociação, conforme a Lei 13.140/15, temos as seguintes opções para que você regularize sua situação:

1️⃣ PIX da parcela vencida com ISENÇÃO DE JUROS: {{parcela_desconto}}
2️⃣ PIX da junção (parcela vencida + próxima parcela) com 10% DE DESCONTO: {{juncao}}
3️⃣ Quitação à vista via PIX com 25% DE DESCONTO: {{quitacao}}
4️⃣ Parcelamento total no cartão: 12x de {{cartao_quitacao}} sem juros (pode ser em cartão de terceiros)

💬 Estamos aqui para ajudar.
⚡ Qual dessas opções é mais viável para você hoje?
📞 Atendimento: 0800 779 6000`,
    },
    {
      id: "saude",
      name: "Cuidamos de Quem Cuida – Confira as Condições de Regularização",
      category: "Segmentado",
      description: "Condição direcionada a profissionais da área da saúde.",
      body: `🌟 *Cuidamos de Quem Cuida – Confira as Condições de Regularização*

*Olá, {{nome}}!*
*Reconhecemos seu papel na saúde e oferecemos condições exclusivas para regularizar sua situação com tranquilidade.*
*Matrícula: {{contrato}}*

1️⃣ *Parcela em atraso com isenção de juros 💰 Valor: {{parcela_desconto}}*

2️⃣ *Junção das parcelas em atraso + a vencer com 15% de desconto 💰 Valor: {{juncao}}*

3️⃣ *Quitação total via PIX com 30% de desconto 💰 Valor: de {{valor_com_juros}} por {{quitacao}}*

4️⃣ *Parcelamento total em até 12x no cartão (inclusive de terceiros) 💳 12x de {{cartao_quitacao}}*

*Qualquer dúvida ou para aproveitar, estou à disposição por aqui!* 😊
📞 Atendimento: 0800 779 6000`,
    },
    {
      id: "educador",
      name: "COMUNICADO IMPORTANTE AOS PROFISSIONAIS DA EDUCAÇÃO",
      category: "Segmentado",
      description: "Regularização acadêmica para profissionais da educação.",
      body: `📣 *COMUNICADO IMPORTANTE AOS PROFISSIONAIS DA EDUCAÇÃO*

Olá, *{{nome}}*.

Identificamos uma pendência no contrato Nº *{{contrato}}*. Para evitar que isso gere bloqueios em seu histórico acadêmico ou profissional, disponibilizamos as seguintes formas de regularização:

1️⃣ Parcela em atraso com *ISENÇÃO DE JUROS* – *{{parcela_desconto}}*
2️⃣ Junção das parcelas em atraso + à vencer com *10% OFF* – *{{juncao}}*
3️⃣ Quitação total com *25% OFF* no PIX – *{{quitacao}}*
4️⃣ Parcelamento total da quitação em *12x de {{cartao_quitacao}}* no cartão (podendo ser de terceiros)
5️⃣ Parcelamento plano anual em *12x de {{cartao_anual}}* no cartão.

*Temos condições facilitadas. Como prefere seguir com o acerto?*
💬*Estamos aqui para lhe ajudar,*
📞 Atendimento: 0800 779 6000`,
    },
    {
      id: "aniversario",
      name: "Feliz Aniversário! Você ganhou um PRESENTE EXCLUSIVO!",
      category: "Sazonal",
      description: "Condição comemorativa para aniversariantes.",
      body: `🎉 *Feliz Aniversário! Você ganhou um PRESENTE EXCLUSIVO!* 🎉

*{{nome}}* Olá,

Sabemos que este é um mês especial para você, e por isso preparamos condições incríveis de aniversário para ajudar na regularização do *contrato {{contrato}}* vinculado ao seu CPF.

🎁 *Veja seus PRESENTES deste mês:*

🔹 *DIGITE 1 – Quitação total com desconto via PIX: {{quitacao}}*
🔹 *DIGITE 2 – Parcelamento no Cartão de Crédito em até 12x de {{cartao_quitacao}} (inclusive de terceiros)*
🔹 *DIGITE 3 – Parcelas vencidas + a vencer: {{juncao}} (PIX ou cartão)*
🔹 *DIGITE 4 – Somente parcelas vencidas: {{parcela_desconto}} (PIX)*

📌 Se já realizou o pagamento, envie o comprovante por aqui mesmo.`,
    },
    {
      id: "cashback",
      name: "CASHBACK EXCLUSIVO!",
      category: "Sazonal",
      description: "Campanha de quitação com benefício de cashback.",
      body: `*CASHBACK EXCLUSIVO!*

Olá *{{nome}}*,
Quite hoje seu *contrato {{contrato}}* e ganhe cashback!
Está disponibilizado apenas hoje.
Quitando você ganha em *cashback 30% OFF* + até 3 meses grátis de acesso à plataforma.

Não fique de fora dessa, tempo limitado!

1️⃣ - Quero parcelar em 12x no cartão de Crédito valor de {{cartao_quitacao}} (podendo ser de terceiros)
2️⃣ - Irei regularizar a Junção (em atraso + a que vai vencer) por {{juncao}}
3️⃣ - Quero pagar somente a parcela em atraso por {{parcela_desconto}}
4️⃣ - Irei regularizar parcela em atraso por {{parcela_desconto}}

💬*Estamos aqui para lhe ajudar,*
⚡*Qual melhor opção de pagamento para hoje?*
📞 Atendimento: 0800 779 6000`,
    },
    {
      id: "esquenta-black",
      name: "OPORTUNIDADE ESQUENTA DA BLACK! APROVEITE SEU DESCONTO HOJE",
      category: "Sazonal",
      description: "Campanha Black com condições completas de regularização.",
      body: `⚫🔥 *OPORTUNIDADE ESQUENTA DA BLACK! APROVEITE SEU DESCONTO HOJE* 🔥⚫

Olá *{{primeiro_nome}}*, protocolo *{{protocolo}}*.

A *{{empresa}}* liberou DESCONTOS EXCLUSIVOS nas suas parcelas para você aproveitar o Esquenta da Black!

1️⃣ *Pagamento da parcela em atraso: {{parcela_desconto}}*
2️⃣ *Pagamento da junção (atrasada + próxima): {{juncao}}*
3️⃣ *Quitação via Pix com 25% OFF: {{quitacao}}*
4️⃣ *Quitação em 12x no cartão: {{cartao_quitacao}} (sem juros, podendo ser de terceiros)*
5️⃣ *Plano anual em 12x no cartão: {{cartao_anual}}*
6️⃣ *Já efetuei o pagamento, vou enviar o comprovante*

💬 Aproveite enquanto a condição está ativa! Qual opção você prefere?
📞 Atendimento: 0800 779 6000`,
    },
    {
      id: "sexta-oportunidade",
      name: "SEXTA DE OPORTUNIDADE!",
      category: "Sazonal",
      description: "Oferta de sexta-feira com juros zerados e parcelamento.",
      body: `💥 *Sexta de Oportunidade!* 💥

*Olá, {{primeiro_nome}}.*
*Hoje você tem condições especiais para quitar sua parcela:*
Contrato: *{{contrato}}*
✅ *Juros zerados*
✅ *Descontos exclusivos*

1️⃣ *Parcelar em 12x no cartão: {{cartao_quitacao}} (pode ser de terceiros)*
2️⃣ *Regularizar parcelas (em atraso + a vencer)15% OFF: {{juncao}}*
3️⃣ *Pagar somente as parcelas em atraso com 5% OFF: {{parcela_desconto}}*

📲 Responda com a melhor opção ou fale conosco. Só hoje!
📞 Atendimento: 0800 779 6000`,
    },
  ]);

  function normalizeHeader(value) {
    return String(value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
  }

  function parseDelimited(text, delimiter) {
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;

    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      if (char === '"') {
        if (inQuotes && text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }

      if (!inQuotes && char === delimiter) {
        row.push(field.trim());
        field = "";
        continue;
      }

      if (!inQuotes && (char === "\n" || char === "\r")) {
        if (char === "\r" && text[index + 1] === "\n") index += 1;
        row.push(field.trim());
        field = "";
        if (row.some((cell) => cell !== "")) rows.push(row);
        row = [];
        continue;
      }

      field += char;
    }

    row.push(field.trim());
    if (row.some((cell) => cell !== "")) rows.push(row);
    return rows;
  }

  function detectDelimiter(text) {
    const sample = text.slice(0, 40000);
    const candidates = ["|", ";", "\t", ","];
    let winner = "|";
    let bestScore = 0;

    for (const delimiter of candidates) {
      const parsed = parseDelimited(sample, delimiter).slice(0, 5);
      if (!parsed.length) continue;
      const widths = parsed.map((row) => row.length);
      const consistent = widths.filter((width) => width === widths[0]).length;
      const score = Math.min(...widths) * 10 + consistent;
      if (score > bestScore) {
        bestScore = score;
        winner = delimiter;
      }
    }

    return winner;
  }

  function decodeBytes(input) {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    try {
      return {
        text: new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, ""),
        encoding: "UTF-8",
      };
    } catch {
      return {
        text: new TextDecoder("windows-1252").decode(bytes).replace(/^\uFEFF/, ""),
        encoding: "Windows-1252",
      };
    }
  }

  function parseMailing(input) {
    const decoded = typeof input === "string" ? { text: input, encoding: "Texto" } : decodeBytes(input);
    const delimiter = detectDelimiter(decoded.text);
    const parsed = parseDelimited(decoded.text, delimiter);
    if (parsed.length < 2) throw new Error("O arquivo não contém linhas de mailing suficientes.");

    if (isReport245Rows(parsed)) {
      return {
        ...parseReport245(parsed),
        delimiter,
        encoding: decoded.encoding,
      };
    }

    const headers = parsed[0].map((header) => header.replace(/^\uFEFF/, "").trim());
    const normalizedHeaders = headers.map(normalizeHeader);
    const records = parsed.slice(1)
      .filter((row) => row.some((cell) => cell !== ""))
      .map((row, rowIndex) => {
        const values = {};
        const normalized = {};
        headers.forEach((header, columnIndex) => {
          const value = row[columnIndex] ?? "";
          values[header] = value;
          if (!(normalizedHeaders[columnIndex] in normalized)) {
            normalized[normalizedHeaders[columnIndex]] = value;
          }
        });
        return { rowNumber: rowIndex + 2, values, normalized };
      });

    const required = ["NOME", "CONTRATOS", "VALOR", "VALORABERTO", "VALORATUALIZADO"];
    const missingHeaders = required.filter((header) => !normalizedHeaders.includes(header));

    // Mailing com as colunas de valor É o relatório 247 — a campanha de
    // desconto. O arquivo real vem em .csv separado por pipe e em Windows-1252,
    // e os dois já são detectados acima. Sem as colunas de valor continua sendo
    // um CSV de contatos qualquer.
    const ehRelatorio247 = temColunasFinanceiras(headers);

    return {
      headers,
      records,
      delimiter,
      encoding: decoded.encoding,
      missingHeaders,
      ...(ehRelatorio247
        ? { sourceType: "report-247", reportCode: "247", campaignPurpose: "desconto", financialDataAvailable: true }
        : {}),
    };
  }

  /**
   * Cabeçalho do relatório 245 — o arquivo .xls de ligações.
   *
   * Conferido contra o arquivo real da operação (31/07/2026), cujas colunas são
   * CodGrupo, Grupo, SubGrupo, Usuário, Dt.Ult.Ligação, ..., Dt.Pagamento,
   * Cód.Cliente, Cliente, ..., Nr.Documento, Empresa, Valor Aberto, ...,
   * DDD 1, Telefone 1, ...
   *
   * ATENÇÃO: o 245 TEM colunas de valor. Ele não é um cadastro "sem valores" —
   * é a campanha preventiva, que IGNORA os valores que o arquivo traz. Houve
   * um detector que exigia a AUSÊNCIA de colunas financeiras para reconhecer o
   * 245; nenhum arquivo real batia com ele, e o 245 de verdade caía no parser
   * de cobrança e saía com desconto calculado em cima de valor zerado.
   */
  const REPORT_245_REQUIRED_HEADERS = Object.freeze([
    "GRUPO",
    "USUARIO",
    "DTPAGAMENTO",
    "CODCLIENTE",
    "CLIENTE",
    "NRDOCUMENTO",
    "EMPRESA",
    "VALORABERTO",
    "DDD1",
    "TELEFONE1",
  ]);

  /**
   * Colunas de valor do mailing 247 (.csv). A presença delas é o que separa o
   * 247 — campanha COM valores — de um CSV de contatos qualquer.
   */
  const REPORT_247_FINANCIAL_HEADERS = Object.freeze([
    "VALORABERTO",
    "VALORATUALIZADO",
  ]);

  function findReport245HeaderRow(rows) {
    const limit = Math.min(Array.isArray(rows) ? rows.length : 0, 20);
    for (let rowIndex = 0; rowIndex < limit; rowIndex += 1) {
      const normalized = (rows[rowIndex] || []).map(normalizeHeader);
      if (REPORT_245_REQUIRED_HEADERS.every((header) => normalized.includes(header))) {
        return rowIndex;
      }
    }
    return -1;
  }

  function isReport245Rows(rows) {
    return findReport245HeaderRow(rows) >= 0;
  }

  /** O mailing traz as colunas de valor do 247? */
  function temColunasFinanceiras(headers) {
    const conjunto = new Set((headers || []).map(normalizeHeader));
    return REPORT_247_FINANCIAL_HEADERS.every((header) => conjunto.has(header));
  }

  function combineReportPhone(ddd, number) {
    const dddDigits = String(ddd ?? "").replace(/\D/g, "");
    const numberDigits = String(number ?? "").replace(/\D/g, "");
    if (!numberDigits) return "";
    if (numberDigits.length >= 10) return numberDigits;
    return `${dddDigits}${numberDigits}`;
  }

  /**
   * Motivo para tirar a linha da campanha, ou null se ela fica.
   *
   * Compartilhada pelos DOIS relatórios. Antes vivia só dentro do de cobrança,
   * e por isso o cadastral (245) saía sem filtro nenhum: mandava mensagem para
   * Manutenção, Marília-COFEN, Jornada e para quem já tinha pagado.
   *
   * Coluna ausente não exclui ninguém: `reportValue` devolve string vazia e a
   * regra correspondente não dispara. É o que faz a função servir aos dois
   * layouts sem exigir que o cadastral tenha todas as colunas do de cobrança.
   */
  function motivoExclusao(reportValue) {
    const group = normalizeHeader(reportValue("Grupo"));
    const user = normalizeHeader(reportValue("Usuário"));
    const paymentDate = reportValue("Dt.Pagamento");

    if (group.includes("MANUTENCAO")) {
      return { statKey: "maintenance", reasonCode: "maintenance", reason: "Setor Manutenção" };
    }
    if (group.includes("MARILIA") && group.includes("COFEN")) {
      return { statKey: "cofen", reasonCode: "cofen", reason: "Setor Marília - COFEN" };
    }
    if (group.includes("JORNADA")) {
      return { statKey: "jornada", reasonCode: "jornada", reason: "Setor Jornada" };
    }
    if (group === "COBRANCAGERAL" && user !== "PAGUEPLAY") {
      return {
        statKey: "generalUsers",
        reasonCode: "general-user",
        reason: "Cobrança Geral: usuário diferente de Pagueplay",
      };
    }
    if (paymentDate !== "") {
      return { statKey: "paid", reasonCode: "paid", reason: "Data de pagamento preenchida" };
    }

    const clientName = reportValue("Cliente");
    const contract = reportValue("Nr.Documento");
    if (!clientName || !contract) {
      const missing = [!clientName ? "cliente" : "", !contract ? "contrato" : ""].filter(Boolean).join(" e ");
      return {
        statKey: "invalid",
        reasonCode: "invalid-registration",
        reason: `Cadastro incompleto: ${missing} ausente${missing.includes(" e ") ? "s" : ""}`,
      };
    }

    return null;
  }

  function estatisticasVazias() {
    return {
      total: 0, included: 0, removed: 0,
      maintenance: 0, cofen: 0, jornada: 0, generalUsers: 0, paid: 0, invalid: 0,
    };
  }

  /**
   * Relatório 245 (.xls) — a campanha PREVENTIVA.
   *
   * O arquivo traz Valor Aberto, Valor Original e Valor Recebido, mas a
   * campanha preventiva IGNORA tudo isso: ela só avisa o cliente sobre o
   * contrato. Por isso os campos financeiros saem vazios e o registro nasce
   * com `financialDataAvailable: false` — que é o que impede a tela de
   * oferecer uma mensagem de desconto e mandar "R$ 0,00" para o cliente.
   */
  function parseReport245(rows) {
    const headerRowIndex = findReport245HeaderRow(rows);
    if (headerRowIndex < 0) {
      throw new Error("Este Excel não tem as colunas esperadas do relatório 245.");
    }

    const originalHeaders = (rows[headerRowIndex] || []).map((header) => String(header ?? "").trim());
    const headerIndexes = new Map();
    originalHeaders.forEach((header, index) => {
      const normalized = normalizeHeader(header);
      if (normalized && !headerIndexes.has(normalized)) headerIndexes.set(normalized, index);
    });

    const reportValue = (row, header) => {
      const index = headerIndexes.get(normalizeHeader(header));
      return index === undefined ? "" : String(row[index] ?? "").trim();
    };

    const headers = [
      "Código", "Nome", "CPF", "Contratos", "Parcelas em atraso", "Protesto",
      "Valor", "Valor Aberto", "Valor Atualizado", "Tp. Venda", "1",
      "Whats Titular", "Aniversariante", "Operador",
    ];
    const stats = estatisticasVazias();
    const records = [];
    const excludedRecords = [];

    const excludeRecord = (row, rowNumber, statKey, reasonCode, reason) => {
      const originalRow = originalHeaders.map((_, index) => row[index] ?? "");
      const originalValues = {};
      originalHeaders.forEach((header, index) => {
        const key = header || `COLUNA_${index + 1}`;
        originalValues[key] = originalRow[index];
      });
      excludedRecords.push({
        rowNumber,
        reasonCode,
        reason,
        originalValues,
        originalRow,
      });
      stats[statKey] += 1;
      stats.removed += 1;
    };

    rows.slice(headerRowIndex + 1).forEach((row, relativeIndex) => {
      if (!(row || []).some((cell) => String(cell ?? "").trim() !== "")) return;
      stats.total += 1;
      const rowNumber = headerRowIndex + relativeIndex + 2;

      const motivo = motivoExclusao((header) => reportValue(row, header));
      if (motivo) {
        excludeRecord(row, rowNumber, motivo.statKey, motivo.reasonCode, motivo.reason);
        return;
      }

      const clientName = reportValue(row, "Cliente");
      const contract = reportValue(row, "Nr.Documento");
      const phone = combineReportPhone(reportValue(row, "DDD 1"), reportValue(row, "Telefone 1"));
      // Só o que o preventivo usa: nome, contrato, empresa e WhatsApp. Os
      // valores do arquivo ficam de fora — a campanha não fala de dinheiro.
      const values = {
        "Código": reportValue(row, "Cód.Cliente"),
        "Nome": clientName,
        "CPF": "",
        "Contratos": contract,
        "Parcelas em atraso": "",
        "Protesto": "",
        "Valor": "",
        "Valor Aberto": "",
        "Valor Atualizado": "",
        "Tp. Venda": reportValue(row, "Empresa"),
        "1": phone,
        "Whats Titular": phone,
        "Aniversariante": "",
        "Operador": "",
      };
      const normalized = {};
      headers.forEach((header) => {
        normalized[normalizeHeader(header)] = values[header];
      });
      records.push({
        rowNumber,
        values,
        normalized,
        sourceType: "report-245",
        financialDataAvailable: false,
      });
      stats.included += 1;
    });

    if (!records.length) {
      throw new Error("Nenhum cliente ficou disponível depois dos filtros automáticos.");
    }

    return {
      headers,
      originalHeaders,
      records,
      delimiter: null,
      encoding: "Excel",
      missingHeaders: [],
      sourceType: "report-245",
      reportCode: "245",
      // Campanha PREVENTIVA: é isto que faz a tela escolher a mensagem de
      // preventivo sozinha e travar as que usam valores.
      campaignPurpose: "preventivo",
      financialDataAvailable: false,
      filterStats: stats,
      excludedRecords,
    };
  }

  function cleanValue(value) {
    const text = String(value ?? "").trim();
    return /^(NULL|N\/A|NA|NULO)$/i.test(text) ? "" : text;
  }

  function getField(record, ...names) {
    for (const name of names) {
      const value = cleanValue(record.normalized[normalizeHeader(name)]);
      if (value !== "") return value;
    }
    return "";
  }

  function parseNumber(value) {
    let text = cleanValue(value).replace(/R\$/gi, "").replace(/\s/g, "");
    if (!text) return 0;
    text = text.replace(/[^0-9,.-]/g, "");

    const comma = text.lastIndexOf(",");
    const dot = text.lastIndexOf(".");
    if (comma >= 0 && dot >= 0) {
      if (comma > dot) text = text.replace(/\./g, "").replace(",", ".");
      else text = text.replace(/,/g, "");
    } else if (comma >= 0) {
      text = text.replace(/\./g, "").replace(",", ".");
    } else if ((text.match(/\./g) || []).length > 1) {
      const pieces = text.split(".");
      const decimal = pieces.at(-1).length <= 2 ? `.${pieces.pop()}` : "";
      text = pieces.join("") + decimal;
    }

    const number = Number.parseFloat(text);
    return Number.isFinite(number) ? number : 0;
  }

  function parseNumberStrict(value, options = {}) {
    const raw = cleanValue(value);
    const allowEmpty = options.allowEmpty === true;
    if (!raw) {
      return { value: 0, valid: allowEmpty, empty: true, reason: allowEmpty ? "" : "empty" };
    }

    let text = raw.replace(/\u00A0/g, " ").trim();
    if (options.allowCurrency !== false) text = text.replace(/^R\$\s*/i, "");
    text = text.replace(/\s+/g, "");

    const numericShape = /^[+-]?(?:\d+(?:[.,]\d+)*|[.,]\d+)$/;
    if (!numericShape.test(text) || /[.,]{2}/.test(text)) {
      return { value: 0, valid: false, empty: false, reason: "format" };
    }

    const unsigned = text.replace(/^[+-]/, "");
    const commaCount = (unsigned.match(/,/g) || []).length;
    const dotCount = (unsigned.match(/\./g) || []).length;
    let normalizedText = text;
    if (commaCount > 0 && dotCount > 0) {
      const decimalSeparator = unsigned.lastIndexOf(",") > unsigned.lastIndexOf(".") ? "," : ".";
      const groupingSeparator = decimalSeparator === "," ? "." : ",";
      const decimalCount = decimalSeparator === "," ? commaCount : dotCount;
      const [integerPart, decimalPart, ...extraParts] = unsigned.split(decimalSeparator);
      const groups = integerPart.split(groupingSeparator);
      const validGroups = groups.length === 1
        || (/^\d{1,3}$/.test(groups[0]) && groups.slice(1).every((group) => /^\d{3}$/.test(group)));
      if (decimalCount !== 1 || extraParts.length || !decimalPart || !validGroups) {
        return { value: 0, valid: false, empty: false, reason: "format" };
      }
      normalizedText = text.split(groupingSeparator).join("").replace(decimalSeparator, ".");
    } else {
      const separator = commaCount ? "," : dotCount ? "." : "";
      const separatorCount = commaCount + dotCount;
      if (separator && separatorCount > 1) {
        const groups = unsigned.split(separator);
        if (!/^\d{1,3}$/.test(groups[0]) || !groups.slice(1).every((group) => /^\d{3}$/.test(group))) {
          return { value: 0, valid: false, empty: false, reason: "format" };
        }
        normalizedText = text.split(separator).join("");
      } else if (separator === ",") {
        normalizedText = text.replace(",", ".");
      }
    }

    const number = Number(normalizedText);
    if (!Number.isFinite(number)) {
      return { value: 0, valid: false, empty: false, reason: "format" };
    }
    if (options.integer === true && !Number.isInteger(number)) {
      return { value: number, valid: false, empty: false, reason: "integer" };
    }
    if (Number.isFinite(options.min) && number < options.min) {
      return { value: number, valid: false, empty: false, reason: "range" };
    }
    if (Number.isFinite(options.max) && number > options.max) {
      return { value: number, valid: false, empty: false, reason: "range" };
    }
    if (Number.isFinite(options.minExclusive) && number <= options.minExclusive) {
      return { value: number, valid: false, empty: false, reason: "range" };
    }
    return { value: number, valid: true, empty: false, reason: "" };
  }

  function percentToRate(value) {
    const number = parseNumber(value);
    return number / 100;
  }

  function roundUp(value) {
    return Number.isFinite(value) && value > 0 ? Math.ceil(value - Number.EPSILON) : 0;
  }

  function mapCompany(saleType) {
    const normalized = normalizeHeader(saleType);
    if (["PRO", "TEC"].includes(normalized)) return "Bookplay";
    if (normalized === "PEC") return "Faculdade Bookplay";
    if (["COLECAO", "OUTROS", "EDITBRASIL"].includes(normalized)) return "Mundial Editora";
    if (normalized === "BOOKPLAY") return "Bookplay";
    if (normalized === "FACULDADEBOOKPLAY") return "Faculdade Bookplay";
    if (normalized === "MUNDIALEDITORA") return "Mundial Editora";
    if (normalized === "PAGUEPLAY") return "Pagueplay";
    return cleanValue(saleType) || "Bookplay";
  }

  function titleCase(value) {
    return String(value ?? "")
      .toLocaleLowerCase("pt-BR")
      .replace(/(^|[\s'-])\p{L}/gu, (letter) => letter.toLocaleUpperCase("pt-BR"));
  }

  function firstName(value) {
    return titleCase(cleanValue(value).split(/\s+/)[0] || "cliente");
  }

  function formatOperator(value) {
    const cleaned = cleanValue(value)
      .replace(/[_\.@-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return cleaned ? titleCase(cleaned) : "";
  }

  function phoneDigits(value) {
    return cleanValue(value).replace(/\D/g, "");
  }

  function isValidPhone(value) {
    const digits = phoneDigits(value);
    return digits.length === 10 || digits.length === 11 || digits.length === 12 || digits.length === 13;
  }

  function phoneForWhatsApp(value) {
    const digits = phoneDigits(value);
    if (digits.length === 10 || digits.length === 11) return `55${digits}`;
    return digits;
  }

  function formatCurrency(value) {
    if (value === null || value === undefined || value === "") return "";
    const number = Number(value);
    if (!Number.isFinite(number)) return "";
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(number);
  }

  function formatPercent(value) {
    const number = parseNumber(value);
    return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(number)}%`;
  }

  function deriveRecord(record, discounts = DEFAULT_DISCOUNTS) {
    const financialDataAvailable = record?.financialDataAvailable !== false
      && record?.sourceType !== "report-245";
    const name = getField(record, "Nome");
    const cpf = getField(record, "CPF");
    const contract = getField(record, "Contratos", "Contrato");
    const parsedOverdueCount = parseNumberStrict(
      getField(record, "Parcelas em atraso", "Parcela em atraso"),
      { integer: true, minExclusive: 0 },
    );
    const parsedProtest = parseNumberStrict(getField(record, "Protesto"), {
      allowEmpty: true,
      integer: true,
      min: 0,
    });
    const parsedValue = parseNumberStrict(getField(record, "Valor"), { minExclusive: 0 });
    const parsedOpenValue = parseNumberStrict(getField(record, "Valor Aberto"), { minExclusive: 0 });
    const parsedUpdatedValue = parseNumberStrict(getField(record, "Valor Atualizado"), { minExclusive: 0 });
    const overdueCount = financialDataAvailable
      ? (parsedOverdueCount.valid ? parsedOverdueCount.value : 0)
      : null;
    const protest = financialDataAvailable
      ? (parsedProtest.valid ? parsedProtest.value : 0)
      : null;
    const value = financialDataAvailable ? (parsedValue.valid ? parsedValue.value : 0) : null;
    const openValue = financialDataAvailable ? (parsedOpenValue.valid ? parsedOpenValue.value : 0) : null;
    const updatedValue = financialDataAvailable ? (parsedUpdatedValue.valid ? parsedUpdatedValue.value : 0) : null;
    const saleType = getField(record, "Tp. Venda", "Tipo Venda");
    const whats = getField(record, "Whats Titular");
    const phone1 = getField(record, "1");
    const phone2 = getField(record, "2");
    const contact = [whats, phone1, phone2].find(isValidPhone) || whats || phone1 || phone2;

    const discountFields = {
      overdue: { label: "Desconto da parcela", value: discounts.overdue },
      settlement: { label: "Desconto da quitação", value: discounts.settlement },
      interest: { label: "Desconto dos juros", value: discounts.interest },
      bundle: { label: "Desconto da junção", value: discounts.bundle },
      annual: { label: "Desconto do plano anual", value: discounts.annual },
    };
    const parsedDiscounts = Object.fromEntries(
      Object.entries(discountFields).map(([key, field]) => [
        key,
        parseNumberStrict(field.value, { min: 0, max: 100, allowCurrency: false }),
      ]),
    );
    const rates = Object.fromEntries(
      Object.entries(parsedDiscounts).map(([key, parsed]) => [key, parsed.valid ? parsed.value / 100 : 0]),
    );

    const overdueDiscounted = financialDataAvailable ? roundUp(value * (1 - rates.overdue)) : null;
    const settlement = financialDataAvailable ? roundUp(openValue * (1 - rates.settlement)) : null;
    const valueWithInterest = financialDataAvailable ? roundUp(updatedValue * (1 - rates.interest)) : null;
    const installmentValue = financialDataAvailable && overdueCount > 0 ? value / overdueCount : null;
    const bundle = financialDataAvailable
      ? (overdueCount > 0
        ? roundUp(installmentValue * (overdueCount + 1) * (1 - rates.bundle))
        : 0)
      : null;
    const annual = financialDataAvailable
      ? (overdueCount > 0
        ? roundUp(installmentValue * 12 * (1 - rates.annual))
        : 0)
      : null;
    const cardSettlement = financialDataAvailable && settlement > 0 ? roundUp(settlement / 12) : (financialDataAvailable ? 0 : null);
    const cardAnnual = financialDataAvailable && annual > 0 ? roundUp(annual / 12) : (financialDataAvailable ? 0 : null);

    const issues = [];
    const blockingIssues = [];
    const addBlockingIssue = (message) => {
      if (!blockingIssues.includes(message)) blockingIssues.push(message);
      if (!issues.includes(message)) issues.push(message);
    };
    const validateRequiredNumber = (label, parsed) => {
      if (parsed.valid) return;
      if (parsed.empty) addBlockingIssue(`${label} ausente`);
      else if (parsed.reason === "integer") addBlockingIssue(`${label} deve ser um número inteiro`);
      else if (parsed.reason === "range") addBlockingIssue(`${label} deve ser maior que zero`);
      else addBlockingIssue(`${label} inválido`);
    };
    if (financialDataAvailable) {
      validateRequiredNumber("Parcelas em atraso", parsedOverdueCount);
      validateRequiredNumber("Valor", parsedValue);
      validateRequiredNumber("Valor aberto", parsedOpenValue);
      validateRequiredNumber("Valor atualizado", parsedUpdatedValue);
      if (!parsedProtest.valid) addBlockingIssue("Protesto inválido");
    }
    Object.entries(parsedDiscounts).forEach(([key, parsed]) => {
      if (parsed.valid) return;
      const label = discountFields[key].label;
      if (parsed.empty) addBlockingIssue(`${label} ausente`);
      else if (parsed.reason === "range") addBlockingIssue(`${label} deve ficar entre 0% e 100%`);
      else addBlockingIssue(`${label} inválido`);
    });
    if (!name) issues.push("Nome ausente");
    if (!contract) issues.push("Contrato ausente");
    if (!saleType && !financialDataAvailable) issues.push("Empresa ausente");
    if (record.sourceType !== "report-245" && !isValidPhone(contact)) issues.push("WhatsApp ausente");

    return {
      rowNumber: record.rowNumber,
      sourceType: record.sourceType || "mailing",
      financialDataAvailable,
      name,
      firstName: firstName(name),
      cpf,
      contract,
      overdueCount,
      protest,
      value,
      openValue,
      updatedValue,
      overdueDiscounted,
      settlement,
      valueWithInterest,
      bundle,
      annual,
      cardSettlement,
      cardAnnual,
      saleType,
      company: mapCompany(saleType),
      phone: contact,
      phoneDigits: phoneDigits(contact),
      whatsAppPhone: phoneForWhatsApp(contact),
      protocol: getField(record, "Código") || contract,
      birthday: getField(record, "Aniversariante"),
      shortLink: getField(record, "Link curto"),
      issues,
      blockingIssues,
      hasBlockingIssues: blockingIssues.length > 0,
      status: issues.length ? "Revisar" : "Pronto",
      source: record.values,
    };
  }

  function variablesFor(item, discounts) {
    return {
      nome: titleCase(item.name),
      primeiro_nome: item.firstName,
      cpf: item.cpf,
      contrato: item.contract,
      protocolo: item.protocol,
      empresa: item.company,
      telefone: item.phone,
      parcela_desconto: formatCurrency(item.overdueDiscounted),
      quitacao: formatCurrency(item.settlement),
      valor_com_juros: formatCurrency(item.valueWithInterest),
      juncao: formatCurrency(item.bundle),
      anual: formatCurrency(item.annual),
      cartao_quitacao: formatCurrency(item.cardSettlement),
      cartao_anual: formatCurrency(item.cardAnnual),
      pct_atraso: formatPercent(discounts.overdue),
      pct_quitacao: formatPercent(discounts.settlement),
      pct_juros: formatPercent(discounts.interest),
      pct_juncao: formatPercent(discounts.bundle),
      pct_anual: formatPercent(discounts.annual),
      link: item.shortLink,
    };
  }

  function renderTemplate(template, variables) {
    return String(template ?? "").replace(/{{\s*([a-z0-9_]+)\s*}}/gi, (_, key) => variables[key] ?? "");
  }

  function templateRequiresFinancialData(template) {
    return /{{\s*(?:parcela_desconto|quitacao|valor_com_juros|juncao|anual|cartao_quitacao|cartao_anual)\s*}}/i
      .test(String(template ?? ""));
  }

  function templateWithoutForwarder(template) {
    return String(template ?? "");
  }

  function finishMessage(message) {
    return String(message ?? "");
  }

  function normalizeSenders(senders) {
    const list = Array.isArray(senders)
      ? senders
      : String(senders ?? "").split(/[,;\n]+/);
    return [...new Set(list.map((name) => String(name).trim()).filter(Boolean))];
  }

  function buildCampaign(records, options = {}) {
    const discounts = { ...DEFAULT_DISCOUNTS, ...(options.discounts || {}) };
    const senders = normalizeSenders(options.senders);
    const template = templateWithoutForwarder(options.template || TEMPLATES[0].body);
    const requiresFinancialData = templateRequiresFinancialData(template);

    return records.map((record, index) => {
      const item = deriveRecord(record, discounts);
      if (!item.financialDataAvailable && requiresFinancialData) {
        const issue = "O modelo selecionado exige valores financeiros indisponíveis no relatório 245";
        if (!item.issues.includes(issue)) item.issues.push(issue);
        if (!item.blockingIssues.includes(issue)) item.blockingIssues.push(issue);
        item.hasBlockingIssues = true;
        item.status = "Revisar";
      }
      item.sender = senders.length ? senders[index % senders.length] : "";
      if (!item.sender) {
        item.issues.push("Quem encaminhará não informado");
        item.status = "Revisar";
      }
      item.message = finishMessage(renderTemplate(template, variablesFor(item, discounts)));
      return item;
    });
  }

  function csvCell(value) {
    const text = String(value ?? "");
    return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function safeCsvCell(value) {
    const text = String(value ?? "").replace(/\0/g, "");
    const protectedText = /^[\u0009\u000A\u000D\u0020]*[=+\-@]/.test(text) ? `'${text}` : text;
    return csvCell(protectedText);
  }

  function excludedRecordsToCsv(parsedReport) {
    if (!parsedReport || !Array.isArray(parsedReport.originalHeaders) || !Array.isArray(parsedReport.excludedRecords)) {
      throw new TypeError("Relatório de cobranças inválido para exportação.");
    }

    const headers = ["MOTIVO_EXCLUSAO", "CODIGO_MOTIVO", "LINHA_ORIGINAL", ...parsedReport.originalHeaders];
    const rows = parsedReport.excludedRecords.map((excluded) => {
      const originalRow = Array.isArray(excluded.originalRow)
        ? excluded.originalRow
        : parsedReport.originalHeaders.map((header) => excluded.originalValues?.[header] ?? "");
      return [excluded.reason, excluded.reasonCode, excluded.rowNumber, ...originalRow];
    });
    return `\uFEFF${[headers, ...rows].map((row) => row.map(safeCsvCell).join(";")).join("\r\n")}`;
  }

  function campaignToCsv(items) {
    const hasReview = items.some((item) => item.status !== "Pronto" || item.issues.length > 0);
    const relatorioSemValoresCampaign = items.length > 0
      && items.every((item) => item.sourceType === "report-245");
    if (relatorioSemValoresCampaign) {
      // Nenhum campo financeiro, mas COM o WhatsApp — sem o número a campanha
      // preventiva não tem como ser enviada.
      const headers = [
        "NOME",
        "NR. DOCUMENTO",
        "EMPRESA",
        ...(hasReview ? ["STATUS", "PENDÊNCIAS"] : []),
        "WHATSAPP",
        "MENSAGEM",
        "ENCAMINHADA POR",
      ];
      const rows = items.map((item) => {
        const row = [item.name, item.contract, item.company];
        if (hasReview) row.push(item.status === "Pronto" ? "" : "Revisar", item.issues.join(", "));
        row.push(item.phone, item.message, item.sender);
        return row;
      });
      return `\uFEFF${[headers, ...rows].map((row) => row.map(csvCell).join(";")).join("\r\n")}`;
    }

    const headers = [
      "NOME", "CPF", "CONTRATO", "EMPRESA", "QTD_ATRASO",
      "PARCELA_COM_DESCONTO", "QUITACAO", "VALOR_COM_JUROS", "JUNCAO", "ANUAL",
      "CARTAO_12X_QUITACAO", "CARTAO_12X_ANUAL",
      ...(hasReview ? ["STATUS", "PENDENCIAS"] : []),
      "WHATSAPP", "MENSAGEM", "ENCAMINHADA_POR",
    ];
    const rows = items.map((item) => {
      const row = [
        item.name,
        item.cpf,
        item.contract,
        item.company,
        item.overdueCount,
        formatCurrency(item.overdueDiscounted),
        formatCurrency(item.settlement),
        formatCurrency(item.valueWithInterest),
        formatCurrency(item.bundle),
        formatCurrency(item.annual),
        formatCurrency(item.cardSettlement),
        formatCurrency(item.cardAnnual),
      ];
      if (hasReview) row.push(item.status === "Pronto" ? "" : "Revisar", item.issues.join(", "));
      row.push(item.phone, item.message, item.sender);
      return row;
    });
    return `\uFEFF${[headers, ...rows].map((row) => row.map(csvCell).join(";")).join("\r\n")}`;
  }

  function templateById(id) {
    return TEMPLATES.find((template) => template.id === id) || TEMPLATES[0];
  }

  export const CampaignCore = Object.freeze({
    DEFAULT_DISCOUNTS,
    DEFAULT_SENDERS,
    TEMPLATES,
    normalizeHeader,
    parseDelimited,
    detectDelimiter,
    decodeBytes,
    parseMailing,
    isReport245Rows,
    parseReport245,
    parseNumber,
    parseNumberStrict,
    percentToRate,
    mapCompany,
    formatOperator,
    formatCurrency,
    formatPercent,
    deriveRecord,
    variablesFor,
    renderTemplate,
    templateRequiresFinancialData,
    normalizeSenders,
    buildCampaign,
    campaignToCsv,
    excludedRecordsToCsv,
    templateById,
    isValidPhone,
    phoneForWhatsApp,
  });
