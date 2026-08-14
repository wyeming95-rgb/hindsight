export function computeResult({
  amount,
  priceAtStart,
  priceAtEnd,
  fxToUSDAtStart,
  fxFromUSDAtEnd,
}) {
  const investedUSD = amount * fxToUSDAtStart;
  const shares = investedUSD / priceAtStart;
  const finalValueUSD = shares * priceAtEnd;
  const finalValue = finalValueUSD * fxFromUSDAtEnd;
  const profit = finalValue - amount;
  const returnPct = (finalValue / amount - 1) * 100;
  const multiple = finalValue / amount;
  return { investedUSD, shares, finalValueUSD, finalValue, profit, returnPct, multiple };
}
