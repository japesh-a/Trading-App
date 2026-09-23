// The GitHub Pages build injects this before app.js. Each browser keeps its own
// learning progress because GitHub Pages cannot run the local Node/SQLite API.
(() => {
  if (!window.__WICKLUME_STATIC__) return;
  const originalFetch = window.fetch.bind(window);
  const contentUrl = new URL('./site-data.json', document.currentScript.src);
  const content = originalFetch(contentUrl).then(response => {
    if (!response.ok) throw Error('Unable to load lessons');
    return response.json();
  });
  const storageKey = 'wicklume-pages-progress-v1';
  const initial = () => ({ completed: [], challenges: [], attempts: 0, correct: 0, days: [], answers: {} });
  const progress = () => {
    try {
      const value = JSON.parse(localStorage.getItem(storageKey));
      return value && Array.isArray(value.completed) && Array.isArray(value.challenges) ? value : initial();
    } catch { return initial(); }
  };
  const save = state => { try { localStorage.setItem(storageKey, JSON.stringify(state)); } catch {} };
  const reply = (value, status = 200) => new Response(JSON.stringify(value), {
    status, headers: { 'Content-Type': 'application/json' }
  });

  window.fetch = async (input, options = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    if (!url.pathname.startsWith('/api/')) return originalFetch(input, options);
    const data = await content;
    const state = progress();
    if (url.pathname === '/api/progress') return reply(state);
    if (url.pathname === '/api/lessons') return reply(data.lessons);
    if (url.pathname === '/api/scenario') {
      const id = Number(url.searchParams.get('id'));
      return Number.isInteger(id) && id >= 0 && id < data.series.length
        ? reply({ candles: data.series[id].slice(0, 16) })
        : reply({ error: 'Invalid scenario' }, 400);
    }
    if (options.method !== 'POST') return reply({ error: 'Not found' }, 404);
    let body;
    try { body = JSON.parse(options.body); } catch { return reply({ error: 'Invalid request' }, 400); }
    const id = body.id;
    if (url.pathname === '/api/answer') {
      const question = body.question;
      if (!Number.isInteger(id) || id < 0 || id >= data.lessons.length ||
          !Number.isInteger(question) || question < 0 || question >= 10 ||
          !Number.isInteger(body.answer) || body.answer < 0 || body.answer > 2) {
        return reply({ error: 'Invalid answer' }, 400);
      }
      if (id > 0 && !state.completed.includes(id - 1)) return reply({ error: 'Complete the previous lesson first' }, 400);
      state.answers ??= {};
      state.answers[id] ??= [];
      if (question !== state.answers[id].length) return reply({ error: 'Answer the questions in order' }, 400);
      const answer = data.correct[id][question];
      const correct = body.answer === answer;
      state.answers[id].push(body.answer);
      state.attempts++;
      if (correct) state.correct++;
      const completed = state.answers[id].length === data.lessons[id].questions.length;
      if (completed && !state.completed.includes(id)) state.completed.push(id);
      const lesson = data.lessons[id];
      const explanation = `The correct answer is: ${lesson.questions[question].options[answer]}. ${lesson.slides[Math.min(2, Math.floor(question / 4))][1]}`;
      const day = new Date().toISOString().slice(0, 10);
      if (!state.days.includes(day)) state.days.push(day);
      save(state);
      return reply({ correct, answer, completed, explanation, progress: state });
    }
    if (url.pathname === '/api/decision') {
      if (!Number.isInteger(id) || id < 0 || id >= data.series.length ||
          !['Buy', 'No trade', 'Sell'].includes(body.choice) ||
          !Number.isInteger(body.reason) || body.reason < 0 || body.reason > 2) {
        return reply({ error: 'Choose a decision and reason' }, 400);
      }
      const best = ['Buy', 'Sell', 'No trade'][id];
      if (!state.challenges.includes(id)) state.challenges.push(id);
      const day = new Date().toISOString().slice(0, 10);
      if (!state.days.includes(day)) state.days.push(day);
      save(state);
      return reply({ best, candles: data.series[id], aligned: body.choice === best && body.reason === id, progress: state });
    }
    return reply({ error: 'Not found' }, 404);
  };
})();
