# How learning works

All learning happens in the web interface of the platform, which runs locally in Docker. Below is
what the learner sees and does and what happens behind the scenes.

## 1. Lesson

The lesson page has two parts.

On the left:
- theory (`theory.md`): short, starts from a concrete problem, with links to sources;
- task (`task.md`): what to do and how to tell that it is done;
- check results and the mentor review after submission.

On the right, the workspace, with tabs:
- **Terminal**: bash inside the lesson container. The agent (Claude Code or OpenCode) also runs
  here, with the key from `.env`;
- **Editor**: code-server (arrives in M4);
- **Agent**: at first this is just the agent in the terminal, later a separate panel with the
  transcript.

The workspace is a Docker container created for the lesson from `starter/`. Files are kept in a
volume, so you can close the browser and come back later.

## 2. Submission and checks

The "Check" button runs the checks from `lesson.yaml`:

| Check | What it checks | Where it runs |
|-------|----------------|---------------|
| quiz | understanding of concepts | server, correct answers never reach the browser |
| command | tests and scripts in the lesson repository | workspace container |
| rubric | artifacts: spec, ADR, PRD, AGENTS.md, ontology | mentor agent, by rubric |
| hidden-task | whether your agent setup works: the agent gets a hidden task and solves it in a copy of your workspace | separate container, headless agent |
| bug-hunt | whether you found the bugs in code "written by the agent" | compared against the answer key |

Grader files (`checks/`) never reach the workspace or the browser. The contract validator checks
this in CI.

Agent checks (hidden-task, rubric) spend tokens. Each has a budget in `lesson.yaml`, and the cost
of an attempt is shown on the dashboard.

## 3. Mentor review

After the checks, the mentor agent reviews the attempt the Socratic way. First a question, then a
scenario where things break, then a direction where to look. It never gives a ready solution. The
mentor sees both the result and the transcript of your work with the agent: where you gave poor
context, where you did not notice the agent going the wrong way.

Hint levels on request: question -> direction -> skeleton -> direct explanation. You say
hint ("подсказка") to go up one level, and can ask for the skeleton ("скелет") or a
direct explanation ("скажи прямо") by name.

## 4. Dashboard and course adaptation

The dashboard shows progress by module, attempt history, mentor remarks and weak topics. Weak
topics go to `learner/journal.md` (later to the database). The methodologists read the journal
when they design the next module and add practice where you stumble. The course is built for one
person, not "for everyone".

## 5. The second loop: learning on the platform itself (LEARN)

Some platform development tasks are labeled `tier:learn`. You write their code by hand:
- the agents do the research and the design, split into steps of 30-60 lines;
- you implement, the mentor helps on request;
- the tester runs the tests and the stack;
- three judges review your code in mentor mode, by the same bar as agent code;
- gaps go to the journal and shape the course.

The tasks picked for LEARN are the ones agents usually hide: workspaces on the Docker API, a
terminal over WebSocket, running checks with timeouts and concurrency, the hidden-task runner.

## 6. What a week looks like

1. Monday: you open the next lesson on the dashboard and read the theory.
2. Practice in the workspace, submission, mentor review, another attempt if needed.
3. In parallel, one LEARN task on the platform: branch, your own code, PR, CI, judge review.
4. At the end of the week you look at the journal: which topics came up and what the methodologists changed in the next module.
