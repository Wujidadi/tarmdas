---
name: prose-linewrap
description: When writing or editing Markdown/plain-text prose (READMEs, docs, design notes, change descriptions, commit message bodies, etc.), break lines by meaning rather than at a fixed column width — a line ends only where a sentence or clause naturally closes, and overly long or numerous comma-separated enumerations are rewritten as lists. Covers both English and CJK punctuation. Not applicable to program logic; defer to the project when it has its own line-width convention.
---

# prose-linewrap — break prose by semantics

When writing or editing prose, where a line ends should be decided by meaning, not by some fixed column width. A single sentence is usually a single line (even a long one), breaking only where the sentence is semantically complete or where a clause naturally breaks off.

## When to apply

- Writing or rewriting Markdown/plain-text prose paragraphs: READMEs, docs, design notes, change descriptions, specs, Git commit message bodies, etc.
- When the user asks to "re-break by semantics," "don't hard-wrap to a width," or "reflow this passage."

Not applicable: program logic, config-file keys/values, or existing content that should not be reflowed.

## Core principle

Do not hard-wrap at a fixed column width. Break by semantics instead: a line ends where "the sentence's meaning is already complete" or "a clause naturally breaks off," not because it hit some column limit. **This rule has no fixed wrap column whatsoever** — the "very long" mentioned below is only a heuristic hint, not a break point.

## Where lines may break (half-width / full-width mapping)

The following positions allow a line break. Each group lists the English and the Chinese (CJK full-width) counterpart, so one set of logic applies to both languages at once:

- Sentence-final punctuation: `.` `?` `!`, corresponding to `。` `？` `！`.
- Semicolon: `;`, corresponding to `；` — break only when both sides are substantial clauses.
- Em dash: `—`, corresponding to `——` — when it introduces an independent clause.
- Colon: `:`, corresponding to `：` — when it introduces an explanation, an enumeration, or a list.

## Where lines may not break

- **No line break after a comma** (`,`, corresponding to `，`): keep the clause on the same line. The only exception is "a single sentence that is genuinely very long" — roughly, enough to span three or four lines when displayed; only in that case is breaking at a comma/clause boundary permitted.
- **No line break after a semicolon if the remaining fragment is too short**: keep that short tail on the same line, rather than letting it sit alone on its own line.
- **A paragraph's final sentence, if short, need not be broken out**: fold it into the previous line by meaning, rather than giving it its own line.

## Turn long enumerations into lists

When a comma (`,` / `，`) or an enumeration comma (`、`) leads a string of items, and each item is fairly long or there are many items, rewrite them into a proper Markdown list rather than splicing them inline with commas.

Exception: if the enumerated items are each just a word or two (or one or two full-width characters), leave them inline.

## Edges and exceptions (important)

- **Defer to the project's existing convention first**: if the project/file has its own line-width rule (e.g. `.editorconfig`, Prettier's `proseWrap`, a linter's line width), the project takes precedence.
- **Don't reflow unrelated existing text just to apply this rule**: apply it only to the paragraphs you were going to add or rewrite anyway; don't rearrange a whole block of unrelated content just to unify line breaks and needlessly enlarge the diff (this also echoes the "minimal-change principle").
- **Be conservative with code comments**: many languages/projects have their own column-width conventions and linters for comments, which may force wrapping. Unless the project has no such rule, don't force "one sentence per line, allowed to be long" onto existing code comments.
- This rule relies heavily on subjective judgment (substantial / too short / very long / fairly long), and the executor is a model rather than a deterministic tool, so this is a "tendency" rather than a guaranteed property; the goal is to make line breaks carry meaning, not to pursue character-by-character reproducibility.

## Examples

Hard-wrapped to width (poor):

```text
The `ignore` package implements full .gitignore semantics (anchoring,
negation, comments, any-depth matching), so .mdformatignore behaves
exactly like .gitignore.
```

Broken by semantics (whole sentence on one line):

```text
The `ignore` package implements full .gitignore semantics (anchoring, negation, comments, any-depth matching), so .mdformatignore behaves exactly like .gitignore.
```

Long enumeration turned into a list (poor — commas spliced inline):

```text
Responsible for: parsing arguments, loading ignore rules, recursively
collecting files, then running the pipeline per file.
```

Turned into a list:

```text
Responsible for:

- parsing arguments
- loading ignore rules
- recursively collecting files
- then running the pipeline per file
```
