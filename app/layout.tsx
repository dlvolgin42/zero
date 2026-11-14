import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Zero",
  description: "Общие траты с друзьями: кто кому сколько должен",
  // iOS: open from the home screen without the Safari address bar.
  appleWebApp: { capable: true, title: "Zero", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#f6f6f8",
  // Lets the app use the full screen, so the safe-area insets (notch, home bar) are reported.
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
