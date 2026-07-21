"""arXiv id resolution for parsed references (plan phase 2).

Two tiers:

1. Read an explicit id out of the reference string. Nearly free, and very common in AI
   papers, which cite preprints constantly.
2. Fall back to an arXiv API title search, accepting only on high title similarity.

Tier 2 is deliberately strict. Opening the wrong paper side by side is a worse failure
than showing no open button at all, so an uncertain match resolves to nothing.

Politeness (spec section 6 stage 1): identify the client, ask for few results, keep one
request in flight at a time, and cache every lookup. Getting blocked mid-build is an
unrecoverable cost on a deadline.
"""

from __future__ import annotations

import re
import time
import urllib.parse
from difflib import SequenceMatcher
from xml.etree.ElementTree import ParseError

import httpx
# The feed is a remote document, so it is parsed with the hardened bindings rather than
# the stdlib ones (entity-expansion and external-entity attacks).
from defusedxml import ElementTree as ET

# HTTPS, so the response cannot be tampered with in transit before it is parsed.
API_ENDPOINT = "https://export.arxiv.org/api/query"
USER_AGENT = "Marginalia/0.1 (figure-first paper reader; local research use)"
# arXiv asks for no more than one request every three seconds.
MIN_REQUEST_INTERVAL = 3.0
REQUEST_TIMEOUT = 10.0
# Below this ratio the two titles are not the same paper.
_TITLE_MATCH_THRESHOLD = 0.9

# Modern (1706.03762, optionally versioned) and legacy (cs/0501001) identifiers.
_ARXIV_ID_RE = re.compile(
    r"(?:arxiv[:\s/]*|arxiv\.org/(?:abs|pdf)/)"
    r"(?P<id>\d{4}\.\d{4,5}(?:v\d+)?|[a-z-]+(?:\.[A-Z]{2})?/\d{7}(?:v\d+)?)",
    re.IGNORECASE,
)
_ATOM_NS = {"atom": "http://www.w3.org/2005/Atom"}
_ABS_URL_RE = re.compile(r"arxiv\.org/abs/(?P<id>.+)$")


def find_arxiv_id(text: str) -> str | None:
    """Tier 1: pull an explicit arXiv identifier out of a reference string."""
    match = _ARXIV_ID_RE.search(text or "")
    return match.group("id") if match else None


_BARE_ID_RE = re.compile(
    r"^(?:\d{4}\.\d{4,5}(?:v\d+)?|[a-z-]+(?:\.[A-Z]{2})?/\d{7}(?:v\d+)?)$",
    re.IGNORECASE,
)


def normalize_arxiv_id(raw: str) -> str | None:
    """Accept an id, an abs/pdf URL, or an "arXiv:" prefix; reject anything else."""
    candidate = (raw or "").strip()
    if not candidate:
        return None
    if _BARE_ID_RE.match(candidate):
        return candidate
    return find_arxiv_id(candidate)


def pdf_url(arxiv_id: str) -> str:
    return f"https://arxiv.org/pdf/{arxiv_id}"


def fetch_pdf(arxiv_id: str, *, client: httpx.Client | None = None) -> bytes:
    """Download a paper's PDF, identifying the client as spec section 6 stage 1 asks."""
    owned = client is None
    client = client or httpx.Client(
        timeout=REQUEST_TIMEOUT,
        headers={"User-Agent": USER_AGENT},
        follow_redirects=True,
    )
    try:
        response = client.get(pdf_url(arxiv_id))
        response.raise_for_status()
        return response.content
    finally:
        if owned:
            client.close()


def normalize_title(title: str) -> str:
    """Fold case and punctuation so two renderings of one title compare equal."""
    return re.sub(r"[^a-z0-9 ]+", " ", (title or "").lower()).strip()


def search_url(title: str, *, limit: int = 5) -> str:
    query = urllib.parse.urlencode(
        {
            "search_query": f'ti:"{title}"',
            "max_results": limit,
            "start": 0,
        }
    )
    return f"{API_ENDPOINT}?{query}"


def parse_search_response(body: str) -> list[tuple[str, str]]:
    """Atom feed -> [(arxiv_id, title)]."""
    root = ET.fromstring(body)
    results: list[tuple[str, str]] = []
    for entry in root.findall("atom:entry", _ATOM_NS):
        raw_id = (entry.findtext("atom:id", default="", namespaces=_ATOM_NS) or "").strip()
        title = (entry.findtext("atom:title", default="", namespaces=_ATOM_NS) or "").strip()
        match = _ABS_URL_RE.search(raw_id)
        if match and title:
            results.append((match.group("id"), re.sub(r"\s+", " ", title)))
    return results


def pick_best_match(title: str, results: list[tuple[str, str]]) -> str | None:
    """Tier 2 acceptance: the best candidate, but only if it is nearly identical."""
    wanted = normalize_title(title)
    if not wanted:
        return None

    best_id, best_score = None, 0.0
    for arxiv_id, candidate in results:
        score = SequenceMatcher(None, wanted, normalize_title(candidate)).ratio()
        if score > best_score:
            best_id, best_score = arxiv_id, score
    return best_id if best_score >= _TITLE_MATCH_THRESHOLD else None


class ArxivClient:
    """Rate-limited, cached arXiv API client.

    The cache is per-process and keyed by title. Combined with the manifest cache in
    data/<digest>/, a given paper's references are looked up once, ever.
    """

    def __init__(self, *, client: httpx.Client | None = None) -> None:
        self._client = client
        self._cache: dict[str, str | None] = {}
        self._last_request = 0.0

    def _wait_for_slot(self) -> None:
        elapsed = time.monotonic() - self._last_request
        if elapsed < MIN_REQUEST_INTERVAL:
            time.sleep(MIN_REQUEST_INTERVAL - elapsed)
        self._last_request = time.monotonic()

    def resolve_title(self, title: str) -> str | None:
        key = normalize_title(title)
        if not key:
            return None
        if key in self._cache:
            return self._cache[key]

        self._wait_for_slot()
        try:
            client = self._client or httpx.Client(
                timeout=REQUEST_TIMEOUT, headers={"User-Agent": USER_AGENT}
            )
            response = client.get(search_url(title))
            response.raise_for_status()
            resolved = pick_best_match(title, parse_search_response(response.text))
        except (httpx.HTTPError, ParseError):
            # A lookup failure means no open button, never a wrong one.
            resolved = None

        self._cache[key] = resolved
        return resolved
