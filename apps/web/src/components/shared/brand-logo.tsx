import Image from "next/image";
import { cn } from "@/lib/utils";

const LOGOS = {
  // The full college lockup (shield + "LORCAN MEDICAL COLLEGE" banner).
  full: { src: "/lorcan-logo.webp", width: 474, height: 474 },
  // The shield alone, used where vertical space is tight (sidebar, headers).
  mark: { src: "/lorcan-mark.webp", width: 512, height: 512 },
} as const;

interface BrandLogoProps {
  variant?: keyof typeof LOGOS;
  size?: number;
  className?: string;
  priority?: boolean;
  /** Pass an empty string when adjacent text already names the college. */
  alt?: string;
}

/**
 * Single source of truth for the Lorcan logo. The source artwork has a white
 * background, so it always sits on a white tile to stay legible in both themes.
 */
export function BrandLogo({
  variant = "mark",
  size = 40,
  className,
  priority = false,
  alt = "Lorcan Medical College",
}: BrandLogoProps) {
  const logo = LOGOS[variant];

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <Image
        src={logo.src}
        alt={alt}
        width={logo.width}
        height={logo.height}
        priority={priority}
        sizes={`${size}px`}
        className="h-full w-full object-contain"
      />
    </span>
  );
}
