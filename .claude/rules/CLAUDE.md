---
description: How to write and format rules in this directory.
alwaysApply: true
---

# How to write rules

Each rule file covers one topic (e.g. icons, animations, TypeScript). Follow this format exactly:

## Frontmatter

```
---
description: One sentence summary of what the rule enforces.
globs: '*.tsx, *.ts'   # omit if the rule applies to all file types
alwaysApply: false      # true only for rules that must always be in context
---
```

## Body

- Write rules as a flat bullet list. No headings, no nested sections.
- Each bullet is one actionable rule: what to do, what not to do, and why (briefly).
- Start with the most important rule first.
- Prefer "do X" / "never do Y" phrasing over "you should" or "it is recommended".
- Keep bullets short — one idea per bullet.
- Use inline code for identifiers, class names, and file paths.
