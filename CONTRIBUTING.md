# Contributing to Wicklume

Thanks for helping improve Wicklume. Small changes are welcome.

## Give feedback

- Open an **Issue** for a bug, unclear explanation, new lesson idea, or design suggestion.
- Use **Discussions** for open questions once the repository owner enables that feature.
- Comment on a **Pull Request** to discuss a proposed change or suggest edits to specific lines.

## Make a change

1. Create a branch in GitHub Desktop or fork the repository.
2. Edit the files and describe the change in a commit.
3. Run `npm test` if you changed lessons, quiz behaviour, or the server.
4. Open a Pull Request and describe what changed and how you checked it.

The interface lives in `public/`. Lesson slides live in `lesson-content.mjs`, worked examples in `lesson-notes.mjs`, diagrams in `public/lesson-visuals.js`, and questions in `question-bank.json`. `curriculum.mjs` assembles them. The local server and progress API live in `server.mjs`. Keep explanations concrete and give each lesson three illustrated slides and at least ten useful questions. Avoid questions that imply a chart pattern guarantees a future outcome.

Do not commit `data/`, which contains local learner progress, or any `.env` file with secrets.

## Licence and content permissions

- Application code is released under the MIT licence in `LICENSE`. By submitting a pull request you confirm you wrote the code (or have the right to submit it) and agree it is released under that licence.
- Lesson text, diagrams, questions and scenarios must be your own original work, or clearly sourced material you have permission to reuse. Do not copy from books, courses, paid data or other sites. By contributing content you give the project permission to publish and adapt it under CC BY 4.0; you can be credited by name or pseudonym if you ask.
- Contributors under 18 are welcome. Do not include personal information about yourself or others in issues, content or screenshots.
- The bundled TradingView Lightweight Charts keeps its own Apache 2.0 licence (`public/lightweight-charts-LICENSE.txt`).

## Getting set up

See `docs/DEVELOPMENT.md` for running without secrets and which checks to run, `docs/ARCHITECTURE.md` for data flow, migrations and feature flags, and `.env.example` for configuration. Planned work is described in `FEATURE_BACKLOG.md`; use the "Feature ticket" issue template to record ID, owner, dependencies, scope, acceptance criteria and validation.
