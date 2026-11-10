# deploy-rubric demo (design 6, S11)

| Artifacts | 1 README | 2 tzdata | 3 pasted run | 4 AGENTS.md | 5 persistence | Sum / 10 | Verdict |
|---|---|---|---|---|---|---|---|
| untouched starter (R7: no compose.yaml, no Dockerfile, no AGENTS.md, no docs/deploy-run.md) | 0 | 0 | 0 | 0 | 1 | 0.10 | FAIL |
| reference `checks/reference/` as committed, with `docs/deploy-run.md` | 2 | 2 | 2 | 2 | 2 | 1.00 | PASS |
| the same reference without `docs/deploy-run.md` (as it stood before Stepan's run) | 2 | 2 | 0 | 2 | 2 | 0.80 | FAIL (criterion 3 at 0) |

Reference, per criterion:
1. README "Развёртывание на своей машине": `docker compose up --build`, api on 8080 inside the compose network only,
   web on http://localhost:3000 after api is healthy, data created with `curl` through the page's `/api/` proxy, the
   booking page URL, `docker compose down`.
2. `backend/Dockerfile`: the final stage is `gcr.io/distroless/static-debian13:nonroot`, and its comment says
   distroless static ships `/usr/share/zoneinfo`, which `time.LoadLocation` reads.
3. `docs/deploy-run.md`: Stepan's run of R8 on his Mac (Docker 29.9.2) on 2026-11-09, quoted verbatim with the
   build steps trimmed.
   `docker compose ps` shows `Up 11 minutes (healthy)` for api and `Up 11 minutes` for web, the `up --build` tail
   shows both `Image ... Built` lines and `Container calendar-r8-44-api-1 Healthy`, and
   `curl -si http://localhost:3100/api/event-types` through the page returns `HTTP/1.1 200 OK` with `{"items":[]}`.
   That is every part of the PASS line, so 2, graded as unverified like any learner's paste. The file says itself
   that the build output is a cached rerun (the first full build also passed), that the
   host port was moved to 3100 by an override file because 3000 was taken by another local stack, and that the
   list is empty because compose seeds no data. None of the three lowers the score: the PASS line asks for the
   output of `up --build` or `ps` after it, api healthy, web started and one request with its answer, not for an
   uncached build or a non-empty list, and the override touches neither `compose.yaml` nor the README (criterion 1
   still reads port 3000 from both). It does show that both images build, which no command check observes
   (residual R5), on one machine.
4. `AGENTS.md`: "The work is done only when it exits 0" for `make ci`, and the order spec, contract, `make gen`
   (commit the generated file, never edit it by hand), server, tests, `make ci`.
5. In-memory store (ADR 0001); the README says data is kept in the server's memory and is lost with the api
   container.

Starter, criterion 5 at 1: the in-memory store works, and the R7 README says nothing about where data lives.
