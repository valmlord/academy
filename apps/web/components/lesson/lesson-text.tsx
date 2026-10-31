import { CircleXIcon } from "lucide-react";
import type { ReactElement } from "react";
import { FocusOnMount } from "@/components/focus-on-mount";
import { sectionsOf } from "@/components/markdown/headings";
import { LessonMarkdown } from "@/components/markdown/lesson-markdown";
import { RetryButton } from "@/components/retry-button";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { lessonTextErrorTitle } from "@/lib/copy";
import { LessonTextReadError } from "@/lib/course/errors";
import { getLessonText } from "@/lib/course/server";
import type { SourceView } from "@/lib/course/view";
import { LESSON_PANEL_IDS, type LessonTab } from "./lesson-panels";
import { Sources } from "./sources";
import { TableOfContents } from "./toc";

export interface LessonTextProps {
  /** The lesson directory relative to the course root; server-side only, never a client prop. */
  lessonDir: string;
  kind: LessonTab;
  sources: SourceView[];
}

// One tab panel's content (design 6.2). Only a LessonTextReadError becomes `#state-text-error`, so a
// session or programming error is never shown as a text that failed to load (Arch A4). The theory tab
// carries the table of contents and the sources, which stay in the error state; the task tab neither.
export async function LessonText({
  lessonDir,
  kind,
  sources,
}: LessonTextProps): Promise<ReactElement> {
  const panelId = LESSON_PANEL_IDS[kind];
  const footer = kind === "theory" ? <Sources sources={sources} /> : null;
  let markdown: string;
  try {
    markdown = await getLessonText(lessonDir, kind);
  } catch (error) {
    if (!(error instanceof LessonTextReadError)) throw error;
    const retryId = `${kind}-text-retry`;
    return (
      <>
        <Alert variant="destructive" role={undefined}>
          <CircleXIcon aria-hidden />
          <AlertTitle>{lessonTextErrorTitle}</AlertTitle>
          <div className="col-start-2 mt-2">
            <RetryButton id={retryId} successTargetId={panelId} errorTargetId={retryId} />
          </div>
        </Alert>
        {footer}
      </>
    );
  }
  return (
    <>
      <FocusOnMount id={panelId} />
      {kind === "theory" ? <TableOfContents sections={sectionsOf(markdown)} /> : null}
      <LessonMarkdown markdown={markdown} kind={kind} />
      {footer}
    </>
  );
}
