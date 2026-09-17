import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Xatlov — Davlat muassasalari reyestri',
  description: "VMQ-247: bo'sh turgan davlat ko'chmas mulk obyektlarini xatlovdan o'tkazish tizimi",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uz">
      <body>
        <header className="site-header">
          <div className="container">
            <strong>Xatlov</strong>
            <span className="muted"> · 1-bosqich: Davlat muassasalari ro&apos;yxati (STIR)</span>
          </div>
        </header>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
