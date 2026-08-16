export const CURRENCIES = [
  { code: "USD", symbol: "$",   locale: "en-US" },
  { code: "EUR", symbol: "€",   locale: "de-DE" },
  { code: "GBP", symbol: "£",   locale: "en-GB" },
  { code: "JPY", symbol: "¥",   locale: "ja-JP" },
  { code: "CAD", symbol: "C$",  locale: "en-CA" },
  { code: "AUD", symbol: "A$",  locale: "en-AU" },
  { code: "CHF", symbol: "CHF", locale: "de-CH" },
  { code: "CNY", symbol: "¥",   locale: "zh-CN" },
  { code: "INR", symbol: "₹",   locale: "en-IN" },
  { code: "HKD", symbol: "HK$", locale: "zh-HK" },
  { code: "SGD", symbol: "S$",  locale: "en-SG" },
  { code: "MYR", symbol: "RM",  locale: "ms-MY" },
];

// US dividend withholding by the chosen currency's representative country
// (portfolio-dividend treaty rate; statutory 30% where there is no US treaty).
// Currency is a proxy for tax residence — an educational approximation.
export const WITHHOLDING_RATES = {
  USD: 0, EUR: 0.15, GBP: 0.15, JPY: 0.10, CAD: 0.15, AUD: 0.15,
  CHF: 0.15, CNY: 0.10, INR: 0.25, HKD: 0.30, SGD: 0.30, MYR: 0.30,
};

export function withholdingRateFor(currencyCode) {
  return WITHHOLDING_RATES[currencyCode] ?? 0;
}

export function formatMoney(value, currencyCode) {
  const c = CURRENCIES.find((x) => x.code === currencyCode) ?? CURRENCIES[0];
  return new Intl.NumberFormat(c.locale, {
    style: "currency",
    currency: c.code,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatMultiple(multiple) {
  return `${multiple.toFixed(1)}×`;
}

export function formatPct(returnPct) {
  const sign = returnPct >= 0 ? "+" : "-";
  return `${sign}${Math.abs(returnPct).toFixed(1)}%`;
}

export function computeResult({
  amount,
  priceAtStart,
  priceAtEnd,
  fxToUSDAtStart,
  fxFromUSDAtEnd,
  dividendMultiplier = 1,
}) {
  const investedUSD = amount * fxToUSDAtStart;
  const shares = investedUSD / priceAtStart;          // initial shares
  const finalShares = shares * dividendMultiplier;    // after DRIP
  const finalValueUSD = finalShares * priceAtEnd;
  const finalValue = finalValueUSD * fxFromUSDAtEnd;
  const priceComponent = shares * priceAtEnd * fxFromUSDAtEnd; // price growth alone
  const dividendComponent = finalValue - priceComponent;      // reinvested dividends
  const profit = finalValue - amount;
  const returnPct = (finalValue / amount - 1) * 100;
  const multiple = finalValue / amount;
  return {
    investedUSD, shares, finalShares, finalValueUSD, finalValue,
    priceComponent, dividendComponent, profit, returnPct, multiple,
  };
}

export function rankResults(entries) {
  const sorted = [...entries].sort((a, b) => {
    if (b.result.finalValue !== a.result.finalValue) {
      return b.result.finalValue - a.result.finalValue;
    }
    return a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0;
  });
  return sorted.map((e, i) => ({ ...e, rank: i + 1 }));
}

export function subtractMonths(isoDate, months) {
  const [y, m, d] = isoDate.split("-").map(Number);
  // Zero-index the day first so setUTCMonth can't roll the date forward into
  // the next month when the target month is shorter than the source day.
  // e.g. "2026-03-31" minus 1 month must land in February, not "2026-03-03".
  const dt = new Date(Date.UTC(y, m - 1, 1));
  dt.setUTCMonth(dt.getUTCMonth() - months);
  // Clamp the day to the last valid day of the resulting month.
  const lastDay = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate();
  dt.setUTCDate(Math.min(d, lastDay));
  return dt.toISOString().slice(0, 10);
}

export function computeRegret(points, opts) {
  const { startDate, monthsEarlier, amount, fxToUSDAtStart, fxFromUSDAtEnd, priceAtEnd, actualFinalValue } = opts;
  const earlierTarget = subtractMonths(startDate, monthsEarlier);
  if (points.length === 0 || earlierTarget < points[0].date) {
    return { available: false, earlierDate: null, earlierFinalValue: null, extraValue: null };
  }
  const pt = points.find((p) => p.date >= earlierTarget) || points[points.length - 1];
  const investedUSD = amount * fxToUSDAtStart;
  const earlierFinalValue = (investedUSD / pt.close) * priceAtEnd * fxFromUSDAtEnd;
  return {
    available: true,
    earlierDate: pt.date,
    earlierFinalValue,
    extraValue: earlierFinalValue - actualFinalValue,
  };
}

// Simulates dividend reinvestment (DRIP) over a price series. Returns the
// cumulative share multiplier at the end and a per-point path of that
// multiplier. A dividend applies when startDate < exDate <= last point's
// date, buying more shares at the close of the first point on/after its
// ex-date, net of withholding.
export function simulateDrip(points, dividends, startDate, withholdingRate = 0) {
  const path = new Array(points.length).fill(1);
  if (points.length === 0) return { multiplierAtEnd: 1, path };

  const lastDate = points[points.length - 1].date;
  const inWindow = (dividends || [])
    .filter((d) => d.exDate > startDate && d.exDate <= lastDate)
    .sort((a, b) => (a.exDate < b.exDate ? -1 : a.exDate > b.exDate ? 1 : 0));

  let multiplier = 1;
  let divIdx = 0;
  for (let i = 0; i < points.length; i++) {
    // points[i] is the first point on/after any dividend applied here, so its
    // close is the reinvestment price.
    while (divIdx < inWindow.length && inWindow[divIdx].exDate <= points[i].date) {
      const net = inWindow[divIdx].amount * (1 - withholdingRate);
      if (points[i].close > 0) multiplier *= 1 + net / points[i].close;
      divIdx++;
    }
    path[i] = multiplier;
  }
  return { multiplierAtEnd: multiplier, path };
}
