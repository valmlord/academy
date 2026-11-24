import { describe, expect, it } from "vitest";
import { type QuizThresholdStatement, quizThresholdStatements } from "../src/task-threshold.js";

function anchored(
  checkId: string,
  statedQuestions: number,
  statedCorrect: number,
  line = 1,
): QuizThresholdStatement {
  return { kind: "anchored", line, checkId, statedQuestions, statedCorrect };
}

function restated(
  statedQuestions: number,
  statedCorrect: number,
  line = 1,
): QuizThresholdStatement {
  return { kind: "restated", line, statedQuestions, statedCorrect };
}

function unreadable(checkId?: string, line = 1): QuizThresholdStatement {
  return { kind: "unreadable", line, checkId };
}

type FixtureRow = [id: string, topic: string, text: string, expected: QuizThresholdStatement[]];

// The fixture table ADR-0001 item 6 names as normative: changing a row changes what content:validate
// counts as a quiz threshold statement and how it reads it. Each id starts with its topic, so a red
// row names what it pins. Invisible and look-alike characters are escapes, never pasted.
const FIXTURE_ROWS: FixtureRow[] = [
  [
    "join-wrapped",
    "join",
    "**`x-quiz`** (квиз): 6 вопросов,\nнужно 5 верных.",
    [anchored("x-quiz", 6, 5)],
  ],
  [
    "join-crlf",
    "join",
    "**`x-quiz`** (квиз): 6 вопросов,\r\nнужно 5 верных.\r\n",
    [anchored("x-quiz", 6, 5)],
  ],
  [
    "join-blank",
    "join",
    "**`x-quiz`** (квиз): 6 вопросов,\n\nнужно 5 верных.",
    [unreadable("x-quiz")],
  ],
  [
    "join-blank-ws",
    "join",
    "**`x-quiz`** (квиз): 6 вопросов,\n \t\u00a0\nнужно 5 верных.",
    [unreadable("x-quiz")],
  ],
  ["block-h1", "block", "Квиз: не меньше 5\n# из 6", []],
  ["block-h6", "block", "Квиз: не меньше 5\n###### из 6", []],
  ["block-dash", "block", "Квиз: не меньше 5\n- из 6", []],
  ["block-star", "block", "Квиз: не меньше 5\n* из 6", []],
  ["block-plus", "block", "Квиз: не меньше 5\n+ из 6", []],
  ["block-ord-dot", "block", "Квиз: не меньше 5\n12. из 6", []],
  ["block-ord-paren", "block", "Квиз: не меньше 5\n1) из 6", []],
  ["block-quote", "block", "Квиз: не меньше 5\n>из 6", []],
  ["block-table", "block", "Квиз: не меньше 5\n|из 6", []],
  ["block-indented", "block", "Квиз: не меньше 5\n   - из 6", []],
  ["block-h7", "block", "Квиз: не меньше 5\n####### из 6", [unreadable()]],
  ["block-hash-nospace", "block", "Квиз: не меньше 5\n#x из 6", [unreadable()]],
  ["block-dash-nospace", "block", "Квиз: не меньше 5\n-x из 6", [unreadable()]],
  ["fence-nojoin", "fence", "```\nКвиз: не меньше 5\nиз 6\n```", []],
  ["fence-tilde-nojoin", "fence", "  ~~~\nКвиз: не меньше 5\nиз 6\n~~~", []],
  ["fence-read", "fence", "```\nКвиз: не меньше 5 из 6.\n```", [restated(6, 5, 2)]],
  ["fence-two-backticks", "fence", "``\nКвиз: не меньше 5\nиз 6", [unreadable()]],
  ["marker-quote-list", "marker", "> > - Квиз: не меньше 5 из 6.", [restated(6, 5)]],
  ["marker-heading", "marker", "### Квиз: не меньше 5 из 6", [restated(6, 5)]],
  ["marker-ordered", "marker", "12) Квиз: не меньше 5 из 6.", [restated(6, 5)]],
  ["marker-star", "marker", "* Квиз: не меньше 5 из 6.", [restated(6, 5)]],
  ["marker-two-lists", "marker", "- - Квиз: не меньше 5 из 6.", [unreadable()]],
  ["marker-table", "marker", "| Квиз: не меньше 5 из 6 |", [unreadable()]],
  ["split-dot", "split", "Квиз пройден. Квиз: не меньше 5 из 6.", [restated(6, 5)]],
  ["split-bang", "split", "Готово! Квиз: не меньше 5 из 6", [restated(6, 5)]],
  ["split-question", "split", "Готово? Квиз: не меньше 5 из 6", [restated(6, 5)]],
  ["split-nbsp", "split", "Готово.\u00a0Квиз: не меньше 5 из 6", [restated(6, 5)]],
  ["split-tab", "split", "Готово.\tКвиз: не меньше 5 из 6", [restated(6, 5)]],
  ["split-nows", "split", "Готово.Квиз: не меньше 5 из 6", [unreadable()]],
  ["split-wrapped", "split", "Первое предложение.\nКвиз: не меньше 5\nиз 6.", [restated(6, 5, 2)]],
  ["end-bang", "end", "Квиз: не меньше 5 из 6!", [restated(6, 5)]],
  ["end-two-dots", "end", "Квиз: не меньше 5 из 6..", [unreadable()]],
  ["end-ellipsis", "end", "Квиз: не меньше 5 из 6\u2026", [unreadable()]],
  ["number-leading-zero", "number", "Квиз: не меньше 05 из 06", [restated(6, 5)]],
  ["number-arabic-indic", "number", "Квиз: не меньше \u0665 из \u0666", []],
  ["number-fullwidth", "number", "Квиз: не меньше \uff15 из \uff16", []],
  ["number-after-letter", "number", "квиз 5 tasks2 из 6", [unreadable()]],
  ["anchor-bold", "anchor", "**`x-quiz`** (квиз): шесть вопросов.", [unreadable("x-quiz")]],
  ["anchor-plain", "anchor", "`x-quiz` (квиз): шесть.", [unreadable("x-quiz")]],
  ["anchor-bold-right", "anchor", "`x-quiz`** (квиз): шесть.", [unreadable("x-quiz")]],
  ["anchor-bold-left", "anchor", "**`x-quiz` (квиз): шесть.", [unreadable("x-quiz")]],
  ["anchor-no-space", "anchor", "`x-quiz`(квиз): шесть.", []],
  ["anchor-two-spaces", "anchor", "`x-quiz`  (квиз): шесть.", []],
  ["anchor-tab", "anchor", "`x-quiz`\t(квиз): шесть.", []],
  ["anchor-nbsp", "anchor", "`x-quiz`\u00a0(квиз): шесть.", []],
  ["anchor-upper-kviz", "anchor", "`x-quiz` (КВИЗ): шесть.", []],
  ["anchor-upper-slug", "anchor", "`X-Quiz` (квиз): шесть.", []],
  ["anchor-underscore-slug", "anchor", "`x_quiz` (квиз): шесть.", []],
  ["anchor-not-at-start", "anchor", "Пройдите `x-quiz` (квиз): шесть.", []],
  ["anchor-no-colon", "anchor", "`x-quiz` (квиз) шесть.", []],
  ["stem-upper", "stem", "КВИЗ: 5 из 6", [unreadable()]],
  ["stem-mixed-case", "stem", "кВиЗ 5 из 6", [unreadable()]],
  ["stem-inside-word", "stem", "Реквизиты: 5 из 6", [unreadable()]],
  ["stem-word-form", "stem", "Квизы 5 из 6", [unreadable()]],
  ["stem-latin-k", "stem", "kвиз 5 из 6", []],
  ["stem-latin-word", "stem", "quiz: 5 из 6", []],
  ["stem-no-count", "stem", "Квиз: шесть вопросов", []],
  ["pct", "pct", "квиз 80%", [unreadable()]],
  ["pct-space", "pct", "квиз 80 %", [unreadable()]],
  ["pct-spaces", "pct", "квиз 80   %", [unreadable()]],
  ["pct-tab", "pct", "квиз 80\t%", [unreadable()]],
  ["pct-nbsp", "pct", "квиз 80\u00a0%", [unreadable()]],
  ["pct-word", "pct", "квиз 80 процентов", []],
  ["pct-between", "pct", "квиз 80 x %", []],
  ["iz", "iz", "квиз 5 из 6", [unreadable()]],
  ["iz-upper", "iz", "квиз 5 ИЗ 6", [unreadable()]],
  ["iz-tabs", "iz", "квиз 5\tиз\t6", [unreadable()]],
  ["iz-nbsp", "iz", "квиз 5\u00a0из\u00a06", [unreadable()]],
  ["iz-spaces", "iz", "квиз 5   из   6", [unreadable()]],
  ["iz-nospace-before", "iz", "квиз 5из 6", []],
  ["iz-nospace-after", "iz", "квиз 5 из6", []],
  ["iz-words", "iz", "квиз 5 из шести", []],
  ["word-latin", "word", "Квиз: не меньше 5 tasks из 6.", [unreadable()]],
  ["word-upper", "word", "квиз 5 TASKS из 6", [unreadable()]],
  ["word-hyphen", "word", "квиз 5 вопросов-сценариев из 6", [unreadable()]],
  ["word-yo", "word", "квиз 5 зачтённых из 6", [unreadable()]],
  ["word-paren", "word", "квиз 5 (верных) из 6", [unreadable()]],
  ["word-comma", "word", "квиз 5 tasks, из 6", [unreadable()]],
  ["word-tab", "word", "квиз 5\ttasks\tиз 6", [unreadable()]],
  ["word-two-words", "word", "квиз 5 good tasks из 6", []],
  ["word-digit-in-word", "word", "квиз 5 t2sks из 6", []],
  ["word-dot-in-word", "word", "квиз 5 т.е из 6", []],
  ["vern", "vern", "квиз 5 верных", [unreadable()]],
  ["vern-upper", "vern", "квиз 5 ВЕРНЫХ", [unreadable()]],
  ["vern-pravil", "vern", "квиз 5 Правильных", [unreadable()]],
  ["vern-tab", "vern", "квиз 5\tверных", [unreadable()]],
  ["vern-prefix", "vern", "квиз 5 верно", [unreadable()]],
  ["vern-nevern", "vern", "квиз 5 неверных", []],
  ["vern-nospace", "vern", "квиз 5верных", []],
  ["vern-words", "vern", "квиз пять верных", []],
  [
    "own-form-A",
    "own-form",
    "**`mcp-quiz`** (квиз): 5 вопросов-сценариев, нужно 4 верных. В вопросах есть подвох.",
    [anchored("mcp-quiz", 5, 4)],
  ],
  [
    "own-form-B",
    "own-form",
    "- **`skills-quiz`** (квиз): 6 вопросов, нужно 5 верных.",
    [anchored("skills-quiz", 6, 5)],
  ],
  [
    "own-form-C",
    "own-form",
    "**`reviewer-quiz`** (квиз): 6 вопросов-сценариев, нужно не меньше 5 верных.",
    [anchored("reviewer-quiz", 6, 5)],
  ],
  [
    "own-form-D",
    "own-form",
    "`analysis-quiz` (квиз): 6 вопросов-сценариев про Explore, plan mode, ссылки @ и порядок исследования, нужно не меньше 5 верных.",
    [anchored("analysis-quiz", 6, 5)],
  ],
  [
    "own-ending-latin-suffix",
    "own-ending",
    "`x-quiz` (квиз): 6 вопросов-scenarios, нужно 5 верных.",
    [anchored("x-quiz", 6, 5)],
  ],
  [
    "own-ending-paren",
    "own-ending",
    "`x-quiz` (квиз): 6 вопрос(ов), нужно 5 верн(ых).",
    [anchored("x-quiz", 6, 5)],
  ],
  [
    "own-ending-upper",
    "own-ending",
    "`x-quiz` (квиз): 6 вопросОВ, нужно 5 вернЫХ.",
    [anchored("x-quiz", 6, 5)],
  ],
  [
    "own-ending-empty",
    "own-ending",
    "`x-quiz` (квиз): 6 вопрос, нужно 5 верн.",
    [anchored("x-quiz", 6, 5)],
  ],
  [
    "own-ending-middle-comma",
    "own-ending",
    "`x-quiz` (квиз): 6 вопросов, про Explore, нужно 5 верных.",
    [anchored("x-quiz", 6, 5)],
  ],
  [
    "own-reject-digit-in-ending",
    "own-reject",
    "`x-quiz` (квиз): 6 вопросов2, нужно 5 верных.",
    [unreadable("x-quiz")],
  ],
  [
    "own-reject-digit-in-middle",
    "own-reject",
    "`x-quiz` (квиз): 6 вопросов про 2 темы, нужно 5 верных.",
    [unreadable("x-quiz")],
  ],
  [
    "own-reject-tab-middle",
    "own-reject",
    "`x-quiz` (квиз): 6 вопросов\tпро Explore, нужно 5 верных.",
    [unreadable("x-quiz")],
  ],
  [
    "own-reject-two-spaces",
    "own-reject",
    "`x-quiz` (квиз):  6 вопросов, нужно 5 верных.",
    [unreadable("x-quiz")],
  ],
  [
    "own-reject-nbsp",
    "own-reject",
    "`x-quiz` (квиз): 6 вопросов,\u00a0нужно 5 верных.",
    [unreadable("x-quiz")],
  ],
  [
    "own-reject-upper-nuzhno",
    "own-reject",
    "`x-quiz` (квиз): 6 вопросов, Нужно 5 верных.",
    [unreadable("x-quiz")],
  ],
  [
    "own-reject-upper-vopros",
    "own-reject",
    "`x-quiz` (квиз): 6 Вопросов, нужно 5 верных.",
    [unreadable("x-quiz")],
  ],
  [
    "own-reject-ne-menee",
    "own-reject",
    "`x-quiz` (квиз): 6 вопросов, нужно не менее 5 верных.",
    [unreadable("x-quiz")],
  ],
  [
    "own-reject-trailing-word",
    "own-reject",
    "`x-quiz` (квиз): 6 вопросов, нужно 5 верных ответов.",
    [unreadable("x-quiz")],
  ],
  [
    "own-reject-trailing-comma",
    "own-reject",
    "`x-quiz` (квиз): 6 вопросов, нужно 5 верных,",
    [unreadable("x-quiz")],
  ],
  [
    "own-reject-next-sentence",
    "own-reject",
    "**`x-quiz`** (квиз): 6 вопросов. Нужно 5 верных.",
    [unreadable("x-quiz")],
  ],
  [
    "own-reject-second-number",
    "own-reject",
    "**`x-quiz`** (квиз): 6 вопросов, нужно 5 верных, нужно 4 верных.",
    [unreadable("x-quiz")],
  ],
  ["restate-plain", "restate", "Квиз: не меньше 5 из 6", [restated(6, 5)]],
  ["restate-vern", "restate", "Квиз: не меньше 5 верных из 6.", [restated(6, 5)]],
  ["restate-vern-bare", "restate", "Квиз: не меньше 5 верн из 6.", [restated(6, 5)]],
  ["restate-vern-latin", "restate", "Квиз: не меньше 5 вернx из 6.", [restated(6, 5)]],
  ["restate-reject-upper", "restate-reject", "КВИЗ: не меньше 5 из 6.", [unreadable()]],
  ["restate-reject-lower", "restate-reject", "квиз: не меньше 5 из 6.", [unreadable()]],
  ["restate-reject-pravil", "restate-reject", "Квиз: не меньше 5 правильных из 6.", [unreadable()]],
  ["restate-reject-latin-word", "restate-reject", "Квиз: не меньше 5 tasks из 6.", [unreadable()]],
  ["restate-reject-two-spaces", "restate-reject", "Квиз:  не меньше 5 из 6.", [unreadable()]],
  ["restate-reject-tab", "restate-reject", "Квиз:\tне меньше 5 из 6.", [unreadable()]],
  ["restate-reject-iz-upper", "restate-reject", "Квиз: не меньше 5 ИЗ 6.", [unreadable()]],
  ["restate-reject-trailing", "restate-reject", "Квиз: не меньше 5 из 6 вопросов.", [unreadable()]],
  [
    "restate-reject-comma-ending",
    "restate-reject",
    "Квиз: не меньше 5 верных, из 6.",
    [unreadable()],
  ],
  ["residual-slash", "residual", "Квиз: нужно 5/6.", []],
  ["residual-words", "residual", "Квиз: нужно пять из шести.", []],
  ["residual-mixed", "residual", "Квиз: нужно 5 из шести.", []],
  ["residual-percent-word", "residual", "Квиз: нужно 80 процентов.", []],
  ["residual-pass-score", "residual", "Квиз: проходной балл 0.8.", []],
  ["residual-no-stem", "residual", "Нужно 5 из 6.", []],
];

describe("quizThresholdStatements", () => {
  it.each([
    [
      "A",
      "**`mcp-quiz`** (квиз): 5 вопросов-сценариев, нужно 4 верных. В вопросах с пометкой есть подвох.",
      anchored("mcp-quiz", 5, 4),
    ],
    ["B", "- **`skills-quiz`** (квиз): 6 вопросов, нужно 5 верных.", anchored("skills-quiz", 6, 5)],
    [
      "B without a dash",
      "**`memory-precedence-quiz`** (квиз): 8 вопросов, нужно 6 верных. В каждом вопросе один ответ.",
      anchored("memory-precedence-quiz", 8, 6),
    ],
    [
      "C",
      "**`reviewer-quiz`** (квиз): 6 вопросов-сценариев, нужно не меньше 5 верных.",
      anchored("reviewer-quiz", 6, 5),
    ],
    [
      "D",
      "`analysis-quiz` (квиз): 6 вопросов-сценариев про Explore, plan mode, ссылки @ и порядок исследования, нужно не меньше 5 верных.",
      anchored("analysis-quiz", 6, 5),
    ],
  ])("reads the check's sentence in each form the course uses: %s", (_form, text, expected) => {
    const statements = quizThresholdStatements(text);

    expect(statements).toEqual([expected]);
  });

  it("joins a sentence wrapped over lines and reports the line it starts on", () => {
    const text =
      "Первый абзац.\nЕго продолжение.\n\n" +
      "**`orchestration-quiz`** (квиз): 6 вопросов-сценариев о выборе шаблона, числа агентов и модели для\n" +
      "роли, нужно не меньше 5 верных. В вопросах есть подвох.\n\n" +
      "- **`b-quiz`** (квиз): 6 вопросов,\n  нужно 5 верных.\n";

    const statements = quizThresholdStatements(text);

    expect(statements).toEqual([
      anchored("orchestration-quiz", 6, 5, 4),
      anchored("b-quiz", 6, 5, 7),
    ]);
  });

  it("reports a sentence that starts in the middle of a wrapped line at that line", () => {
    const text =
      "Вступление без точки\nи первое предложение. **`x-quiz`** (квиз): 6 вопросов,\nнужно 5 верных.\n";

    const statements = quizThresholdStatements(text);

    expect(statements).toEqual([anchored("x-quiz", 6, 5, 2)]);
  });

  it("reads both checklist restatements", () => {
    const text = "11. Квиз: не меньше 5 из 6.\n\nКвиз: не меньше 5 верных из 6.\n";

    const statements = quizThresholdStatements(text);

    expect(statements).toEqual([restated(6, 5, 1), restated(6, 5, 3)]);
  });

  it("ends a list item without a final period at the next item", () => {
    const text =
      "- **`x-quiz`** (квиз): 6 вопросов, нужно 5 верных\n- Квиз: не больше 3 попыток.\n";

    const statements = quizThresholdStatements(text);

    expect(statements).toEqual([anchored("x-quiz", 6, 5)]);
  });

  it("does not take K from the next sentence", () => {
    const text = "**`x-quiz`** (квиз): 6 вопросов. Нужно 5 верных.";

    const statements = quizThresholdStatements(text);

    expect(statements).toEqual([unreadable("x-quiz")]);
  });

  it("does not take K from a second number in the sentence", () => {
    const text = "**`x-quiz`** (квиз): 6 вопросов, нужно 5 верных, нужно 4 верных.";

    const statements = quizThresholdStatements(text);

    expect(statements).toEqual([unreadable("x-quiz")]);
  });

  it("does not join lines inside a fenced block", () => {
    const text = "```\nквиз: 4\nиз 6 верных\n```\n";

    const statements = quizThresholdStatements(text);

    expect(statements).toEqual([]);
  });

  it.each([
    "- Квиз: не больше 3 попыток. После неудачи откроется разбор.",
    "- `analysis-quiz`: не больше 3 попыток.",
    "**`plan-rubric`** (ментор оценивает план, нужно 70%):",
    "- Нужно найти не меньше 5 ошибок.",
    "- не меньше 1 вопроса в разделе Вопросы до старта;",
    "4. Найдено не меньше 5 из 6 спрятанных мест.",
    "- проверка пройдена, когда верны не меньше 5 карточек из 6;",
    "6. Квиз пройден.",
    "- квиз: около 10 минут.",
    "5. Пройдите квиз `cascade-quiz`.",
    'В вопросах с пометкой "выберите все верные" засчитывается только полный ответ.',
    "Первый запуск засчитывается как 1 из 10 попыток.",
  ])("finds no statement in text that only looks like a threshold: %s", (text) => {
    const statements = quizThresholdStatements(text);

    expect(statements).toEqual([]);
  });

  it.each([
    ["Квиз: нужно 80% верных.", undefined],
    ["Пройдите **`x-quiz`** (квиз): 6 вопросов, нужно 5 верных.", undefined],
    ["**`x-quiz`** (квиз): 6 вопросов.", "x-quiz"],
    ["Квиз: 5 из 6 верных.", undefined],
  ])("reports a quiz sentence with a count in another form as unreadable: %s", (text, checkId) => {
    const statements = quizThresholdStatements(text);

    expect(statements).toEqual([unreadable(checkId)]);
  });

  it("reads CRLF text like LF text", () => {
    const text =
      "# Задание\r\n\r\n**`mcp-quiz`** (квиз): 5 вопросов-сценариев, нужно 4 верных.\r\n";

    const statements = quizThresholdStatements(text);

    expect(statements).toEqual([anchored("mcp-quiz", 5, 4, 3)]);
  });

  it("reads a long digit run after the quiz stem without backtracking over it", () => {
    // Far from both sides: about 1 ms with the digit-run lookbehind, 10 to 15 s without it.
    const boundMs = 500;
    const text = `Квиз ${"1".repeat(60_000)}`;

    const startedAt = performance.now();
    const statements = quizThresholdStatements(text);
    const elapsedMs = performance.now() - startedAt;

    expect(statements).toEqual([]);
    expect(elapsedMs).toBeLessThan(boundMs);
  });

  it.each(FIXTURE_ROWS)(
    "reads fixture %s (topic %s) into the statements its row lists",
    (_id, _topic, text, expected) => {
      const statements = quizThresholdStatements(text);

      expect(statements).toEqual(expected);
    },
  );
});
