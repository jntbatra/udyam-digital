import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { TopBar } from "@/components/TopBar";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Accel Business",
  description: "Get your business online in one sitting — advisor, one price, instant KYC, live tracker.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#e40000" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      {/* suppressHydrationWarning: browser extensions (e.g. Video Speed Controller adds "vsc-initialized") edit <body> before React loads */}
      <body className="min-h-full flex flex-col font-sans" suppressHydrationWarning>
        <TopBar />
        <main className="flex-1 w-full">{children}</main>
        <footer className="text-xs text-muted text-center py-8 px-4">
          Prototype with synthetic data · YTL Hackathon 2026 · Track A
        </footer>
      </body>
    </html>
  );
}
