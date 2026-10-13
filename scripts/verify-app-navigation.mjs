/**
 * Lightweight verification of SPA route mapping + history dedupe rules.
 * Run: node scripts/verify-app-navigation.mjs
 */

import assert from 'node:assert/strict';

const TAB_PATHS = {
  home: '/',
  discovery: '/discovery',
  swipe: '/swipe',
  moments: '/moments',
  earnings: '/earnings',
  call_logs: '/call-logs',
  profile: '/profile',
  team_leader: '/agency',
  admin: '/admin',
  server_setup: '/server-setup',
};

function normalizePath(pathname) {
  if (!pathname) return '/';
  const trimmed = pathname.split('?')[0].split('#')[0];
  if (trimmed.length > 1 && trimmed.endsWith('/')) {
    return trimmed.slice(0, -1) || '/';
  }
  return trimmed || '/';
}

const PATH_TO_TAB = Object.entries(TAB_PATHS).reduce((acc, [tab, path]) => {
  acc[normalizePath(path)] = tab;
  return acc;
}, {});

function tabToPath(tab) {
  return TAB_PATHS[tab] ?? TAB_PATHS.home;
}

function pathToTab(pathname) {
  return PATH_TO_TAB[normalizePath(pathname)] ?? 'home';
}

/** Minimal History API mock for loop / dedupe checks */
function createHistoryMock(initialPath = '/') {
  const stack = [{ path: initialPath, state: { __mingleNav: true, tab: pathToTab(initialPath), idx: 0 } }];
  let index = 0;
  const listeners = [];

  return {
    get pathname() {
      return stack[index].path;
    },
    get state() {
      return stack[index].state;
    },
    get length() {
      return stack.length;
    },
    pushState(state, _title, path) {
      stack.splice(index + 1);
      stack.push({ path: normalizePath(path), state });
      index = stack.length - 1;
    },
    replaceState(state, _title, path) {
      stack[index] = { path: normalizePath(path), state };
    },
    back() {
      if (index <= 0) return false;
      index -= 1;
      listeners.forEach((fn) => fn({ state: stack[index].state }));
      return true;
    },
    onPopState(fn) {
      listeners.push(fn);
    },
    snapshot() {
      return stack.map((e) => `${e.path}#${e.state.tab}@${e.state.idx}`);
    },
  };
}

function navigate(history, currentTabRef, tab, { replace = false } = {}) {
  const path = tabToPath(tab);
  const sameTab = tab === currentTabRef.value;
  const sameUrl = normalizePath(history.pathname) === normalizePath(path);
  if (sameTab && sameUrl && !replace) return currentTabRef.value;

  const idx = replace
    ? history.state?.idx ?? 0
    : (history.state?.idx ?? 0) + (sameTab ? 0 : 1);

  const state = { __mingleNav: true, tab, idx };
  if (replace || sameTab) history.replaceState(state, '', path);
  else history.pushState(state, '', path);
  currentTabRef.value = tab;
  return tab;
}

// --- Route map ---
assert.equal(pathToTab('/discovery'), 'discovery');
assert.equal(pathToTab('/call-logs'), 'call_logs');
assert.equal(pathToTab('/agency'), 'team_leader');
assert.equal(pathToTab('/unknown-deep'), 'home');
assert.equal(tabToPath('swipe'), '/swipe');
assert.equal(normalizePath('/discovery/'), '/discovery');

// --- History: Home → Discovery → Swipe → Back×3 exits stack ---
{
  const h = createHistoryMock('/');
  const tab = { value: 'home' };
  navigate(h, tab, 'discovery');
  navigate(h, tab, 'swipe');
  assert.equal(h.length, 3);
  assert.equal(tab.value, 'swipe');

  h.onPopState((e) => {
    tab.value = e.state.tab;
  });
  assert.equal(h.back(), true);
  assert.equal(tab.value, 'discovery');
  assert.equal(h.back(), true);
  assert.equal(tab.value, 'home');
  assert.equal(h.back(), false); // at entry — allow exit
}

// --- Same tab repeated taps must not grow history ---
{
  const h = createHistoryMock('/');
  const tab = { value: 'home' };
  navigate(h, tab, 'discovery');
  navigate(h, tab, 'discovery');
  navigate(h, tab, 'discovery');
  assert.equal(h.length, 2);
  assert.deepEqual(h.snapshot(), ['/#home@0', '/discovery#discovery@1']);
}

// --- Auth-style replace must not add entries ---
{
  const h = createHistoryMock('/admin');
  const tab = { value: 'admin' };
  navigate(h, tab, 'home', { replace: true });
  assert.equal(h.length, 1);
  assert.equal(h.pathname, '/');
  assert.equal(tab.value, 'home');
}

console.log('verify-app-navigation: OK');
console.log('  routes, back stack, same-tab dedupe, replace redirect — passed');
