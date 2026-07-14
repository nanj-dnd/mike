import type { Metadata } from "next";
import { Inter, EB_Garamond } from "next/font/google";
import "./globals.css";
import { Providers } from "@/app/components/providers";

const inter = Inter({
    variable: "--font-inter",
    subsets: ["latin"],
});

const ebGaramond = EB_Garamond({
    variable: "--font-eb-garamond",
    subsets: ["latin"],
    weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
    metadataBase: new URL("https://trygavel.in"),
    title: "Gavel - AI Legal Platform for Indian Law Firms",
    description:
        "AI-powered legal document analysis, drafting, and contract review built for Indian law — Indian statutes, courts, and drafting conventions.",
    icons: {
        icon: [
            { url: "/icon.svg", type: "image/svg+xml" },
            { url: "/favicon.ico" },
        ],
        apple: "/apple-touch-icon.png",
    },
    openGraph: {
        type: "website",
        url: "https://trygavel.in",
        siteName: "Gavel",
        title: "Gavel - AI Legal Platform for Indian Law Firms",
        description:
            "AI-powered legal document analysis, drafting, and contract review built for Indian law — Indian statutes, courts, and drafting conventions.",
        images: [
            {
                url: "/link-image.jpg",
                width: 1200,
                height: 651,
                alt: "Gavel",
            },
        ],
    },
    twitter: {
        card: "summary_large_image",
        title: "Gavel - AI Legal Platform for Indian Law Firms",
        description:
            "AI-powered legal document analysis, drafting, and contract review built for Indian law — Indian statutes, courts, and drafting conventions.",
        images: ["/link-image.jpg"],
    },
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        // suppressHydrationWarning: the inline script below may add the
        // "dark" class to <html> before React hydrates.
        <html lang="en" suppressHydrationWarning>
            <body
                className={`${inter.variable} ${ebGaramond.variable} font-sans antialiased`}
            >
                {/* Apply the saved theme before first paint to avoid a
                    light-mode flash. Key must match THEME_STORAGE_KEY in
                    contexts/ThemeContext.tsx. */}
                <script
                    dangerouslySetInnerHTML={{
                        __html: `(function(){try{var t=localStorage.getItem("gavel-theme");if(t==="dark"||(t==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches)){document.documentElement.classList.add("dark")}}catch(e){}})()`,
                    }}
                />
                <Providers>{children}</Providers>
            </body>
        </html>
    );
}
