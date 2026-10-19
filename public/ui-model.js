// Pure presentation rules shared by the dashboard, navigation and status chips.
export const NAV_GROUPS = [
  { label: 'LEARN', items: [{ page: 'home', icon: '⌂', text: 'Overview' }, { page: 'learn', icon: '▦', text: 'Learning path' }] },
  { label: 'PRACTICE', items: [{ page: 'practice', icon: '⌁', text: 'Daily challenge', hint: 'One scenario a day' }, { page: 'paper', icon: '◈', text: 'Open paper practice', hint: 'Free practice, any time' }] },
  { label: 'JOURNAL', items: [{ page: 'journal', icon: '▤', text: 'Trade journal' }] },
  { label: 'PROGRESS', items: [{ page: 'profile', icon: '◉', text: 'Your progress' }, { page: 'leaderboard', icon: '♜', text: 'Leaderboards' }] },
];

export function primaryAction({ completed = 0, total = 21, nextLesson = -1 } = {}) {
  if (total > 0 && completed >= total) return { label: 'Daily review', page: 'practice', graduated: true };
  const lesson = nextLesson >= 0 ? nextLesson : Math.min(completed, Math.max(0, total - 1));
  return { label: completed > 0 ? 'Continue lesson' : 'Start your first lesson', lesson, graduated: false };
}

export function feedBadge(data = {}) {
  if (data.demo || data.synthetic) return { kind: 'synthetic', label: 'Synthetic practice data', detail: 'Generated for practice, not real market history.' };
  if (data.stale) return { kind: 'stale', label: 'Stale quotes', detail: 'Quotes are out of date; fills are not verified.' };
  if (data.delayed) return { kind: 'delayed', label: 'Delayed quotes', detail: 'Prices are delayed.' };
  return { kind: 'connected', label: 'Connected feed', detail: 'Prices come from the data provider.' };
}

export function saveStatus({ online = true, signedIn = false, failed = false, saving = false } = {}) {
  if (!online) return { kind: 'offline', label: 'Offline · changes wait on this device', action: null };
  if (failed) return { kind: 'error', label: 'Not saved', action: 'Retry' };
  if (saving) return { kind: 'saving', label: 'Saving…', action: null };
  return signedIn ? { kind: 'synced', label: 'Saved to your account', action: null } : { kind: 'local', label: 'Saved on this device only', action: 'Sign in to sync' };
}

const STATES = {
  loading: { role: 'status', title: 'Loading…', body: 'This will only take a moment.', action: null },
  empty: { role: 'status', title: 'Nothing here yet', body: 'Complete an activity and it will appear here.', action: null },
  error: { role: 'alert', title: 'Something went wrong', body: 'Your saved work is safe. You can try again.', action: 'Try again' },
};
export function stateMessage(kind, overrides = {}) { return { ...(STATES[kind] || STATES.error), ...overrides }; }
const esc = s => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
export function stateHTML(kind, overrides = {}) {
  const s = stateMessage(kind, overrides);
  return `<div class="empty-state ${esc(kind)}" role="${s.role}"><h3>${esc(s.title)}</h3><p>${esc(s.body)}</p>${s.action ? `<button class="btn" data-retry>${esc(s.action)}</button>` : ''}</div>`;
}

export function navHTML(groups = NAV_GROUPS) {
  return groups.map(g => `<div class="workspace-label">${g.label}</div>` + g.items.map(i => `<button data-page="${i.page}">${i.icon} <span>${i.text}</span>${i.hint ? `<small>${i.hint}</small>` : ''}</button>`).join('')).join('');
}
