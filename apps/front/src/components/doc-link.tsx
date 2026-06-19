import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface DocLinkProps {
  href: string;
  children: React.ReactNode;
  className?: string;
}

export function DocLink({ href, children, className }: DocLinkProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "inline-flex items-center gap-0.5 text-foreground underline decoration-muted-foreground/40 decoration-dotted underline-offset-4 transition-colors hover:decoration-foreground",
        className,
      )}
    >
      {children}
      <ArrowUpRight className="size-3" />
    </a>
  );
}
