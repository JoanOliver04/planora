import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { siteConfig } from "@/config/site";

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: { default: "Planora", template: "%s · Planora" },
  description: siteConfig.description.es,
  applicationName: siteConfig.name,
  category: "productivity",
  formatDetection: { telephone: false, address: false, email: false },
  openGraph: {
    type: "website",
    siteName: siteConfig.name,
    title: siteConfig.name,
    description: siteConfig.description.es,
    url: siteConfig.url,
    images: [{ url: "/assets/logo.png", width: 1024, height: 1024 }],
  },
  manifest: "/manifest.webmanifest",
  icons: { icon: "/assets/logo.ico" },
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Planora" },
};
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f8f4" },
    { media: "(prefers-color-scheme: dark)", color: "#10120f" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className={`${geist.variable} ${mono.variable}`}>{children}</body>
    </html>
  );
}
