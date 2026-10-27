import type { Metadata } from "next";
import localFont from "next/font/local";
import { brand } from "@/lib/brand";
import "./globals.css";

/*
 * Polices DM Sans et Sora (SIL Open Font License) hébergées dans le projet :
 * le build ne télécharge plus rien depuis Google Fonts, dont la réponse
 * faisait parfois échouer `next/font/google`. Fichiers variables, sous-ensemble latin.
 */
const dmSans = localFont({
  src: "./fonts/dm-sans-latin.woff2",
  variable: "--font-dm-sans",
  weight: "400 700",
  display: "swap",
});

const sora = localFont({
  src: "./fonts/sora-latin.woff2",
  variable: "--font-sora",
  weight: "500 700",
  display: "swap",
});

export const metadata: Metadata = {
  title: `${brand.agency} — ${brand.product}`,
  description: brand.description,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className={`${dmSans.variable} ${sora.variable} h-full`}>
      <body className="min-h-full antialiased">{children}</body>
    </html>
  );
}
