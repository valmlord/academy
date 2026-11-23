/**
 * Reads the quiz threshold statements of a lesson's task.md: the sentences that tell the learner how
 * many correct answers a quiz check needs. Pure text in, statements out; content:validate compares
 * them with the quiz file and `passScore` (ADR-0001 item 6). This module and the fixture table of
 * test/task-threshold.test.ts are the normative definition of what counts and how it is read.
 */

export type QuizThresholdStatement =
  | {
      kind: "anchored";
      line: number;
      checkId: string;
      statedQuestions: number;
      statedCorrect: number;
    }
  | { kind: "restated"; line: number; statedQuestions: number; statedCorrect: number }
  | { kind: "unreadable"; line: number; checkId: string | undefined };

// The check id slug of the lesson schema.
const SLUG = "[a-z0-9]+(?:-[a-z0-9]+)*";

const FENCE = /^\s*(```|~~~)/;
// A line that starts a heading, list item, ordered item, blockquote or table row is never a
// continuation of the line above it, so a sentence cannot run across a block boundary.
const BLOCK_START = /^\s*(#{1,6}\s|[-*+]\s|\d+[.)]\s|>|\|)/;
// Stripped before splitting, so the "11." of an ordered item does not end a sentence.
const BLOCK_MARKER = /^\s*(?:>\s*)*(?:#{1,6}\s+|[-*+]\s+|\d+[.)]\s+)?/;
const SENTENCE_END = /[.!?]\s+/g;
const LINE_END_TERMINATOR = /[.!?]$/;

// The start of a check's own sentence: its id in backticks, bold or not, then the quiz label in
// parentheses and a colon.
const ANCHOR_START = new RegExp(`^(?:\\*\\*)?\`(?<id>${SLUG})\`(?:\\*\\*)? \\(квиз\\):`, "u");
// The quiz stem in any letter case and inside longer words too: matching more makes more sentences
// candidates, and a candidate in neither form is reported, never skipped.
const QUIZ_STEM = /квиз/iu;

// A count marker may start only at the first digit of a digit run. Without it, a failed match is
// retried from every later digit of the run, which is quadratic in the run's length.
const DIGIT_RUN_START = "(?<!\\d)";
// The one optional word between the two numbers of a count is defined by what it may not hold, never by an
// alphabet: a Latin, uppercase or bracketed word there still makes the sentence a candidate, so it
// is reported instead of being skipped silently.
const WORD = "[^\\s\\d.!?]+";
// An ending also leaves out the comma, because the own-sentence grammar continues with a comma: an
// ending that could take commas overlaps it and backtracks quadratically on a run of commas.
const ENDING = "[^\\s\\d.!?,]*";

// A count of correct answers: a percentage, "N of M" with at most one word between N and "of", or N
// followed by the stem of "correct".
const COUNT_MARKERS: readonly RegExp[] = [
  new RegExp(`${DIGIT_RUN_START}\\d+\\s*%`, "iu"),
  new RegExp(`${DIGIT_RUN_START}\\d+\\s+(?:${WORD}\\s+)?из\\s+\\d+`, "iu"),
  new RegExp(`${DIGIT_RUN_START}\\d+\\s+(?:верн|правильн)`, "iu"),
];

// No digit and no terminator between Q and the required count, so K cannot come from a second
// number or from the next sentence.
const MIDDLE = "[^.!?\\d]*?";
// The check's own sentence: the anchor, the question count, optional words, then the required
// count with an optional "at least". Words between Q and K are free text of the course, so only
// digits and terminators are kept out of them.
const ANCHORED = new RegExp(
  `^(?:\\*\\*)?\`(?<id>${SLUG})\`(?:\\*\\*)? \\(квиз\\): (?<questions>\\d+) вопрос${ENDING}(?:[ ,]${MIDDLE})?, нужно (?:не меньше )?(?<correct>\\d+) верн${ENDING}$`,
  "u",
);
// The checklist restatement of the threshold: at least K of Q, with an optional "correct" between.
const RESTATED = new RegExp(
  `^Квиз: не меньше (?<correct>\\d+) (?:верн${ENDING} )?из (?<questions>\\d+)$`,
  "u",
);

interface Piece {
  line: number;
  offset: number;
}

interface LogicalLine {
  text: string;
  // Non-empty by construction, so the first piece needs no check.
  pieces: [Piece, ...Piece[]];
}

interface Sentence {
  text: string;
  line: number;
}

/** Joins wrapped prose lines; code inside a fence is never joined, but it is still read. */
function logicalLines(taskText: string): LogicalLine[] {
  const lines: LogicalLine[] = [];
  let current: LogicalLine | undefined;
  let isInFence = false;
  const physicalLines = taskText.replace(/\r\n/g, "\n").split("\n");

  for (const [index, physical] of physicalLines.entries()) {
    const line = index + 1;
    const isFence = FENCE.test(physical);
    if (isFence || isInFence) {
      if (current !== undefined) lines.push(current);
      current = undefined;
      if (isFence) isInFence = !isInFence;
      if (physical.trim() !== "") lines.push({ text: physical, pieces: [{ line, offset: 0 }] });
      continue;
    }
    if (physical.trim() === "") {
      if (current !== undefined) lines.push(current);
      current = undefined;
      continue;
    }
    if (current === undefined || BLOCK_START.test(physical)) {
      if (current !== undefined) lines.push(current);
      current = { text: physical.trim(), pieces: [{ line, offset: 0 }] };
      continue;
    }
    current.pieces.push({ line, offset: current.text.length + 1 });
    current.text = `${current.text} ${physical.trim()}`;
  }
  if (current !== undefined) lines.push(current);
  return lines;
}

function sentencesOf(logical: LogicalLine): Sentence[] {
  const markerEnd = BLOCK_MARKER.exec(logical.text)?.[0].length ?? 0;
  const body = logical.text.slice(markerEnd);
  const sentences: Sentence[] = [];
  let pieceIndex = 0;
  let line = logical.pieces[0].line;
  // Sentences come in text order, so the piece cursor only moves forward; rescanning the pieces for
  // every sentence would be quadratic on a long wrapped paragraph.
  const lineAt = (offset: number): number => {
    let next = logical.pieces[pieceIndex + 1];
    while (next !== undefined && next.offset <= offset) {
      pieceIndex++;
      line = next.line;
      next = logical.pieces[pieceIndex + 1];
    }
    return line;
  };

  let start = 0;
  for (const end of body.matchAll(SENTENCE_END)) {
    sentences.push({ text: body.slice(start, end.index), line: lineAt(markerEnd + start) });
    start = end.index + end[0].length;
  }
  if (start < body.length) {
    const text = body.slice(start).replace(LINE_END_TERMINATOR, "");
    sentences.push({ text, line: lineAt(markerEnd + start) });
  }
  return sentences;
}

function isCandidate(sentence: string): boolean {
  if (ANCHOR_START.test(sentence)) return true;
  return QUIZ_STEM.test(sentence) && COUNT_MARKERS.some((marker) => marker.test(sentence));
}

function statementOf(text: string, line: number): QuizThresholdStatement {
  const anchored = ANCHORED.exec(text)?.groups;
  if (anchored?.id !== undefined) {
    return {
      kind: "anchored",
      line,
      checkId: anchored.id,
      statedQuestions: Number(anchored.questions),
      statedCorrect: Number(anchored.correct),
    };
  }
  const restated = RESTATED.exec(text)?.groups;
  if (restated !== undefined) {
    return {
      kind: "restated",
      line,
      statedQuestions: Number(restated.questions),
      statedCorrect: Number(restated.correct),
    };
  }
  // An unreadable sentence that starts with a check's anchor keeps the id, so that check is
  // still taken to have its sentence.
  return { kind: "unreadable", line, checkId: ANCHOR_START.exec(text)?.groups?.id };
}

/**
 * Every quiz threshold statement of a task.md, in text order. `line` is the 1-based physical line
 * on which the sentence begins. A candidate that fits neither grammar comes back with kind
 * "unreadable", so the caller reports it instead of skipping it.
 */
export function quizThresholdStatements(taskText: string): readonly QuizThresholdStatement[] {
  const statements: QuizThresholdStatement[] = [];
  for (const logical of logicalLines(taskText)) {
    for (const sentence of sentencesOf(logical)) {
      if (isCandidate(sentence.text)) statements.push(statementOf(sentence.text, sentence.line));
    }
  }
  return statements;
}
