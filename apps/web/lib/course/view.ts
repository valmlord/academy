import type { Lesson } from "@academy/lesson-schema/schema";
import { countedCheckCount } from "../progress/rules";
import { type CheckKind, SHIPPED_CHECK_KINDS } from "../progress/shipped-kinds";
import type { CourseTree, LessonNode, ModuleNode } from "./read";

// View models are built field by field from the parsed tree (ADR-0009 item 3): they never carry checks,
// workspace, file names or directory paths, because everything a page renders can reach the browser.
// Progress is not read in #30: every lesson is "not started" and every prerequisite counts as not passed
// (Stepan, 2026-10-30; #35 replaces this).
// The dashboard counts only visible lessons with at least one counted check, and only such a lesson can be
// next (ADR-0007 rule 8 as amended by #101, D6): a lesson with nothing to check can never be finished, so
// it would hold the course bar below 100% for ever. The catalog still lists those lessons.

export type LessonType = Lesson["type"];

export interface CourseIdentity {
  id: string;
  title: string;
}

export interface LessonLink {
  id: string;
  title: string;
}

export interface CatalogLessonView {
  id: string;
  number: string;
  title: string;
  type: LessonType;
  estimatedMinutes: number;
  /** Visible prerequisites in `lesson.yaml` order; none is passed before #35. */
  prerequisites: LessonLink[];
}

export interface CatalogModuleView {
  id: string;
  number: string;
  title: string;
  summary: string;
  outcomes: string[];
  /** Available iff the module has a visible lesson; otherwise it is shown as being prepared. */
  isAvailable: boolean;
  lessons: CatalogLessonView[];
}

export interface CatalogView {
  id: string;
  title: string;
  description: string;
  modules: CatalogModuleView[];
}

export interface NextLessonView {
  id: string;
  title: string;
  type: LessonType;
  estimatedMinutes: number;
  moduleTitle: string;
}

export interface DashboardModuleView {
  id: string;
  title: string;
  isAvailable: boolean;
  lessonCount: number;
}

export interface DashboardView {
  courseId: string;
  next: NextLessonView | null;
  totalLessons: number;
  modules: DashboardModuleView[];
}

export interface SourceView {
  title: string;
  url: string;
  checkedAt: string;
}

export interface LessonView {
  courseId: string;
  courseTitle: string;
  id: string;
  title: string;
  type: LessonType;
  estimatedMinutes: number;
  outcomes: string[];
  module: { id: string; title: string };
  prerequisites: LessonLink[];
  sources: SourceView[];
}

export interface FoundLesson {
  module: ModuleNode;
  node: LessonNode;
}

/** ADR-0009 item 5: a lesson is visible iff it and its module are `ready`. */
export function isLessonVisible(module: ModuleNode, node: LessonNode): boolean {
  return module.module.status === "ready" && node.lesson.status === "ready";
}

function visibleLessons(module: ModuleNode): LessonNode[] {
  return module.lessons.filter((node) => isLessonVisible(module, node));
}

function visibleLessonTitles(tree: CourseTree): Map<string, string> {
  const titles = new Map<string, string>();
  for (const module of tree.modules) {
    for (const node of visibleLessons(module)) titles.set(node.lesson.id, node.lesson.title);
  }
  return titles;
}

/** A prerequisite id that names no visible lesson is not shown (catalog AC5). */
function prerequisiteLinks(lesson: Lesson, titles: Map<string, string>): LessonLink[] {
  const links: LessonLink[] = [];
  for (const id of lesson.prerequisites) {
    const title = titles.get(id);
    if (title !== undefined) links.push({ id, title });
  }
  return links;
}

export function courseIdentity(tree: CourseTree): CourseIdentity {
  return { id: tree.id, title: tree.title };
}

export function toCatalogView(tree: CourseTree): CatalogView {
  const titles = visibleLessonTitles(tree);
  return {
    id: tree.id,
    title: tree.title,
    description: tree.description,
    modules: tree.modules.map((module) => {
      const lessons = visibleLessons(module).map(
        (node): CatalogLessonView => ({
          id: node.lesson.id,
          number: node.number,
          title: node.lesson.title,
          type: node.lesson.type,
          estimatedMinutes: node.lesson.estimatedMinutes,
          prerequisites: prerequisiteLinks(node.lesson, titles),
        }),
      );
      return {
        id: module.module.id,
        number: module.number,
        title: module.module.title,
        summary: module.module.summary,
        outcomes: [...module.module.outcomes],
        isAvailable: lessons.length > 0,
        lessons,
      };
    }),
  };
}

/**
 * The next lesson is the first counted lesson in course order: without progress nothing is finished.
 * `next` and `totalLessons` come from the same counted lessons, so `next !== null` iff `totalLessons >= 1`;
 * the page relies on that to never render a progress bar over 0 lessons (D12).
 */
export function toDashboardView(
  tree: CourseTree,
  shippedKinds: ReadonlySet<CheckKind> = SHIPPED_CHECK_KINDS,
): DashboardView {
  let next: NextLessonView | null = null;
  let totalLessons = 0;
  const modules = tree.modules.map((module): DashboardModuleView => {
    const lessons = visibleLessons(module).filter(
      (node) => countedCheckCount(node.lesson, shippedKinds) >= 1,
    );
    const [first] = lessons;
    if (next === null && first !== undefined) {
      next = {
        id: first.lesson.id,
        title: first.lesson.title,
        type: first.lesson.type,
        estimatedMinutes: first.lesson.estimatedMinutes,
        moduleTitle: module.module.title,
      };
    }
    totalLessons += lessons.length;
    return {
      id: module.module.id,
      title: module.module.title,
      // A module with 0 counted lessons has no status and no percentage (ADR-0007 "Dashboard"), so it is
      // shown like one being prepared rather than as "0 of 0".
      isAvailable: lessons.length > 0,
      lessonCount: lessons.length,
    };
  });
  return { courseId: tree.id, next, totalLessons, modules };
}

/** A visible lesson by id; an invisible one does not exist for the learner (ADR-0009 item 5). */
export function findLesson(tree: CourseTree, lessonId: string): FoundLesson | undefined {
  for (const module of tree.modules) {
    const node = visibleLessons(module).find((candidate) => candidate.lesson.id === lessonId);
    if (node !== undefined) return { module, node };
  }
  return undefined;
}

const LINKABLE_PROTOCOLS = new Set(["http:", "https:"]);

function isLinkableUrl(url: string): boolean {
  try {
    return LINKABLE_PROTOCOLS.has(new URL(url).protocol);
  } catch {
    // An unparsable URL cannot be a link; the source is left out like a javascript: one.
    return false;
  }
}

export function toLessonView(tree: CourseTree, { module, node }: FoundLesson): LessonView {
  const { lesson } = node;
  return {
    courseId: tree.id,
    courseTitle: tree.title,
    id: lesson.id,
    title: lesson.title,
    type: lesson.type,
    estimatedMinutes: lesson.estimatedMinutes,
    outcomes: [...lesson.outcomes],
    module: { id: module.module.id, title: module.module.title },
    prerequisites: prerequisiteLinks(lesson, visibleLessonTitles(tree)),
    sources: lesson.sources
      .filter((source) => isLinkableUrl(source.url))
      .map((source) => ({ title: source.title, url: source.url, checkedAt: source.checkedAt })),
  };
}
