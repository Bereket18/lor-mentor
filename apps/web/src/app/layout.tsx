import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Inter } from "next/font/google";
import Script from "next/script";
import "./globals.css";

// Inter for body text
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Lor Mentor — AI Medical Learning",
  description:
    "Ethiopia's most advanced medical learning platform for Lorcan Medical College.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-scroll-behavior="smooth"
      // No data-theme here — script below sets it from localStorage
      // This prevents flash of wrong theme
    >
      <body
        className={`
        ${GeistSans.variable}
        ${GeistMono.variable}
        ${inter.variable}
        font-sans
        antialiased
        bg-base
        text-primary
        min-h-screen
      `}
      >
        {/* Set theme BEFORE React renders — prevents flash */}
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var theme = localStorage.getItem('lm-theme') || 'dark';
                  document.documentElement.setAttribute('data-theme', theme);
                } catch(e) {}
              })();
            `,
          }}
        />
        {children}
      </body>
    </html>
  );
}
