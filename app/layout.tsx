import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lúmina — Cine abierto, sin vueltas",
  description: "Buscador de películas de dominio público con prioridad para audio dual y alta resolución.",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body>{children}</body></html>;
}
