import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Fredoka, Nunito_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import "../components/artifact/artifact-viewer.css";

export const metadata: Metadata = {
  title: "Oak",
  description:
    "Ask anything about Pokémon — answers backed by reasoning, battle math, and cited sources.",
  icons: {
    icon: "/icon.svg",
    apple: "/apple-icon.png",
  },
};

// Mobile foundation: map the layout to the real device width and let the page
// bleed into the notch / home-indicator area so `env(safe-area-inset-*)` becomes
// non-zero (the header/composer pad themselves with it). `viewportFit: "cover"`
// is the prerequisite for any safe-area handling. We deliberately do NOT cap
// zoom (no maximumScale/userScalable) — that would break WCAG 1.4.4. themeColor
// tints the browser chrome to match the app background; it's a static light
// value (not a `prefers-color-scheme` media pair) since light is the
// unconditional default regardless of OS preference — dark is opt-in only via
// the in-app toggle, which a static viewport export can't react to anyway.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#fbf7f4",
};

// Display / body / mono — exposed as CSS variables consumed by globals.css.
const fredoka = Fredoka({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-display",
  display: "swap",
});
const nunitoSans = Nunito_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
  display: "swap",
});
const jetBrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-mono",
  display: "swap",
});

// Resolve the theme before first paint to avoid a flash of the wrong theme. A
// stored explicit choice wins; otherwise light is the unconditional default
// (no OS `prefers-color-scheme` fallback) — dark is opt-in only, via the
// toggle. Either way `data-theme` is set here so first paint is correct. Keep
// in sync with ThemeToggle's storage key + resolution.
const NO_FLASH_THEME = `(function(){try{var t=localStorage.getItem('oak-theme');if(t!=='light'&&t!=='dark'){t='light';}document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${fredoka.variable} ${nunitoSans.variable} ${jetBrainsMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_THEME }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
