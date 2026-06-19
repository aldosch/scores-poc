import type * as React from "react";
import { type BundledLanguage, codeToHtml } from "shiki";
import { CopyButton } from "@/components/copy-button";
import { cn } from "@/lib/utils";

interface CodeBlockProps {
  language?: string;
  filename?: string;
  children: string;
  className?: string;
}

// Languages used in this app; anything else falls back to plain text.
const SUPPORTED_LANGS = new Set<BundledLanguage>([
  "tsx",
  "ts",
  "jsx",
  "js",
  "json",
  "bash",
  "sh",
  "shell",
  "css",
  "html",
  "md",
  "mdx",
  "yaml",
  "diff",
]);

function resolveLang(input?: string): BundledLanguage | "text" {
  if (!input) return "text";
  const lower = input.toLowerCase();
  return SUPPORTED_LANGS.has(lower as BundledLanguage)
    ? (lower as BundledLanguage)
    : "text";
}

export async function CodeBlock({
  language,
  filename,
  children,
  className,
}: CodeBlockProps) {
  const code = children.replace(/\n$/, "");
  const html = await codeToHtml(code, {
    lang: resolveLang(language),
    themes: {
      light: "github-light",
      dark: "github-dark",
    },
    defaultColor: false,
  });

  const hasHeader = Boolean(filename);

  // Hidden by default; revealed on hover/keyboard-focus within the figure.
  // Always shown on touch devices where there is no hover.
  const copyRevealClasses =
    "opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100";

  return (
    <figure
      className={cn(
        "group relative overflow-hidden rounded-lg border bg-card text-card-foreground",
        className,
      )}
    >
      {hasHeader && (
        <figcaption className="flex items-center justify-between gap-2 border-b bg-muted/40 py-1 pr-1 pl-4 font-mono text-muted-foreground text-xs">
          <span className="truncate">{filename}</span>
          <CopyButton text={code} className={copyRevealClasses} />
        </figcaption>
      )}
      {!hasHeader && (
        <CopyButton
          text={code}
          className={cn("absolute top-1.5 right-1.5 z-10", copyRevealClasses)}
        />
      )}
      <div
        className={cn(
          "shiki-wrapper overflow-x-auto px-4 py-3 font-mono text-[13px] leading-relaxed",
          "[&_pre]:!bg-transparent [&_pre]:m-0 [&_pre]:p-0 [&_code]:!bg-transparent [&_span]:!bg-transparent",
        )}
        // biome-ignore lint/security/noDangerouslySetInnerHtml: Shiki output is sanitized HTML.
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </figure>
  );
}

export function InlineCode({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <code
      className={cn(
        "rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[0.85em]",
        className,
      )}
    >
      {children}
    </code>
  );
}
