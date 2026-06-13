import type { Metadata } from "next";
import {
  Bricolage_Grotesque,
  Schibsted_Grotesk,
  Sometype_Mono,
} from "next/font/google";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
  weight: ["400", "500", "600", "700"],
});

const schibsted = Schibsted_Grotesk({
  subsets: ["latin"],
  variable: "--font-schibsted",
  weight: ["400", "500", "600", "700"],
});

const sometype = Sometype_Mono({
  subsets: ["latin"],
  variable: "--font-sometype",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Rates Risk Engine",
  description:
    "Follow one inflation-regime curve shock through a Treasury book: exposure, loss, repricing gap, hedge recovery, attribution, and residual risk.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body
        className={`${bricolage.variable} ${schibsted.variable} ${sometype.variable}`}
      >
        {children}
      </body>
    </html>
  );
}
