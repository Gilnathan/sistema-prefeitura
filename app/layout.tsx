import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Ações Realizadas | Prefeitura Municipal de Belmonte",
  description:
    "Portal de registro de ações realizadas, relatórios e mídias da Prefeitura Municipal de Belmonte.",
  icons: {
    icon: "/logo-belmonte.jpg",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
