import type { Metadata } from "next";
import { DM_Sans, Sora } from "next/font/google";
import { brand } from "@/lib/brand";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
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
