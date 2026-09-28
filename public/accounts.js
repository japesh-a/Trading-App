import { serviceConfig } from './market-data.js';
import { setAccountScope, recordTrade } from './trade-store.js';

export async function initializeAccounts() {
  const button = document.getElementById('account-button');
  const dialog = document.getElementById('account-dialog');
  const content = document.getElementById('account-content');
  const config = await serviceConfig();
  let account = null, mode = 'login', available = Boolean(config.apiBase), statusMessage = '';
  const call = async (path, body) => {
    const response = await fetch(config.apiBase + '/api/trading/auth/' + path, {
      method: body ? 'POST' : 'GET', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000),
    });
    const value = await response.json();
    if (!response.ok) throw Error(value.error || 'Unable to connect to your account.');
    return value;
  };
  if (available) {
    try { account = (await call('me')).account; }
    catch (error) { statusMessage = error.message; }
  }
  setAccountScope(account?.id);
  if (account) {
    try {
      const response = await fetch(config.apiBase + '/api/trading/journal', { credentials: 'include', signal: AbortSignal.timeout(15000) });
      if (response.ok) for (const trade of (await response.json()).trades) recordTrade(trade);
    } catch { /* The saved browser journal remains available when offline. */ }
  }
  button.textContent = account ? 'Account' : 'Sign in';
  const profile = document.querySelector('.local-profile');
  profile.querySelector('b').textContent = account?.displayName || 'Guest practice';
  profile.querySelector('small').textContent = account ? 'Signed in · Paper money' : 'Saved on this browser';
  profile.querySelector('.avatar').textContent = account?.displayName?.slice(0, 1).toUpperCase() || 'W';
  const reload = () => {
    try { localStorage.setItem('wicklume-account-change', crypto.randomUUID()); } catch { /* Cookie login still works. */ }
    location.reload();
  };
  window.addEventListener('storage', event => { if (event.key === 'wicklume-account-change') location.reload(); });
  const render = () => {
    content.replaceChildren();
    if (!available) {
      content.innerHTML = '<p>Keep practising as a guest. Account sign-in will be available when the online service is connected.</p><p>Your current learning progress and journal are saved in this browser.</p>';
      return;
    }
    if (account) {
      content.innerHTML = '<p id="account-email"></p><p>Your learning progress and verified trades are saved to your account. Drawings and offline practice stay in this browser.</p><button class="btn" id="sign-out">Sign out</button><p class="error-message" role="alert" id="account-error"></p>';
      content.querySelector('#account-email').textContent = `Signed in as ${account.email}`;
      content.querySelector('#sign-out').onclick = async event => {
        event.target.disabled = true;
        try { await call('logout', {}); reload(); }
        catch (error) { content.querySelector('#account-error').textContent = error.message; event.target.disabled = false; }
      };
      return;
    }
    const register = mode === 'register';
    content.innerHTML = `<p>${register ? 'Create an account to keep your learning progress and verified trades across devices.' : 'Welcome back. Sign in to your learning and paper trading account.'}</p>
      <form id="account-form">
      ${register ? '<label>Display name<input name="displayName" autocomplete="nickname" maxlength="40" required></label>' : ''}
      <label>Email<input name="email" type="email" autocomplete="email" maxlength="254" required></label>
      <label>Password<input name="password" type="password" autocomplete="${register ? 'new-password' : 'current-password'}" minlength="12" maxlength="128" required></label>
      <p class="muted">${register ? 'Use at least 12 characters. Guest progress stays separate from your new account.' : 'Password reset is not available yet. Keep your password somewhere safe.'}</p>
      <p class="error-message" id="account-error" role="alert"></p>
      <button class="btn primary full" type="submit">${register ? 'Create account' : 'Sign in'}</button></form>
      <button class="link account-switch" id="account-switch">${register ? 'Already have an account? Sign in' : 'New here? Create an account'}</button>
      <button class="link" id="guest-continue">Continue as a guest</button>`;
    content.querySelector('#account-error').textContent = statusMessage;
    content.querySelector('#account-switch').onclick = () => { mode = register ? 'login' : 'register'; statusMessage = ''; render(); };
    content.querySelector('#guest-continue').onclick = async () => {
      try { await call('logout', {}); reload(); }
      catch (error) { content.querySelector('#account-error').textContent = error.message; }
    };
    content.querySelector('form').onsubmit = async event => {
      event.preventDefault();
      const form = event.currentTarget, submit = form.querySelector('[type="submit"]');
      submit.disabled = true;
      content.querySelector('#account-error').textContent = '';
      try {
        const result = await call(register ? 'register' : 'login', Object.fromEntries(new FormData(form)));
        const verified = (await call('me')).account;
        if (!verified || verified.id !== result.account.id) throw Error('Your browser could not save the login cookie. Enable cookies for this service and try again.');
        reload();
      } catch (error) { content.querySelector('#account-error').textContent = error.message; submit.disabled = false; }
    };
  };
  button.onclick = () => { render(); dialog.showModal(); };
  document.getElementById('account-close').onclick = () => dialog.close();
  dialog.addEventListener('click', event => { if (event.target === dialog && (event.offsetX < 0 || event.offsetY < 0 || event.offsetX > dialog.clientWidth || event.offsetY > dialog.clientHeight)) dialog.close(); });
}
