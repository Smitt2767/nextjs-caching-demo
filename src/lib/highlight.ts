import { cacheLife } from "next/cache";
import { codeToHtml } from "shiki";

/**
 * Syntax-highlight a snippet on the server.
 *
 * Cached: the input is a fixed string per snippet, so the highlighted markup
 * is computed once and prerendered into the shell rather than re-running
 * Shiki on every request.
 *
 * Dual themes emit both palettes as CSS variables on the same markup, so the
 * page can switch on `prefers-color-scheme` without shipping Shiki to the
 * browser. See the `.shiki` rule in globals.css.
 */
export async function highlight(code: string): Promise<string> {
  "use cache";
  // Snippets are constants in the repo: they only change on deploy, and the
  // build id is part of the cache key. Without this the default 15m profile
  // would drag the whole route's revalidate window down with it.
  cacheLife("max");

  return codeToHtml(code, {
    lang: "tsx",
    themes: { light: "github-light", dark: "github-dark" },
    defaultColor: false,
  });
}
