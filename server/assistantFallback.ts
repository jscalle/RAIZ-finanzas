// Regex-based fallback used when Gemini is unavailable. Moved verbatim out of server.ts.

export function buildLocalFallbackResult(
  text: string,
  fullContext: any,
  topics: Array<{ id: string; name: string; type: string }>,
  todayISO: string,
  hasImage: boolean
) {
  const isQuery =
    /\?|cu[aá]nto|c[oó]mo|resumen|presupuesto|saldo|disponible|an[aá]lisis|gastado|llevo|queda|categor[ií]a|movimientos|historial|estado|balance/i.test(
      text
    ) || (!/\d{3,}/.test(text) && !hasImage);

  if (isQuery && fullContext) {
    const fs = fullContext.financialSummary || {};
    const fmt = (n: number) => `$${Math.round(Number(n) || 0).toLocaleString("es-CO")}`;
    const catLines = (fullContext.categoryBreakdown || [])
      .map((c: any) => {
        const icon = c.percentUsed >= 100 ? "🔴" : c.percentUsed >= 80 ? "🟡" : "🟢";
        const limitStr =
          c.monthlyLimit > 0
            ? ` / ${fmt(c.monthlyLimit)} (${c.percentUsed}% · Queda: ${fmt(c.remainingBudget)})`
            : "";
        const avgStr = c.averageMonthly > 0 ? `\n  ↳ _Promedio real: ${fmt(c.averageMonthly)}/mes_` : "";
        return `${icon} *${c.category}*: *${fmt(c.spentThisMonth)}*${limitStr}${avgStr}`;
      })
      .join("\n");

    const unpaidList = (fullContext.unpaidCreditExpenses || [])
      .slice(0, 6)
      .map((u: any) => `• ${u.date}: *${fmt(u.amount)}* — ${u.description} (${u.category})`)
      .join("\n");

    const recentLines = (fullContext.recentRecords || [])
      .slice(0, 5)
      .map(
        (r: any) =>
          `• ${r.date}: ${r.type === "INCOME" ? "🟢" : "🔴"} *${fmt(r.amount)}* — ${r.description} (${r.category})`
      )
      .join("\n");

    const chatResponse =
      `📊 *Tu Panorama Financiero (${fullContext.currentMonth})*\n\n` +
      `💰 *Disponible Real para Gastar (Libre después de Topes y Ahorro)*: *${fmt(fs.disponibleRealParaGastar)}*\n` +
      `_(${fs.formulaDisponibleReal})_\n\n` +
      `📈 *1. Resumen del Mes (${fullContext.currentMonth})*\n` +
      `• 🟢 *Ingresos*: *${fmt(fs.ingresosMesActual)}*\n` +
      `• 🔴 *Gastos (Consumo Real del Mes)*: *${fmt(fs.gastosConsumoRealMesActual)}*\n` +
      `  ↳ _Pagado con Débito / Efectivo_: ${fmt(fs.gastosDebitoEfectivoMesActual)}\n` +
      `  ↳ _Compras con TC este mes_: ${fmt(fs.comprasConTcMesActual)}\n` +
      `• 🐷 *Ahorros del mes*: *${fmt(fs.ahorroMesActual)}*\n\n` +
      `🎯 *2. Estado de Topes Planeados vs. Gasto Real*\n` +
      `• *Reserva en Topes aún por Ejecutar*: *${fmt(fs.reservaEnTopesPorEjecutar)}*\n` +
      `• *Topes planeados*: ${fmt(fs.totalBudgetLimit)} · *Excesos fuera de tope*: *${fmt(fs.excesosFueraDeTope)}*\n` +
      `• *Pagos a Tarjetas este mes*: ${fmt(fs.pagosTarjetasCreditoMesActual)}\n\n` +
      `💳 *3. Compras con TC en la App sin Cruzar: ${fmt(fs.deudaTcPendienteTotal)}*\n` +
      (unpaidList ? `${unpaidList}\n\n` : `_Sin compras con TC pendientes de cruzar._\n\n`) +
      `📁 *4. Categorías: Gasto Mes vs. Tope y Promedio Real*\n${catLines || "Sin gastos este mes"}\n\n` +
      `🕒 *Últimos movimientos:*\n${recentLines || "Sin movimientos recientes"}`;

    return {
      intent: "QUERY",
      chatResponse,
      skippedSummary: "",
      transactions: [],
    };
  }

  if (hasImage && !/\d{3,}/.test(text)) {
    return {
      intent: "QUERY",
      chatResponse:
        `⚠️ *Créditos de Google AI Studio agotados (Error 402)*\n\n` +
        `Recibí tu imagen, pero tu llave de Gemini AI reporta: _"Your prepayment credits are depleted"_ en https://ai.studio/projects.\n\n` +
        `💡 *Mientras recargas o activas el plan en AI Studio*, puedes enviarme el gasto por texto (ej: _"Cena en Rómulo 45000 con crédito"_) o escribirme el monto junto con la foto y lo procesaré con el motor local.`,
      skippedSummary: "",
      transactions: [],
    };
  }

  // Parse one or more text lines with numbers into transactions
  const lines = text
    .split(/\n|;/)
    .map((l) => l.trim())
    .filter((l) => /\d{3,}/.test(l));

  const txList = (lines.length > 0 ? lines : [text]).map((line) => {
    const isIncome = /ingreso|abono|recib[ií]|salario|n[oó]mina|pagaron/i.test(line);
    const isCredit = /\btc\b|cr[eé]dito|tarjeta de cr[eé]dito/i.test(line);
    const isCash = /efectivo|cash/i.test(line);
    const amountMatch = line.match(/(?:\$|cop)?\s*(\d{1,3}(?:[\.,]\d{3})+|\d{4,})/i);
    let amount = 0;
    if (amountMatch) {
      amount = parseFloat(amountMatch[1].replace(/[\.,]/g, "")) || 0;
    }
    const matchedTopic =
      topics.find((t) => line.toLowerCase().includes(t.name.toLowerCase())) ||
      (/pago tarjeta|pago tc|abono tarjeta|tarjeta nu|cuota tarjeta/i.test(line)
        ? topics.find((t) => /tarjeta/i.test(t.name))
        : null) ||
      (/nido|natillera|declaraci[oó]n|compromiso|fijo/i.test(line)
        ? topics.find((t) => /compromiso|fijo/i.test(t.name))
        : null) ||
      (/perro|perrito|gato|concentrado|veterinari|mascota/i.test(line)
        ? topics.find((t) => /mascota/i.test(t.name))
        : null) ||
      (/epm|internet|claro|tigo|movistar|celular|agua|luz|energ[ií]a|servicios p[uú]blicos/i.test(line)
        ? topics.find((t) => /servicios/i.test(t.name))
        : null) ||
      (/claude|openai|chatgpt|cursor|google|icloud|apple|gcp|aws|spotify|netflix|suscripci/i.test(line)
        ? topics.find((t) => /suscripciones|nube/i.test(t.name))
        : null) ||
      (/tenis|cancha|caddie|pelotas|torneo|raqueta|deporte|gym/i.test(line)
        ? topics.find((t) => /tenis|deporte|ocio/i.test(t.name))
        : null) ||
      (/restaurante|r[oó]mulo|domicilio|rappi|almuerzo|cena|desayuno|hamburguesa|pizza|caf[eé]|helado|postre|comidas extra/i.test(line)
        ? topics.find((t) => /comidas extra/i.test(t.name))
        : null) ||
      (/mercado|supermercado|d1|[eé]xito|carulla|euro|vaquita|fruver|carne|pollo|huevos|alimentaci[oó]n/i.test(line)
        ? topics.find((t) => /alimentaci/i.test(t.name))
        : null) ||
      (/uber|taxi|didi|gasolina|tanquead|peaje|parqueadero|transporte|bus|metro|flypass/i.test(line)
        ? topics.find((t) => /transporte/i.test(t.name))
        : null) ||
      (/m[eé]dico|pediatra|cita|farmacia|droguer[ií]a|medicamento|regalo|salud|imprevisto/i.test(line)
        ? topics.find((t) => /salud|imprevisto/i.test(t.name))
        : null) ||
      topics.find((t) => t.type === (isIncome ? "INCOME" : "EXPENSE")) ||
      topics[0];

    const cleanDesc =
      line
        .replace(/(?:\$|cop)?\s*(\d{1,3}(?:[\.,]\d{3})+|\d{4,})/gi, "")
        .replace(/\b(con|en|por|de|el|la|los|las|tc|cr[eé]dito|d[eé]bito|efectivo|pesos|cop)\b/gi, " ")
        .replace(/\s+/g, " ")
        .trim() || "Movimiento Telegram";

    return {
      type: isIncome ? "INCOME" : "EXPENSE",
      amount,
      currency: "COP",
      description: cleanDesc.charAt(0).toUpperCase() + cleanDesc.slice(1),
      category: matchedTopic ? matchedTopic.name : "Gastos imprevistos",
      paymentMethod: isIncome ? (isCash ? "EFECTIVO" : "DIGITAL") : isCredit ? "CREDITO" : isCash ? "EFECTIVO" : "DEBITO",
      date: todayISO,
      explanation: "Procesado por motor local (Créditos de Gemini AI agotados en AI Studio).",
    };
  });

  return {
    intent: "RECORD",
    chatResponse: "",
    skippedSummary: "",
    transactions: txList,
  };
}
