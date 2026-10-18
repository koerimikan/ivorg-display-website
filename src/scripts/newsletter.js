import { ISSUES } from '../lib/data.js';

const TABLE_HEADERS = ['PARAMETER', 'SETTING', 'INTENT'];

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function buildTable(section) {
  const table = document.createElement('table');
  table.className = 'technical-table';
  table.setAttribute('aria-label', `${section.title} — technical parameters`);
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  TABLE_HEADERS.forEach((label) => {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = label;
    headRow.append(th);
  });
  thead.append(headRow);
  const tbody = document.createElement('tbody');
  section.table.forEach((row) => {
    const tr = document.createElement('tr');
    row.forEach((cell) => {
      const td = document.createElement('td');
      td.textContent = cell;
      tr.append(td);
    });
    tbody.append(tr);
  });
  table.append(thead, tbody);
  return table;
}

function buildReader(issue, index) {
  const fragment = document.createDocumentFragment();
  const kicker = makeElement('div', 'reader-kicker');
  kicker.append(
    makeElement('span', 'micro', `ISSUE ${issue.number} / ${issue.date}`),
    makeElement('span', 'micro', issue.tag)
  );
  const title = makeElement('h2', '', issue.title);
  title.id = 'reader-title';
  fragment.append(kicker, title, makeElement('p', 'reader-deck', issue.deck));
  const quote = document.createElement('blockquote');
  quote.textContent = issue.quote;
  fragment.append(quote);
  issue.sections.forEach((section, sectionIndex) => {
    const sectionNode = document.createElement('section');
    sectionNode.className = 'article-section';
    const number = makeElement('span', 'micro', `${String(sectionIndex + 1).padStart(2, '0')} /`);
    const copy = document.createElement('div');
    copy.append(makeElement('h3', '', section.title));
    section.text.forEach((paragraph) => {
      copy.append(makeElement('p', '', paragraph));
    });
    if (Array.isArray(section.table) && section.table.length > 0) {
      copy.append(buildTable(section));
    }
    sectionNode.append(number, copy);
    fragment.append(sectionNode);
  });
  const nextIndex = (index + 1) % ISSUES.length;
  const nextIssue = ISSUES[nextIndex];
  const end = makeElement('footer', 'reader-end');
  end.append(makeElement('span', 'micro', `END OF ISSUE ${issue.number} / DEMO ARCHIVE`));
  const nextButton = document.createElement('button');
  nextButton.type = 'button';
  nextButton.dataset.next = String(nextIndex);
  nextButton.textContent = `NEXT: ISSUE ${nextIssue.number} ↗`;
  nextButton.setAttribute('aria-label', `阅读下一期：${nextIssue.title}`);
  end.append(nextButton);
  fragment.append(end);
  return fragment;
}

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
  let paper = editorial.classList.contains('paper');

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
    editorial.classList.toggle('paper', paper);
    themeToggle.setAttribute('aria-pressed', paper ? 'true' : 'false');
    themeToggle.setAttribute('aria-label', paper ? '切换至深色模式' : '切换至纸张模式');
    if (themeLabel) themeLabel.textContent = paper ? 'DARK MODE' : 'PAPER MODE';
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
    paper = !paper;
    applyTheme();
  }, { signal });
  renderIssue(issueFromQuery());

  return () => controller.abort();
}
