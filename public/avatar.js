import { getSession, saveSession } from './trade-store.js';

export const COSTUMES = Object.freeze([
  { id: 'grey', name: 'Grey figure', lessons: 0 },
  { id: 'scarf', name: 'Blue scarf', lessons: 1 },
  { id: 'hoodie', name: 'Green hoodie', lessons: 3 },
  { id: 'explorer', name: 'Explorer', lessons: 6 },
  { id: 'graduate', name: 'Graduate', lessons: 21 },
].map(costume => Object.freeze(costume)));

export function completedLessonCount(progress) {
  return new Set((Array.isArray(progress?.completed) ? progress.completed : [])
    .filter(id => Number.isInteger(id) && id >= 0 && id < 21)).size;
}

export function unlockedCostumes(progress) {
  const count = completedLessonCount(progress);
  return COSTUMES.filter(costume => count >= costume.lessons);
}

export function selectedCostume(progress) {
  const saved = getSession('avatar')?.costume;
  return unlockedCostumes(progress).find(costume => costume.id === saved) || COSTUMES[0];
}

export function equipCostume(id, progress) {
  const costume = unlockedCostumes(progress).find(item => item.id === id);
  if (!costume) return false;
  saveSession('avatar', { costume: costume.id });
  return true;
}

/** A blank-faced bust, with one simple outfit at a time. No external assets. */
export function avatarSvg(id = 'grey', decorative = false) {
  const costume = COSTUMES.find(item => item.id === id) || COSTUMES[0];
  const body = { hoodie: '#43866b', explorer: '#b69161', graduate: '#475569' }[costume.id] || '#9ca3af';
  const clothes = {
    grey: '',
    scarf: '<path d="M38 49Q60 58 82 49v10Q60 68 38 59z" fill="#5994d0"/><path d="M68 57h11v27H68z" fill="#5994d0"/>',
    hoodie: '<path d="M42 50Q60 63 78 50" fill="none" stroke="#c1ddd0" stroke-width="3"/><path d="M55 57v16m10-16v16" stroke="#c1ddd0" stroke-width="2"/><rect x="47" y="83" width="26" height="9" rx="4" fill="#326950"/>',
    explorer: '<path d="M43 22q2-17 17-17t17 17" fill="#b69161"/><rect x="34" y="20" width="52" height="7" rx="3" fill="#967747"/><path d="M47 53v46m26-46v46" stroke="#705c41" stroke-width="3"/><rect x="48" y="70" width="9" height="10" rx="2" fill="#d3b78f"/>',
    graduate: '<path d="m60 9 29 11-29 11-29-11z" fill="#475569"/><path d="M42 24v9q18 8 36 0v-9" fill="#475569"/><path d="M86 21v21" stroke="#e1bd65" stroke-width="3"/><path d="M55 53h10l-5 17z" fill="#e1bd65"/>',
  }[costume.id];
  return `<svg class="figure-svg" xmlns="http://www.w3.org/2000/svg" viewBox="20 0 80 78" overflow="hidden" ${decorative ? 'aria-hidden="true"' : `role="img" aria-label="Your avatar: ${costume.name}"`}>
    <g stroke="#737b88" stroke-width="2" stroke-linejoin="round">
      <path d="M51 46h18v10l16 5q10 5 12 20v12H23V81q2-15 12-20l16-5z" fill="${body}"/>
      <circle cx="60" cy="32" r="21" fill="#b5bbc4"/>
    </g>
    ${clothes}
  </svg>`;
}

export function wardrobeHtml(progress) {
  const selected = selectedCostume(progress), count = completedLessonCount(progress);
  return `<section class="panel wardrobe" aria-labelledby="wardrobe-title">
    <div class="section-heading"><div><div class="eyebrow">YOUR FIGURE</div><h2 id="wardrobe-title">A little character. A little progress.</h2></div></div>
    <div class="wardrobe-layout"><div class="figure-preview">${avatarSvg(selected.id)}<strong>${selected.name}</strong><span>${count} / 21 lessons complete</span></div>
    <div><p>Start with a grey figure. Complete lessons to unlock simple costumes, then choose one to wear.</p>
    <div class="costume-grid">${COSTUMES.map(costume => {
      const unlocked = count >= costume.lessons, equipped = selected.id === costume.id;
      return `<button type="button" class="costume-card ${equipped ? 'equipped' : ''}" data-costume="${costume.id}" aria-pressed="${equipped}" ${unlocked ? '' : 'disabled'}>
        ${avatarSvg(costume.id, true)}<strong>${costume.name}</strong><small>${equipped ? 'Wearing' : unlocked ? 'Wear costume' : `Complete ${costume.lessons} lessons`}</small>
      </button>`;
    }).join('')}</div><p class="wardrobe-note">Outfits are cosmetic. Your choice saves in this browser for your current account.</p></div></div>
  </section>`;
}
