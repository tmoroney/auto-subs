import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import Head from "next/head";
import { ThemeProvider } from "@/components/ThemeProvider";

const geistSans = localFont({
  src: "../fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "../fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "AutoSubs" as string,
  description: "AI-Powered subtitle generation" as string,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="overflow-x-hidden">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased overflow-x-hidden`}
      >
        <Head>
          <link rel="icon" href="/favicon.ico" />
          <title>AutoSubs</title>
          <meta name="description" content={metadata.description ?? "Default Description"} />
        </Head>
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
