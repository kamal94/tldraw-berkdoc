import type { TLDefaultColorTheme } from "tldraw";
import type { TLDefaultColorStyle, TLDefaultDashStyle } from "@shared/document-shape.types";

// Map dash style to CSS border-style
const dashToBorderStyle: Record<TLDefaultDashStyle, string> = {
  solid: "solid",
  dashed: "dashed",
  dotted: "dotted",
  draw: "solid", // 'draw' style renders as solid for collections
};

export function CollectionBackground({
  width,
  height,
  color,
  dash,
  theme,
}: {
  width: number;
  height: number;
  color: TLDefaultColorStyle;
  dash: TLDefaultDashStyle;
  theme: TLDefaultColorTheme;
}) {
  // Get the actual color values from the theme
  const colorValue = theme[color].semi; // Use semi-transparent version for background
  const borderColor = theme[color].solid; // Use solid for border

  return (
    <div
      className="rounded-xl shadow-xl"
      style={{
        width,
        height,
        backgroundColor: colorValue,
        borderWidth: dash === "draw" ? 0 : 2,
        borderStyle: dashToBorderStyle[dash],
        borderColor: borderColor,
      }}
    />
  );
}
