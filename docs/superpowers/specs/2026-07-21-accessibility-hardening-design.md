# Accessibility Hardening Design

## Typography

Reflow gets a visible “Reading settings” region with independent controls for font size,
line height, paragraph spacing, measure, high contrast, reduced motion, and an optional
dyslexia-friendly system-font stack. Settings affect only the semantic article and never
alter PDF/crop rendering or source geometry.

## Keyboard and screen readers

Every existing control remains native. Reflow paragraphs receive programmatic focus and
Previous/Next controls plus `J`/`K` shortcuts outside form fields. Source objects expose
labels, captions, page numbers, and meaningful action names. Status changes use polite live
regions. Pinboard cards gain four named move buttons so drag is never the sole positioning
mechanism.

## Read aloud

Browser Speech Synthesis is optional and feature-detected. It reads the currently focused
reflow paragraph, then advances through the already approved `ReflowDocument` paragraph
order. It never reads canvas/PDF pixels and never invents or rewrites text. Stop cancels the
browser queue. Unsupported browsers simply omit the control.

## Verification

Pure tests cover clamped typography settings, paragraph-only speech input, and keyboard
index movement. Production/build tests are followed by browser checks for keyboard focus,
settings, live status, and read-aloud feature detection. No server/schema, LLM, `Reader.tsx`,
or Developer A changes.
