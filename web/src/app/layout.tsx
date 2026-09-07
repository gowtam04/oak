import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Fredoka, Nunito_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import "../components/artifact/artifact-viewer.css";

import { SITE_DESCRIPTION, SITE_NAME, SITE_ORIGIN, SITE_TITLE, WEB_APP_JSONLD } from "@/lib/site";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title: {
    default: SITE_TITLE,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    siteName: SITE_NAME,
    type: "website",
    url: "/",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
  },
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
// tints the browser chrome to match the app background. This is a media pair
// keyed to `prefers-color-scheme` rather than the in-app `data-theme` toggle —
// Oak's dark mode is opt-in via the toggle, not OS-driven, so this tracks the
// OS preference rather than the actual active theme. That's an accepted
// mismatch: the browser chrome may not match the toggled-in-app theme, but it
// always matches *a* plausible theme rather than staying hardcoded light.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#121417" },
    { media: "(prefers-color-scheme: light)", color: "#F6F7F9" },
  ],
};

// Display (Fredoka) + body (Nunito Sans) + mono (JetBrains Mono). next/font
// self-hosts — no Google Fonts <link>. CSS aliases --display/--body/--mono
// onto these three variables (see globals.css).
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
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: WEB_APP_JSONLD }}
        />
        {children}
      </body>
    </html>
  );
}
