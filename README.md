# Wicklume

Wicklume is a local prototype for learning chart reading through short lessons and synthetic practice challenges. [How to contribute](CONTRIBUTING.md).

**Open the website:** https://japesh-a.github.io/Trading-App/  
**Share feedback or comments:** https://github.com/japesh-a/Trading-App/issues

Run with Node.js 24 or newer:

```powershell
cd C:\Users\44775\Trading-App
npm.cmd run dev
```

Open http://localhost:5173 alongside your editor. The development command watches the frontend, server and curriculum and reloads the browser after changes.

Eighteen detailed lessons with three illustrated teaching slides, worked examples and ten questions each. Each lesson has its own chart or diagram, with 54 slide-specific visual states. The app also has three synthetic chart challenges, server-assessed answers, local SQLite progress, XP and milestones. The app uses a single local learner profile, not production accounts. No package installation is needed. Progress is stored in data/wicklume.db.

Lesson explanations live in `lesson-content.mjs` and `lesson-notes.mjs`. Questions live in `question-bank.json`; diagrams live in `public/lesson-visuals.js`. The examples use invented prices. References include [CME's candlestick guide](https://www.cmegroup.com/education/courses/technical-analysis/chart-types-candlestick-line-bar), [CME's support and resistance guide](https://www.cmegroup.com/education/courses/technical-analysis/support-and-resistance), and the [SEC's guide to order types](https://www.investor.gov/introduction-investing/general-resources/news-alerts/alerts-bulletins/investor-bulletins-14).

Run `npm test` to check the full lesson path and challenge API. The automated GitHub check runs this on every push and pull request.

The [GitHub repository](https://github.com/japesh-a/Trading-App) shares the source and hosts comments, Issues and Pull Requests. Pushing a change to `main` runs the tests and publishes the browser version to GitHub Pages. On GitHub Pages, each visitor's progress is saved in their own browser's local storage. It will not sync across devices; the local Node version continues to use SQLite.
