import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Ideogram V4 Studio",
  description: "Explore Ideogram V4 structured prompts, bounding boxes, Generate, Remix, Magic Prompt, and Describe.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
