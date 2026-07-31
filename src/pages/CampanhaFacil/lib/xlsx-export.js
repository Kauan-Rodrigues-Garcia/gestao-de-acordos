// ─────────────────────────────────────────────────────────────────────────────
// Escritor XLSX do Campanha Fácil — PORTADO VERBATIM do app original.
// Só o cabeçalho/rodapé mudaram: IIFE global → ES module export. Gera o .xlsx
// (ZIP + XML) do zero, sem depender de SheetJS. Tipos em xlsx-export.d.ts.
// ─────────────────────────────────────────────────────────────────────────────

  const encoder = new TextEncoder();

  function xmlEscape(value) {
    return String(value ?? "")
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function columnLetter(index) {
    let value = index + 1;
    let result = "";
    while (value > 0) {
      value -= 1;
      result = String.fromCharCode(65 + (value % 26)) + result;
      value = Math.floor(value / 26);
    }
    return result;
  }

  function inlineCell(ref, value, style = 2) {
    const safe = xmlEscape(value);
    return `<c r="${ref}" t="inlineStr" s="${style}"><is><t xml:space="preserve">${safe}</t></is></c>`;
  }

  function numericCell(ref, value, style = 3) {
    const number = Number(value) || 0;
    return `<c r="${ref}" s="${style}"><v>${number}</v></c>`;
  }

  function buildRow(rowNumber, cells, height = 28) {
    return `<row r="${rowNumber}" ht="${height}" customHeight="1">${cells.join("")}</row>`;
  }

  function buildCampaignSheet(items) {
    const hasReview = items.some((item) => item.status !== "Pronto" || item.issues.length > 0);
    const compactReport = items.length > 0 && items.every(
      (item) => item.financialDataAvailable === false || item.sourceType === "report-245",
    );
    const headers = compactReport
      // Sem nenhum campo financeiro — mas COM o WhatsApp, montado por DDD 1 +
      // Telefone 1. Ele faltava aqui, e sem o número a planilha do preventivo
      // não servia para enviar nada.
      ? [
        "NOME",
        "NR. DOCUMENTO",
        "EMPRESA",
        ...(hasReview ? ["STATUS", "PENDÊNCIAS"] : []),
        "WHATSAPP",
        "MENSAGEM",
        "ENCAMINHADA POR",
      ]
      : [
        "NOME",
        "CPF",
        "CONTRATO",
        "EMPRESA",
        "QTD. ATRASO",
        "PARCELA COM DESCONTO",
        "QUITAÇÃO",
        "VALOR COM JUROS",
        "JUNÇÃO",
        "ANUAL",
        "CARTÃO 12X QUITAÇÃO",
        "CARTÃO 12X ANUAL",
        ...(hasReview ? ["STATUS", "PENDÊNCIAS"] : []),
        "WHATSAPP",
        "MENSAGEM",
        "ENCAMINHADA POR",
      ];
    const widths = compactReport
      ? [31, 18, 23, ...(hasReview ? [13, 29] : []), 19, 86, 25]
      : [
        31, 16, 15, 23, 13, 22, 16, 19, 15, 15, 23, 20,
        ...(hasReview ? [13, 29] : []),
        19, 86, 25,
      ];
    const columns = widths
      .map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`)
      .join("");

    const rows = [];
    rows.push(buildRow(1, headers.map((header, index) => inlineCell(`${columnLetter(index)}1`, header, 1)), 32));

    items.forEach((item, itemIndex) => {
      const rowNumber = itemIndex + 2;
      if (compactReport) {
        const cells = [item.name, item.contract, item.company]
          .map((value, index) => inlineCell(`${columnLetter(index)}${rowNumber}`, value, 2));
        let columnIndex = 3;
        if (hasReview) {
          const visibleStatus = item.status === "Pronto" ? "" : "Revisar";
          cells.push(inlineCell(`${columnLetter(columnIndex)}${rowNumber}`, visibleStatus, item.status === "Pronto" ? 2 : 6));
          columnIndex += 1;
          cells.push(inlineCell(`${columnLetter(columnIndex)}${rowNumber}`, item.issues.join(", "), 2));
          columnIndex += 1;
        }
        cells.push(inlineCell(`${columnLetter(columnIndex)}${rowNumber}`, item.phone, 2));
        columnIndex += 1;
        cells.push(inlineCell(`${columnLetter(columnIndex)}${rowNumber}`, item.message, 7));
        columnIndex += 1;
        cells.push(inlineCell(`${columnLetter(columnIndex)}${rowNumber}`, item.sender, 8));
        rows.push(buildRow(rowNumber, cells, 30));
        return;
      }

      const textValues = [
        item.name,
        item.cpf,
        item.contract,
        item.company,
      ];
      const cells = textValues.map((value, index) => inlineCell(`${columnLetter(index)}${rowNumber}`, value, 2));
      cells.push(numericCell(`E${rowNumber}`, item.overdueCount, 4));
      [item.overdueDiscounted, item.settlement, item.valueWithInterest, item.bundle, item.annual, item.cardSettlement, item.cardAnnual]
        .forEach((value, index) => cells.push(numericCell(`${columnLetter(index + 5)}${rowNumber}`, value, 3)));
      let columnIndex = 12;
      if (hasReview) {
        const visibleStatus = item.status === "Pronto" ? "" : "Revisar";
        cells.push(inlineCell(`${columnLetter(columnIndex)}${rowNumber}`, visibleStatus, item.status === "Pronto" ? 2 : 6));
        columnIndex += 1;
        cells.push(inlineCell(`${columnLetter(columnIndex)}${rowNumber}`, item.issues.join(", "), 2));
        columnIndex += 1;
      }
      cells.push(inlineCell(`${columnLetter(columnIndex)}${rowNumber}`, item.phone, 2));
      columnIndex += 1;
      cells.push(inlineCell(`${columnLetter(columnIndex)}${rowNumber}`, item.message, 7));
      columnIndex += 1;
      cells.push(inlineCell(`${columnLetter(columnIndex)}${rowNumber}`, item.sender, 8));
      rows.push(buildRow(rowNumber, cells, 30));
    });

    const lastRow = Math.max(1, items.length + 1);
    const lastColumn = columnLetter(headers.length - 1);
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:${lastColumn}${lastRow}"/>
  <sheetViews><sheetView showGridLines="0" workbookViewId="0"><pane xSplit="1" ySplit="1" topLeftCell="B2" activePane="bottomRight" state="frozen"/><selection pane="bottomRight" activeCell="B2" sqref="B2"/></sheetView></sheetViews>
  <sheetFormatPr defaultRowHeight="18"/>
  <cols>${columns}</cols>
  <sheetData>${rows.join("")}</sheetData>
  <autoFilter ref="A1:${lastColumn}${lastRow}"/>
  <pageMargins left="0.25" right="0.25" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>
  <pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>
</worksheet>`;
  }

  function aggregate(items, key) {
    const counts = new Map();
    items.forEach((item) => {
      const name = String(item[key] || "Não informado").trim() || "Não informado";
      const current = counts.get(name) || { total: 0, ready: 0, review: 0 };
      current.total += 1;
      if (item.status === "Pronto") current.ready += 1;
      else current.review += 1;
      counts.set(name, current);
    });
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0], "pt-BR"));
  }

  function buildSendersSheet(items) {
    const campaignSenders = aggregate(items, "sender");
    const hasReview = items.some((item) => item.status !== "Pronto" || item.issues.length > 0);
    const headers = ["ENCAMINHADA POR", "CONTATOS", ...(hasReview ? ["REVISAR"] : [])];
    const rows = [];
    rows.push(`<row r="1" ht="34" customHeight="1">${inlineCell("A1", "USUÁRIOS QUE ENCAMINHARÃO A CAMPANHA", 9)}</row>`);
    rows.push(buildRow(2, headers.map((header, index) => inlineCell(`${columnLetter(index)}2`, header, 1)), 28));
    campaignSenders.forEach(([name, counts], index) => {
      const row = index + 3;
      const cells = [
        inlineCell(`A${row}`, name, 8),
        numericCell(`B${row}`, counts.total, 4),
      ];
      if (hasReview) cells.push(numericCell(`C${row}`, counts.review, 4));
      rows.push(buildRow(row, cells, 26));
    });

    const lastRow = 2 + campaignSenders.length;
    const lastColumn = columnLetter(headers.length - 1);
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:${lastColumn}${lastRow}"/>
  <sheetViews><sheetView showGridLines="0" workbookViewId="0"/></sheetViews>
  <sheetFormatPr defaultRowHeight="18"/>
  <cols><col min="1" max="1" width="32" customWidth="1"/><col min="2" max="${headers.length}" width="14" customWidth="1"/></cols>
  <sheetData>${rows.join("")}</sheetData>
  <mergeCells count="1"><mergeCell ref="A1:${lastColumn}1"/></mergeCells>
  <pageMargins left="0.5" right="0.5" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>
</worksheet>`;
  }

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;R$&quot; #,##0"/></numFmts>
  <fonts count="3">
    <font><sz val="10"/><color rgb="FF17233A"/><name val="Aptos"/><family val="2"/></font>
    <font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Aptos"/><family val="2"/></font>
    <font><b/><sz val="12"/><color rgb="FFFFFFFF"/><name val="Aptos Display"/><family val="2"/></font>
  </fonts>
  <fills count="6">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF0B1F3A"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFE6F8F1"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFFF3D9"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF0EBFF"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border><left style="thin"><color rgb="FFE1E7EF"/></left><right style="thin"><color rgb="FFE1E7EF"/></right><top style="thin"><color rgb="FFE1E7EF"/></top><bottom style="thin"><color rgb="FFE1E7EF"/></bottom><diagonal/></border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="10">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="4" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="0"/></xf>
    <xf numFmtId="0" fontId="0" fillId="5" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
    <xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

  function uint16(value) {
    const bytes = new Uint8Array(2);
    new DataView(bytes.buffer).setUint16(0, value, true);
    return bytes;
  }

  function uint32(value) {
    const bytes = new Uint8Array(4);
    new DataView(bytes.buffer).setUint32(0, value >>> 0, true);
    return bytes;
  }

  function concatBytes(parts) {
    const length = parts.reduce((total, part) => total + part.length, 0);
    const output = new Uint8Array(length);
    let offset = 0;
    parts.forEach((part) => {
      output.set(part, offset);
      offset += part.length;
    });
    return output;
  }

  const crcTable = (() => {
    const table = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
      table[index] = value >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }

  function dosDateTime(date = new Date()) {
    const year = Math.max(1980, date.getFullYear());
    return {
      time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
      date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    };
  }

  function zipFiles(files) {
    const localParts = [];
    const centralParts = [];
    const timestamp = dosDateTime();
    let localOffset = 0;

    files.forEach(({ name, content }) => {
      const nameBytes = encoder.encode(name);
      const data = typeof content === "string" ? encoder.encode(content) : content;
      const crc = crc32(data);
      const localHeader = concatBytes([
        uint32(0x04034b50), uint16(20), uint16(0x0800), uint16(0), uint16(timestamp.time), uint16(timestamp.date),
        uint32(crc), uint32(data.length), uint32(data.length), uint16(nameBytes.length), uint16(0), nameBytes,
      ]);
      localParts.push(localHeader, data);

      const centralHeader = concatBytes([
        uint32(0x02014b50), uint16(20), uint16(20), uint16(0x0800), uint16(0), uint16(timestamp.time), uint16(timestamp.date),
        uint32(crc), uint32(data.length), uint32(data.length), uint16(nameBytes.length), uint16(0), uint16(0), uint16(0),
        uint16(0), uint32(0), uint32(localOffset), nameBytes,
      ]);
      centralParts.push(centralHeader);
      localOffset += localHeader.length + data.length;
    });

    const centralDirectory = concatBytes(centralParts);
    const end = concatBytes([
      uint32(0x06054b50), uint16(0), uint16(0), uint16(files.length), uint16(files.length),
      uint32(centralDirectory.length), uint32(localOffset), uint16(0),
    ]);
    return concatBytes([...localParts, centralDirectory, end]);
  }

  function createWorkbook(items) {
    const createdAt = new Date().toISOString();
    const files = [
      {
        name: "[Content_Types].xml",
        content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`,
      },
      {
        name: "_rels/.rels",
        content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`,
      },
      {
        name: "xl/workbook.xml",
        content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets><sheet name="Campanha" sheetId="1" r:id="rId1"/><sheet name="Encaminhada por" sheetId="2" r:id="rId2"/></sheets><calcPr calcId="191029"/></workbook>`,
      },
      {
        name: "xl/_rels/workbook.xml.rels",
        content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
      },
      { name: "xl/styles.xml", content: stylesXml },
      { name: "xl/worksheets/sheet1.xml", content: buildCampaignSheet(items) },
      { name: "xl/worksheets/sheet2.xml", content: buildSendersSheet(items) },
      {
        name: "docProps/core.xml",
        content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>Campanha pronta</dc:title><dc:creator>Campanha Fácil</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${createdAt}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${createdAt}</dcterms:modified></cp:coreProperties>`,
      },
      {
        name: "docProps/app.xml",
        content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Campanha Fácil</Application><DocSecurity>0</DocSecurity><ScaleCrop>false</ScaleCrop><HeadingPairs><vt:vector size="2" baseType="variant"><vt:variant><vt:lpstr>Planilhas</vt:lpstr></vt:variant><vt:variant><vt:i4>2</vt:i4></vt:variant></vt:vector></HeadingPairs><TitlesOfParts><vt:vector size="2" baseType="lpstr"><vt:lpstr>Campanha</vt:lpstr><vt:lpstr>Encaminhada por</vt:lpstr></vt:vector></TitlesOfParts></Properties>`,
      },
    ];
    return zipFiles(files);
  }

  function isValidWorkbook(bytes) {
    if (!(bytes instanceof Uint8Array) || bytes.byteLength <= 1000 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
      return false;
    }
    const minimumOffset = Math.max(0, bytes.byteLength - 65557);
    for (let index = bytes.byteLength - 22; index >= minimumOffset; index -= 1) {
      if (bytes[index] === 0x50 && bytes[index + 1] === 0x4b && bytes[index + 2] === 0x05 && bytes[index + 3] === 0x06) {
        return true;
      }
    }
    return false;
  }

  export const CampaignXlsx = Object.freeze({ createWorkbook, isValidWorkbook });
