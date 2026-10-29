# Reference program

The course stays close to the Hexlet program AI for developers ("ИИ для разработчиков") (the course page, the
program was updated in July 2026). Their blocks are listed below, taken from screenshots of the course page.
The methodologists build on this structure and justify any deviation in the module design.

## Introduction to AI-assisted development ("Введение в разработку с ИИ")
A short block that brings everyone to the same starting point.
- Choosing models and the reasoning effort level. Local models
- Overview of assistants and pricing. The economics of price versus quality
- Context engineering. Planning and execution
- How agents work: loop, harness, tools, MCP and how they relate to each other
- Memory, AGENTS.md and using it effectively
- Security and permission control
Result: a shared baseline for everyone.

## Spec Driven Development
- Verifying the result of an agent's work: teaching the agent to check that its solutions work
- Skills: how they work, popular skills, managing their lifecycle in a project
- SDD from design to implementation: ADR, PRD and other artifacts, automated integrity control
  and updates
- Project ontology: domain model, entities, relationships and processes
- Real-world cases built on Matt Pocock's skills
Result: moving from ordinary planning to working through a specification.

## Agentic development patterns ("Паттерны агентной разработки")
Best practices for organizing the project, the harness and the interaction with the agent.
- Adapting the project to the agent: why you need to change the code rather than describe rules
- Meta-skills: where an LLM fails and why, how to improve the harness and the project code
- How the approaches change when developing in closed environments
- Anti-patterns
Result: the project is so clear to the agent that almost every task ends with code
that needs no rework.

## Subagent orchestration and multi-agent pipelines ("Оркестрация субагентов и мультиагентные пайплайны")
- A read-only reviewer subagent and a Coder -> Reviewer -> Summarizer pipeline under an orchestrator
- The role contract: goal, output format, boundaries; compressed summaries for handoff
- "A model per role" for different pipeline steps
- Fan-out of parallel reviewers (security / style / performance) -> synthesizer
- Protection against a cascade of hallucinations: citations and cross-checks at handoff boundaries
- Observability of handoffs and rule-based evaluation at the joints
Result: multi-agent pipelines that do not fall apart at handoffs.

## Final project: call scheduling calendar ("Итоговый проект: календарь звонков")
Booking time slots in the style of Calendly with different schedules and activity types, Design First.
- Architecture design and the API contract (TypeSpec)
- Backend and frontend development through SDD
- Integration and E2E testing
- Continuous integration and deployment (for us: local, Docker)
Result: a finished project for the portfolio.

## Working with legacy code ("Работа с legacy-кодом")
- Analyzing an existing project
- Immersing the AI in the project structure
- Safe refactoring
- Gradually introducing AI into existing processes

## Our amendments
- Legacy is part of the main program (at Hexlet it is only in the extended plan).
- Practice happens in the platform's workspace, checked through hidden-task and rubric, not only
  "built the project".
