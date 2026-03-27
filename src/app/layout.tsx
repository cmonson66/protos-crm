import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Protos EQ CRM",
  description: "Protos EQ CRM",
  icons: {
    icon: "/protos-eq-logo.png",
    shortcut: "/protos-eq-logo.png",
    apple: "/protos-eq-logo.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}