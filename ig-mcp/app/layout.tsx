export const metadata = { title: "Más Life · Instagram MCP" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 40 }}>{children}</body>
    </html>
  );
}
