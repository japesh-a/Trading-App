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

The interface lives in `public/`. Lesson slides and questions live in `curriculum.mjs`. The local server and progress API live in `server.mjs`. Please keep lessons focused and give each lesson three concise slides and at least ten useful questions. Avoid questions that imply a chart pattern guarantees a future outcome.

Do not commit `data/`, which contains local learner progress, or any `.env` file with secrets.
