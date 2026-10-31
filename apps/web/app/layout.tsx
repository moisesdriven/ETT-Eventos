import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "ETT Eventos", template: "%s · ETT Eventos" },
  description: "Costos de WhatsApp por evento, número y día",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-PE">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
