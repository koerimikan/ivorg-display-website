import { ISSUES } from '../lib/data.js';
import { buildReader as renderReader } from '../lib/reader-contract.js';
const buildReader = (issue, index) => renderReader(issue, index, ISSUES);

export function mountNewsletter(root = document) {
  const editorial = root.querySelector('#editorial');
  const readerBody = root.querySelector('#reader-body');
  const readerPosition = root.querySelector('#reader-position');
  const themeToggle = root.querySelector('#theme-toggle');
  const issueList = root.querySelector('#issue-list');
  const issueButtons = issueList ? Array.from(issueList.querySelectorAll('[data-issue]')) : [];
  if (!editorial || !readerBody || !readerPosition || !themeToggle || issueButtons.length === 0) {
    return () => {};
  }

  const controller = new AbortController();
  const { signal } = controller;
  const themeLabel = themeToggle.querySelector('[data-theme-label]');
  let night = editorial.classList.contains('night');

  function issueFromQuery() {
    const value = new URLSearchParams(window.location.search).get('issue');
    if (!value) {
      const pressed = issueButtons.find((button) => button.getAttribute('aria-pressed') === 'true');
      return pressed ? Number(pressed.dataset.issue) : 0;
    }
    const normalized = value.padStart(2, '0');
    const found = ISSUES.findIndex((issue) => issue.number === value || issue.number === normalized);
    return found === -1 ? 0 : found;
  }

  function syncIssueQuery(issue) {
    const url = new URL(window.location.href);
    if (url.searchParams.get('issue') === issue.number) return;
    url.searchParams.set('issue', issue.number);
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }

  function applyTheme() {
    editorial.classList.toggle('night', night);
    themeToggle.setAttribute('aria-pressed', night ? 'true' : 'false');
    themeToggle.setAttribute('aria-label', night ? 'Switch to paper mode' : 'Switch to night mode');
    if (themeLabel) themeLabel.textContent = night ? 'PAPER MODE' : 'NIGHT MODE';
  }

  function renderIssue(index) {
    if (!Number.isInteger(index) || index < 0 || index >= ISSUES.length) return;
    const issue = ISSUES[index];
    readerBody.replaceChildren(buildReader(issue, index));
    issueButtons.forEach((button) => {
      const isActive = Number(button.dataset.issue) === index;
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
    readerPosition.textContent = `ISSUE #${issue.number} / READING ROOM`;
    syncIssueQuery(issue);
    window.dispatchEvent(new Event('ivorg:layout'));
  }

  function handleClick(event) {
    if (!(event.target instanceof Element)) return;
    const issueButton = event.target.closest('[data-issue]');
    if (issueButton && root.contains(issueButton)) {
      event.preventDefault();
      renderIssue(Number(issueButton.dataset.issue));
      return;
    }
    const nextButton = event.target.closest('[data-next]');
    if (nextButton && root.contains(nextButton)) {
      event.preventDefault();
      renderIssue(Number(nextButton.dataset.next));
    }
  }

  applyTheme();
  root.addEventListener('click', handleClick, { signal });
  themeToggle.addEventListener('click', () => {
    night = !night;
    applyTheme();
  }, { signal });
  renderIssue(issueFromQuery());

  return () => controller.abort();
}
