/**
 * Escapes special regex characters in a string so it can be safely used
 * in a RegExp constructor.
 */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Splits text into segments, marking which parts match the query.
 * Returns an array of { text: string, highlight: boolean } objects.
 */
export function splitByQuery(text: string, query: string): Array<{ text: string; highlight: boolean }> {
  const trimmed = query.trim();
  if (!trimmed) return [{ text, highlight: false }];

  const escaped = escapeRegex(trimmed);
  const regex = new RegExp(`(${escaped})`, "gi");
  const parts: Array<{ text: string; highlight: boolean }> = [];

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    // Add non-matching text before this match
    if (match.index > lastIndex) {
      parts.push({ text: text.slice(lastIndex, match.index), highlight: false });
    }
    // Add the matching text
    parts.push({ text: match[1], highlight: true });
    lastIndex = regex.lastIndex;

    // Prevent infinite loop on zero-width matches
    if (match[0].length === 0) {
      regex.lastIndex++;
    }
  }

  // Add remaining text after last match
  if (lastIndex < text.length) {
    parts.push({ text: text.slice(lastIndex), highlight: false });
  }

  return parts.length > 0 ? parts : [{ text, highlight: false }];
}
