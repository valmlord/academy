import type { Heading, Root } from "mdast";
import { toString as textOf } from "mdast-util-to-string";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import type { LessonTextKind } from "@/lib/course/text";

// One remark plugin decides the heading levels for the rendered lesson and for its table of contents, so
// the two cannot drift. The page's h1 is the lesson title and the tab panels sit under it, so lesson headings
// start at h2:
//   theory: a leading "# <title>" repeats the page h1 and is dropped; any other depth 1 or 2 is h2, 3 is
//           h3, 4-6 are h4; every h2 gets id "sec-<n>" and tabIndex -1 as a focus target of the contents;
//   task:   1 is h2, 2 is h3, 3-6 are h4 (#30 design notes, D3).

export interface Section {
  id: string;
  text: string;
}

const THEORY_DEPTH: Record<Heading["depth"], Heading["depth"]> = {
  1: 2,
  2: 2,
  3: 3,
  4: 4,
  5: 4,
  6: 4,
};
const TASK_DEPTH: Record<Heading["depth"], Heading["depth"]> = {
  1: 2,
  2: 3,
  3: 4,
  4: 4,
  5: 4,
  6: 4,
};

export function remarkLessonHeadings({
  kind,
}: {
  kind: LessonTextKind;
}): (tree: Root) => undefined {
  return (tree: Root): undefined => {
    const [first] = tree.children;
    if (kind === "theory" && first?.type === "heading" && first.depth === 1) {
      tree.children.shift();
    }
    const depths = kind === "theory" ? THEORY_DEPTH : TASK_DEPTH;
    let sectionCount = 0;
    visit(tree, "heading", (node: Heading) => {
      node.depth = depths[node.depth];
      if (kind === "theory" && node.depth === 2) {
        sectionCount += 1;
        node.data = { ...node.data, hProperties: { id: `sec-${sectionCount}`, tabIndex: -1 } };
      }
    });
  };
}

/** The theory's h2 sections, in order, as the rendered page numbers them. */
export function sectionsOf(markdown: string): Section[] {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkLessonHeadings, { kind: "theory" });
  const tree = processor.runSync(processor.parse(markdown));
  const sections: Section[] = [];
  visit(tree, "heading", (node: Heading) => {
    if (node.depth === 2) sections.push({ id: `sec-${sections.length + 1}`, text: textOf(node) });
  });
  return sections;
}
