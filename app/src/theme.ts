import {
  createTheme,
  defaultVariantColorsResolver,
  type MantineColorsTuple,
  type VariantColorsResolver,
} from "@mantine/core";

// Mantine palettes are only a fallback: the real colors come from the design tokens
// (CSS custom properties defined in styles/tokens.css for each direction and theme).
const brand: MantineColorsTuple = [
  "#e3f4ee",
  "#cdeade",
  "#9dd6c0",
  "#69c1a0",
  "#3fae85",
  "#27a075",
  "#189a6d",
  "#0f7a5e",
  "#0b684f",
  "#075641",
];

const dark: MantineColorsTuple = [
  "#ede9e1",
  "#c9c4ba",
  "#a29c90",
  "#77726a",
  "#4a4640",
  "#2c2a26",
  "#211f1c",
  "#181715",
  "#12110f",
  "#0e0e0c",
];

const isPrimary = (color: string | undefined) => !color || color === "brand" || color === "teal";

/** Maps Mantine variants onto the design tokens so every component follows both directions and themes. */
const variantColorResolver: VariantColorsResolver = (input) => {
  const base = defaultVariantColorsResolver(input);
  const { variant, color } = input;
  const danger = color === "red";
  if (variant === "filled") {
    if (isPrimary(color)) return { ...base, background: "var(--accent)", hover: "var(--accent-hover)", color: "var(--on-accent)", border: "none" };
    if (danger) return { ...base, background: "var(--danger)", hover: "color-mix(in srgb, var(--danger) 88%, black)", color: "#fff", border: "none" };
    if (color === "dark") return { ...base, background: "var(--ink)", hover: "var(--ink)", color: "var(--pane)", border: "none" };
  }
  if (variant === "light") {
    if (isPrimary(color)) return { ...base, background: "var(--accent-soft)", hover: "color-mix(in srgb, var(--accent-soft) 80%, var(--accent))", color: "var(--accent-text)", border: "none" };
    if (danger) return { ...base, background: "color-mix(in srgb, var(--danger) 11%, transparent)", hover: "color-mix(in srgb, var(--danger) 17%, transparent)", color: "var(--danger)", border: "none" };
    if (color === "gray") return { ...base, background: "var(--sunk)", hover: "var(--hover)", color: "var(--ink)", border: "none" };
  }
  if (variant === "subtle" || variant === "transparent") {
    if (color === "gray" || color === "dark") return { ...base, background: "transparent", hover: "var(--hover)", color: "var(--muted)", border: "none" };
    if (isPrimary(color)) return { ...base, background: "transparent", hover: "var(--hover)", color: "var(--accent-text)", border: "none" };
    if (danger) return { ...base, background: "transparent", hover: "var(--hover)", color: "var(--danger)", border: "none" };
  }
  if (variant === "default") {
    return { ...base, background: "var(--sunk)", hover: "var(--hover)", color: "var(--ink)", border: "none" };
  }
  if (variant === "outline" && isPrimary(color)) {
    return { ...base, background: "transparent", hover: "var(--accent-soft)", color: "var(--accent-text)", border: "1px solid var(--accent)" };
  }
  return base;
};

const R_INPUT = "var(--r-input)";

export const theme = createTheme({
  primaryColor: "brand",
  primaryShade: { light: 7, dark: 5 },
  colors: { brand, dark },
  variantColorResolver,
  fontFamily: "var(--font)",
  fontFamilyMonospace: "'JetBrains Mono', ui-monospace, Menlo, Consolas, monospace",
  headings: { fontFamily: "var(--font)", fontWeight: "700" },
  defaultRadius: "md",
  cursorType: "pointer",
  components: {
    Modal: {
      defaultProps: {
        centered: true,
        radius: "var(--r-modal)",
        overlayProps: { backgroundOpacity: 0.5, blur: 3, color: "rgb(8,10,10)" },
      },
    },
    Drawer: { defaultProps: { overlayProps: { backgroundOpacity: 0.5, blur: 2, color: "rgb(8,10,10)" } } },
    Button: { defaultProps: { radius: R_INPUT } },
    TextInput: { defaultProps: { radius: R_INPUT } },
    PasswordInput: { defaultProps: { radius: R_INPUT } },
    NumberInput: { defaultProps: { radius: R_INPUT } },
    Select: { defaultProps: { radius: R_INPUT } },
    Textarea: { defaultProps: { radius: "var(--r-card)" } },
    Menu: { defaultProps: { radius: "var(--r-card)", shadow: "lg" } },
    Popover: { defaultProps: { radius: "var(--r-card)", shadow: "lg" } },
    Alert: { defaultProps: { radius: "var(--r-card)" } },
    Card: { defaultProps: { radius: "var(--r-card)" } },
    Chip: { defaultProps: { radius: "var(--r-chip)" } },
    Badge: { defaultProps: { radius: "6px" } },
    ActionIcon: { defaultProps: { variant: "subtle", color: "gray" } },
    Tooltip: { defaultProps: { openDelay: 400, withArrow: true } },
    Notification: { defaultProps: { radius: "var(--r-card)" } },
  },
});
