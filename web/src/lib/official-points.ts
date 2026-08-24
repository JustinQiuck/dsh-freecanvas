function decimalSeparator(locale: string) {
    return new Intl.NumberFormat(locale).formatToParts(1.1).find((part) => part.type === "decimal")?.value || ".";
}

/** Formats the server-calculated decimal-string points value without Number coercion. */
export function formatOfficialPoints(value: string, locale: string) {
    const matched = value.trim().match(/^(-?)(\d+)(?:\.(\d+))?$/);
    if (!matched) return "0";
    const [, sign, whole, fraction = ""] = matched;
    const formattedWhole = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(BigInt(`${sign}${whole}`));
    const visibleFraction = fraction.slice(0, 2).replace(/0+$/, "");
    return visibleFraction ? `${formattedWhole}${decimalSeparator(locale)}${visibleFraction}` : formattedWhole;
}
