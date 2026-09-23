# Wicklume

Wicklume is a local prototype for learning chart reading through short lessons and synthetic practice challenges. [How to contribute](CONTRIBUTING.md).

**Open the website:** https://japesh-a.github.io/Trading-App/  
**Share feedback or comments:** https://github.com/japesh-a/Trading-App/issues

Run with Node.js 24 or newer:

```powershell
cd C:\Users\mukes\wicklume
npm.cmd run dev
```

Open http://localhost:5173 alongside your editor. The development command watches the frontend, server and curriculum and reloads the browser after changes.

Eighteen focused lessons with three teaching slides and ten questions each, three synthetic chart challenges, server-assessed answers, local SQLite progress, XP and milestones. The app uses a single local learner profile, not production accounts. No package installation is needed. Progress is stored in data/wicklume.db.

Run `npm test` to check the full lesson path and challenge API. The automated GitHub check runs this on every push and pull request.

The [GitHub repository](https://github.com/japesh-a/Trading-App) shares the source and hosts comments, Issues and Pull Requests. Pushing a change to `main` runs the tests and publishes the browser version to GitHub Pages. On GitHub Pages, each visitor's progress is saved in their own browser's local storage. It will not sync across devices; the local Node version continues to use SQLite.
