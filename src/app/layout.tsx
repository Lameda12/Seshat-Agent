import { connection } from "next/server";
import "./globals.css";
export const metadata = {
  icons: { icon: "/icon.svg" },
  title: "Seshat · Know what comes next",
  description: "An evidence-first budget assistant for irregular income.",
};
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  await connection();
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
