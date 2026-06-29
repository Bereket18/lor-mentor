import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Inter } from "next/font/google";
import { QueryProvider } from "@/lib/query-provider";
import { ThemeProvider } from "@/lib/theme-provider";
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
    <html lang="en" suppressHydrationWarning data-scroll-behavior="smooth">
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
        {/* ThemeProvider (next-themes) injects a no-flash script and sets
            data-theme before paint — no manual inline <script> needed. */}
        <QueryProvider>
          <ThemeProvider>{children}</ThemeProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
