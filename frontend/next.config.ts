import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    /* config options here */
    reactCompiler: true,
    async redirects() {
        return [
            {
                source: "/labelling",
                destination: "https://amp-label-lab.anshulyemul.chatgpt.site/",
                permanent: false,
            },
            {
                source: "/labelling/:path*",
                destination: "https://amp-label-lab.anshulyemul.chatgpt.site/:path*",
                permanent: false,
            },
        ];
    },
    async rewrites() {
        return [
            {
                source: "/sitemap.xml",
                destination: "/api/sitemap/sitemap.xml",
            },
            {
                source: "/sitemap_:slug.xml",
                destination: "/api/sitemap/sitemap_:slug.xml",
            },
        ];
    },
    skipTrailingSlashRedirect: true,
};

export default nextConfig;
