"""Marginalia extraction pipeline.

Turns a PDF into the static JSON manifest described in packages/schema/manifest.schema.json.
Deliberately owns only what Python is better at: figure regions, crops, captions, sections,
references, arXiv resolution. Mention detection lives in the client.
"""

EXTRACTION_VERSION = "1.0.0"
