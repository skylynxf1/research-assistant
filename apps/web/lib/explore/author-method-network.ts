import {
  citationEvidence,
  paperIdOf,
  passageEvidence,
  sectionIdFor,
} from "../evidence/source";
import {
  addEdge,
  addNode,
  emptyGraph,
  type ResearchGraph,
  type ResearchGraphNode,
} from "./graph";
import type { PaperAnalysis } from "./analysis";

const METHOD_HEADING_RE = /\b(?:methods?|methodology|approach|architecture|model)\b/i;

function authorNodeId(name: string): string {
  return `author:${name.normalize("NFKC").trim().toLowerCase()}`;
}

export function buildAuthorMethodNetwork(
  analyses: readonly PaperAnalysis[],
): ResearchGraph {
  let graph = emptyGraph();

  for (const analysis of analyses) {
    const paperId = paperIdOf(analysis.manifest);
    const paperNodeId = `paper:${paperId}`;
    graph = addNode(graph, {
      id: paperNodeId,
      type: "paper",
      label: analysis.manifest.title || "Untitled paper",
      metadata: { paperId, loaded: true, arxivId: analysis.manifest.source.arxiv_id },
    });

    const observedPages = new Map<string, number>();
    analysis.citationsByPage.forEach((citations, page) => {
      citations.forEach((citation) => citation.refIds.forEach((refId) => {
        if (!observedPages.has(refId)) observedPages.set(refId, page);
      }));
    });

    for (const reference of analysis.manifest.references) {
      const page = observedPages.get(reference.ref_id);
      if (page === undefined) continue;
      const evidence = citationEvidence(paperId, reference, page);
      const authors = [...new Set(reference.authors.map((name) => name.trim()).filter(Boolean))];
      for (const author of authors) {
        const node: ResearchGraphNode = {
          id: authorNodeId(author),
          type: "author",
          label: author,
          source: evidence,
          metadata: { exactSourceString: author },
        };
        graph = addNode(graph, node);
      }
      for (let left = 0; left < authors.length; left += 1) {
        for (let right = left + 1; right < authors.length; right += 1) {
          graph = addEdge(graph, {
            source: authorNodeId(authors[left]),
            target: authorNodeId(authors[right]),
            type: "coauthored",
            evidence,
          });
        }
      }
    }

    analysis.manifest.sections.forEach((section, index) => {
      if (!METHOD_HEADING_RE.test(section.title)) return;
      const sectionId = sectionIdFor(index);
      const evidence = passageEvidence(paperId, section.page, section.title, { sectionId });
      const methodNodeId = `method:${paperId}:${sectionId}`;
      graph = addNode(graph, {
        id: methodNodeId,
        type: "method",
        label: section.title,
        source: evidence,
        metadata: { paperId, sectionId, paperTitle: analysis.manifest.title },
      });
      graph = addEdge(graph, {
        source: paperNodeId,
        target: methodNodeId,
        type: "describes-method",
        evidence,
      });
    });
  }

  return graph;
}
