import { serviceConfig, setServiceAccount, requestService } from './market-data.js';
import { setAccountScope, recordTrade, saveAccount } from './trade-store.js';

let currentAccount = null;
let googleScriptRequest;
function loadGoogleScript() {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (!googleScriptRequest) googleScriptRequest = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(Error('Google sign in could not load. Please try again later.'));
    document.head.append(script);
  }).catch(error => { googleScriptRequest = null; throw error; });
  return googleScriptRequest;
}
export const getCurrentAccount = () => currentAccount;
export async function saveDisplayName(value) {
  const displayName = String(value || '').trim();
  if (!displayName || displayName.length > 40 || /[\u0000-\u001f\u007f]/.test(displayName)) throw Error('Enter a display name between 1 and 40 characters.');
  const config = await serviceConfig();
  if (config.apiBase) await requestService('/profile', { displayName });
  saveAccount({ displayName });
  if (currentAccount) currentAccount.displayName = displayName;
  window.dispatchEvent(new CustomEvent('wicklume:profile', { detail: { displayName } }));
  return displayName;
}

export async function initializeAccounts() {
  const button = document.getElementById('account-button');
  const dialog = document.getElementById('account-dialog');
  const content = document.getElementById('account-content');
  const config = await serviceConfig();
  let account = null, mode = 'login', available = Boolean(config.apiBase), statusMessage = '', googleClientId = '';
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
    try {
      const response = await fetch(config.apiBase + '/api/trading/config', { credentials: 'include', signal: AbortSignal.timeout(15000) });
      if (response.ok) googleClientId = String((await response.json()).googleClientId || '');
    } catch { /* Email sign in remains available when config cannot be read. */ }
  }
  setAccountScope(account?.id);
  currentAccount = account;
  setServiceAccount(account);
  if (account) saveAccount({ displayName: account.displayName });
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
  window.addEventListener('wicklume:profile', event => {
    profile.querySelector('b').textContent = event.detail.displayName;
    if (!profile.querySelector('.avatar').classList.contains('figure-badge')) profile.querySelector('.avatar').textContent = event.detail.displayName.slice(0, 1).toUpperCase();
  });
  const reload = () => {
    try { localStorage.setItem('wicklume-account-change', crypto.randomUUID()); } catch { /* Cookie login still works. */ }
    location.reload();
  };
  window.addEventListener('storage', event => { if (event.key === 'wicklume-account-change') location.reload(); });
  const showGoogle = async (link = false) => {
    const slot = content.querySelector('#google-signin');
    if (!slot || !googleClientId) return;
    try {
      await loadGoogleScript();
      if (!slot.isConnected) return;
      window.google.accounts.id.initialize({ client_id: googleClientId, callback: async response => {
        const error = content.querySelector('#account-error');
        if (error) error.textContent = '';
        try {
          const result = await call('google', { credential: response.credential, link });
          if (link) { account = result.account; currentAccount = account; render(); return; }
          const verified = (await call('me')).account;
          if (!verified || verified.id !== result.account.id) throw Error('Your browser could not save the login cookie. Enable cookies for this service and try again.');
          reload();
        } catch (problem) { if (error) error.textContent = problem.message; }
      }});
      window.google.accounts.id.renderButton(slot, { theme: document.documentElement.dataset.theme === 'light' ? 'outline' : 'filled_black', size: 'large', text: link ? 'continue_with' : 'signin_with', width: Math.min(300, slot.clientWidth || 300) });
    } catch (error) { if (slot.isConnected) slot.textContent = error.message; }
  };
  const render = () => {
    content.replaceChildren();
    if (!available) {
      content.innerHTML = '<p>Keep practising as a guest. Account sign-in will be available when the online service is connected.</p><p>Your current learning progress and journal are saved in this browser.</p>';
      return;
    }
    if (account) {
      content.innerHTML = `<p id="account-email"></p><p>Your learning progress and verified trades are saved to your account. Drawings and offline practice stay in this browser.</p>
        <form id="profile-form"><label>Display name<input name="displayName" autocomplete="nickname" maxlength="40" required></label><button class="btn" type="submit">Save display name</button><p role="status" id="profile-status"></p></form>
        ${account.hasPassword === false ? '' : `<details class="password-settings"><summary>Change password</summary><form id="password-form">
        <label>Current password<input name="currentPassword" type="password" autocomplete="current-password" maxlength="128" required></label>
        <label>New password<input name="newPassword" type="password" autocomplete="new-password" minlength="12" maxlength="128" required></label>
        <label>Confirm new password<input name="confirmPassword" type="password" autocomplete="new-password" minlength="12" maxlength="128" required></label>
        <p class="muted">Use at least 12 characters. Changing your password signs out your other devices.</p><button class="btn" type="submit">Update password</button><p role="alert" class="error-message" id="password-error"></p></form></details>`}
        ${googleClientId && !account.googleLinked ? '<div class="google-account"><p>Link Google to sign in without a password next time.</p><div id="google-signin"></div></div>' : account.googleLinked ? '<p>Google sign in is linked to this account.</p>' : ''}
        <button class="btn" id="sign-out">Sign out</button><p class="error-message" role="alert" id="account-error"></p>`;
      content.querySelector('#account-email').textContent = `Signed in as ${account.email}`;
      content.querySelector('[name="displayName"]').value = account.displayName;
      content.querySelector('#profile-form').onsubmit = async event => {
        event.preventDefault();
        const submit = event.currentTarget.querySelector('button'); submit.disabled = true;
        try { account.displayName = await saveDisplayName(content.querySelector('[name="displayName"]').value); content.querySelector('#profile-status').textContent = 'Display name saved.'; }
        catch (error) { content.querySelector('#profile-status').textContent = error.message; }
        finally { submit.disabled = false; }
      };
      if (account.hasPassword !== false) content.querySelector('#password-form').onsubmit = async event => {
        event.preventDefault();
        const values = Object.fromEntries(new FormData(event.currentTarget));
        const errorElement = content.querySelector('#password-error');
        if (values.newPassword !== values.confirmPassword) { errorElement.textContent = 'The new passwords do not match.'; return; }
        const submit = event.currentTarget.querySelector('button'); submit.disabled = true;
        errorElement.textContent = '';
        try { await call('password', { currentPassword: values.currentPassword, newPassword: values.newPassword }); reload(); }
        catch (error) { errorElement.textContent = error.message; submit.disabled = false; }
      };
      showGoogle(true);
      content.querySelector('#sign-out').onclick = async event => {
        event.target.disabled = true;
        try { await call('logout', {}); reload(); }
        catch (error) { content.querySelector('#account-error').textContent = error.message; event.target.disabled = false; }
      };
      return;
    }
    const register = mode === 'register';
    content.innerHTML = `<p>${register ? 'Create an account to keep your learning progress and verified trades across devices.' : 'Welcome back. Sign in to your learning and paper trading account.'}</p>
      ${googleClientId ? '<div class="google-account"><div id="google-signin"></div><p>Or use your email and password below.</p></div>' : ''}
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
    showGoogle();
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
