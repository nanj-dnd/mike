import Link from "next/link";

interface SiteLogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  animate?: boolean;
  asLink?: boolean;
}

export function SiteLogo({
  size = "md",
  className = "",
  animate = false,
  asLink = false,
}: SiteLogoProps) {
  const landingHref = "/lawyering";
  const sizeClasses = {
    sm: "text-xl",
    md: "text-2xl",
    lg: "text-4xl",
    xl: "text-6xl",
  };

  const logo = (
    <h1
      className={`flex items-center gap-1.5 ${sizeClasses[size]} font-light font-serif ${
        animate ? "sidebar-fade-in" : ""
      } ${className}`}
    >
      <span>Gavel</span>
    </h1>
  );

  if (asLink) {
    return (
      <Link
        href={landingHref}
        className="cursor-pointer hover:opacity-80 transition-opacity"
      >
        {logo}
      </Link>
    );
  }

  return logo;
}
