# Accessibility Hardening Implementation Plan

**Goal:** Complete typography, keyboard, screen-reader, and optional read-aloud support over
the semantic reflow model, with non-drag pinboard movement.

## Task 1: Accessibility model

Create `lib/accessibility/settings.ts` and tests for clamped independent typography values,
paragraph navigation, and paragraph-only speech input.

## Task 2: Reflow controls and read aloud

Refactor `ReflowReader.tsx` to add a labelled settings panel, native controls, focusable
paragraph navigation, J/K shortcuts, feature-detected Speech Synthesis, visible/live status,
asset captions, and reduced-motion behavior.

## Task 3: Keyboard-complete pinboard and final audit

Add named directional controls to pinboard cards, run keyboard/semantic source scans, all
web/Python/build gates, and live browser verification across reflow/workspace/explore. Update
handoff, push, merge, clean, and run the final main-branch verification matrix.
