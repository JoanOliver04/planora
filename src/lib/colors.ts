const fallbackAccent = "#4f6b45";

function channels(value: string) {
  const hex = /^#[\da-f]{6}$/i.test(value) ? value : fallbackAccent;
  return [1, 3, 5].map((offset) =>
    Number.parseInt(hex.slice(offset, offset + 2), 16),
  );
}

/** WCAG relative luminance, with sRGB channels converted to linear light. */
export function relativeLuminance(color: string) {
  const [red, green, blue] = channels(color).map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

export function contrastRatio(first: string, second: string) {
  const values = [relativeLuminance(first), relativeLuminance(second)];
  return (Math.max(...values) + 0.05) / (Math.min(...values) + 0.05);
}

export function contrastForeground(background: string) {
  return contrastRatio(background, "#000000") >=
    contrastRatio(background, "#ffffff")
    ? "#000000"
    : "#ffffff";
}

function mix(first: string, second: string, amount: number) {
  const target = channels(second);
  return (
    "#" +
    channels(first)
      .map((value, index) =>
        Math.round(value * (1 - amount) + target[index] * amount)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}

function readableText(accent: string, backgrounds: string[], target: string) {
  for (let step = 0; step <= 100; step++) {
    const candidate = mix(accent, target, step / 100);
    if (
      backgrounds.every(
        (background) => contrastRatio(candidate, background) >= 4.6,
      )
    )
      return candidate;
  }
  return target;
}

/** Keep the selected accent on fills, and derive readable text for each theme. */
export function accessibleAccent(value: string) {
  const accent = /^#[\da-f]{6}$/i.test(value) ? value : fallbackAccent;
  const foreground = contrastForeground(accent);
  return {
    foreground,
    hover: mix(accent, foreground === "#ffffff" ? "#000000" : "#ffffff", 0.16),
    lightText: readableText(
      accent,
      ["#ffffff", "#f3f5ef", "#e9eee5", mix("#ffffff", accent, 0.2)],
      "#000000",
    ),
    darkText: readableText(
      accent,
      ["#181d16", "#222a1f", "#293725", mix("#181d16", accent, 0.2)],
      "#ffffff",
    ),
  };
}
