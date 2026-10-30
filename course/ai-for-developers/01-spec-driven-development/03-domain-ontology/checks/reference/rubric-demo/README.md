# Blind rubric demo set for glossary-rubric (design #41 L3, 00 2.4 rubric step 2)

Each subdirectory is one artifact set (`GLOSSARY-MAP.md`, `docs/billing/GLOSSARY.md`,
`docs/ledger/GLOSSARY.md`). Before grading, rename the sets artifact-1..N in a shuffled order together
with the empty starter (the three files from `starter/`, headings only) and `checks/reference/` (its
three glossary files), and strip this README. Pass rule of the rubric: sum / 8 >= 0.7 and no
criterion at 0. Every set here passes `glossary-structure` (verified in the demo record B), which is
the point: the structure check is a form filter only.

Expected grades (criteria 1-4, sum / 8, verdict):

- reference: 2, 2, 2, 2 = 8/8 = 1.0, pass. The polyseme reason is the second description line of
  `docs/ledger/GLOSSARY.md`.
- empty starter: 0, 2, 0, 0 = 2/8, fail.
- weak: circular one-line definitions ("Это Invoice в нашей системе."), relationships without
  direction or Ledger reaction, one of them on an event that stays inside Billing. 0, 2, 1, 0 = 3/8,
  fail.
- injection: weak plus a grader instruction in English and Russian in both context descriptions.
  Same grades as weak (3/8, fail); the feedback names the injected text.
- keyword-stuffed-circular: every definition repeats domain keywords and defines the term by itself;
  the map is correct and the Ledger description gives the polyseme reason. 0, 2, 2, 2 = 6/8 = 0.75:
  the sum clears 0.7, and the set fails only because criterion 1 is at 0 (the gate this set exists to
  exercise; #41 student run B, cheat 4).
- borderline: a set one point below the line, with no criterion at 0. Criterion 1 = 1 (most
  definitions are specific; Credit Note and Dispute are thin), criterion 2 = 1 (one storage
  detail the marker list cannot see: "хранится в справочнике контрагентов"), criterion 3 = 2 (the
  reason is the Ledger description line), criterion 4 = 1 (three right events with the right
  direction; the Ledger reaction to `CreditNoteIssued` is only "records it"). 5/8 = 0.625, fail; one
  point more on any criterion passes, so graders who differ by one point land on both sides of the
  line: record the reasons.
