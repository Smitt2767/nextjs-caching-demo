import Link from "next/link";
import type { ComponentPropsWithoutRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { readExplainer } from "@/lib/explainer";

/**
 * The flag explainer, served as a page.
 *
 * The document is the source; this route is a view of it. Nothing here restates
 * the content, so the two can never disagree — editing the markdown is the only
 * way to change what this page says.
 *
 * Fully static (`○`). The markdown is read inside a `use cache` scope, so it
 * resolves at build and there is no request-time work at all: no cookies, no
 * headers, no flag evaluation. Which is a small joke at its own expense — a
 * page explaining feature flags is the one page here with none.
 */

export const metadata = {
  title: "How flags work",
  description:
    "The four kinds of feature flag in this project, in plain English.",
};

/**
 * Markdown elements mapped onto the project's design language.
 *
 * Hand-mapped rather than reached for through a typography plugin, because the
 * direction is Swiss/minimal — square corners, no decoration that does not
 * carry meaning — and a general-purpose prose theme fights that on every rule.
 */
const components = {
  h1: (props: ComponentPropsWithoutRef<"h1">) => (
    <h1
      className="mt-0 text-2xl font-semibold tracking-tight text-ink sm:text-3xl"
      {...props}
    />
  ),

  h2: (props: ComponentPropsWithoutRef<"h2">) => (
    <h2
      className="mt-10 border-b border-line pb-2 text-xl font-semibold tracking-tight text-ink"
      {...props}
    />
  ),

  h3: (props: ComponentPropsWithoutRef<"h3">) => (
    <h3 className="mt-7 text-[15px] font-semibold text-ink" {...props} />
  ),

  p: (props: ComponentPropsWithoutRef<"p">) => (
    <p className="mt-3 text-[15px] leading-relaxed text-ink-muted" {...props} />
  ),

  ul: (props: ComponentPropsWithoutRef<"ul">) => (
    <ul
      className="mt-3 list-disc space-y-1.5 pl-5 text-[15px] leading-relaxed text-ink-muted marker:text-ink-subtle"
      {...props}
    />
  ),

  ol: (props: ComponentPropsWithoutRef<"ol">) => (
    <ol
      className="mt-3 list-decimal space-y-1.5 pl-5 text-[15px] leading-relaxed text-ink-muted marker:text-ink-subtle"
      {...props}
    />
  ),

  li: (props: ComponentPropsWithoutRef<"li">) => (
    <li className="pl-1" {...props} />
  ),

  strong: (props: ComponentPropsWithoutRef<"strong">) => (
    <strong className="font-semibold text-ink" {...props} />
  ),

  blockquote: (props: ComponentPropsWithoutRef<"blockquote">) => (
    <blockquote
      className="mt-4 border-l-[3px] border-amber-500 bg-surface-raised py-2 pl-4 pr-3 text-[15px] leading-relaxed text-ink-muted [&>p]:mt-0"
      {...props}
    />
  ),

  hr: () => <hr className="mt-10 border-0 border-t border-line" />,

  a: ({ href, ...props }: ComponentPropsWithoutRef<"a">) => (
    <a
      href={href}
      className="text-ink underline decoration-line underline-offset-4 hover:decoration-ink"
      {...props}
    />
  ),

  /**
   * Tables get their own scroll container.
   *
   * Several here are wide — the four-way comparison is five columns of prose —
   * and the page body must never scroll horizontally on a phone.
   */
  table: (props: ComponentPropsWithoutRef<"table">) => (
    <div className="mt-4 overflow-x-auto border border-line">
      <table className="w-full border-collapse text-left text-[14px]" {...props} />
    </div>
  ),

  th: (props: ComponentPropsWithoutRef<"th">) => (
    <th
      className="border-b border-line bg-surface-raised px-3 py-2 align-top font-mono text-[12px] font-medium uppercase tracking-wider text-ink-subtle"
      {...props}
    />
  ),

  td: (props: ComponentPropsWithoutRef<"td">) => (
    <td
      className="border-b border-line px-3 py-2 align-top leading-relaxed text-ink-muted [&:last-child]:border-b-0"
      {...props}
    />
  ),

  /**
   * `code` covers both inline spans and the inside of a fenced block; only the
   * fenced case carries a `language-*` class or a newline. Inline gets a chip,
   * block gets nothing so the surrounding `pre` can own the well.
   */
  code: ({ className, children, ...props }: ComponentPropsWithoutRef<"code">) => {
    const isBlock =
      typeof className === "string" && className.includes("language-");

    if (isBlock) {
      return (
        <code className="font-mono text-[13px] leading-relaxed text-ink" {...props}>
          {children}
        </code>
      );
    }

    return (
      <code
        className="bg-ink/[.06] px-1 py-0.5 font-mono text-[13px] text-ink dark:bg-white/[.08]"
        {...props}
      >
        {children}
      </code>
    );
  },

  /**
   * Not highlighted, deliberately. Half the blocks here are ASCII diagrams and
   * sample output rather than any language, and a highlighter would either
   * mangle them or need a per-block escape hatch. Monospace and preserved
   * whitespace is the whole requirement.
   */
  pre: (props: ComponentPropsWithoutRef<"pre">) => (
    <pre
      className="mt-4 overflow-x-auto border border-line bg-surface-raised p-4 text-[13px] leading-relaxed"
      {...props}
    />
  ),
};

export default async function FlagsExplainedPage() {
  const markdown = await readExplainer();

  return (
    <main className="w-full flex-1 px-4 py-5">
      <header className="border-b border-line pb-4">
        <p className="font-mono text-[11px] font-medium uppercase tracking-wider text-ink-subtle">
          the explainer
        </p>
        <p className="mt-2 font-mono text-[13px] text-ink-subtle">
          rendered from{" "}
          <code className="text-ink">src/content/flags-explained.md</code> · see
          it working on{" "}
          <Link
            href="/flags"
            className="text-ink underline decoration-line underline-offset-4 hover:decoration-ink"
          >
            /flags
          </Link>{" "}
          and{" "}
          <Link
            href="/precomputed"
            className="text-ink underline decoration-line underline-offset-4 hover:decoration-ink"
          >
            /precomputed
          </Link>
        </p>
      </header>

      {/* A measure, unlike the rest of the site. Every other page is a grid of
          panels that wants the full width; this one is continuous prose, and a
          1800px line of text is unreadable however much room there is. */}
      <article className="mt-6 max-w-3xl pb-16">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
          {markdown}
        </ReactMarkdown>
      </article>
    </main>
  );
}
