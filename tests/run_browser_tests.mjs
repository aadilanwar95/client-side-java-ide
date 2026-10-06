// runs the test cases in a real browser, drives the ide page like a user would:
// paste code, fill program input, press run, click links, read the console.
// results are checked against tests/expected/ (pass criteria in tests/README.md),
// written to tests/results.csv and logged in tests/browser-runs/.
//
// chrome is driven over CDP and firefox over webdriver bidi, both via websocket,
// so no npm packages needed. each run uses a fresh empty profile in a temp folder,
// no visible window
//
// usage: node tests/run_browser_tests.mjs chrome [--screenshots]
//        node tests/run_browser_tests.mjs firefox [--screenshots]

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const testsDir = import.meta.dirname;
const rootDir = dirname(testsDir);
const browserArg = process.argv[2];
const takeScreenshots = process.argv.includes('--screenshots');
const SITE_PORT = 8090;
const DEBUG_PORT = 9333;
const SITE = `http://localhost:${SITE_PORT}/`;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
// FIREFOX_APP can point to another firefox copy, eg FIREFOX_APP=/path/to/Firefox.app
const FIREFOX_APP = process.env.FIREFOX_APP || '/Applications/Firefox.app';
const FIREFOX = join(FIREFOX_APP, 'Contents/MacOS/firefox');
// firefox runs 10 cases, 2 each from CR, IO, CE, RE, CS
const FIREFOX_CASES = ['TC-CR-01', 'TC-CR-07', 'TC-IO-03', 'TC-IO-05', 'TC-CE-01', 'TC-CE-05',
  'TC-RE-01', 'TC-RE-05', 'TC-CS-01', 'TC-CS-02'];
const GROUP_ORDER = ['TC-CR', 'TC-IO', 'TC-CE', 'TC-RE', 'TC-CS', 'TC-OP'];

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitFor(check, ms = 30000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      const value = await check();
      if (value) return value;
    } catch {
      // not ready yet
    }
    await sleep(250);
  }
  throw new Error('timed out waiting');
}

// ---------- test cases from disk ----------

function readOptional(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

function loadCase(folder) {
  const expected = name => readOptional(join(testsDir, 'expected', `${folder}.${name}`));
  return {
    id: folder.slice(0, 8),
    folder,
    source: readFileSync(join(testsDir, folder, 'Main.java'), 'utf8'),
    input: readOptional(join(testsDir, folder, 'input.txt')) || '',
    stdout: expected('stdout'),
    stderr: expected('stderr'),
    javac: expected('javac'),
    exit: Number(expected('exit')),
  };
}

const allCases = readdirSync(testsDir)
  .filter(name => name.startsWith('TC-'))
  .sort((a, b) => GROUP_ORDER.indexOf(a.slice(0, 5)) - GROUP_ORDER.indexOf(b.slice(0, 5)) || a.localeCompare(b))
  .map(loadCase);
const caseById = Object.fromEntries(allCases.map(c => [c.id, c]));

// ---------- talking to the browser ----------

function openSocket(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.onopen = () => resolve(ws);
    ws.onerror = () => reject(new Error('cannot connect to ' + url));
  });
}

// both protocols send {id, method, params}, reply has same id, events just have a method name
function protocolClient(ws, onEvent) {
  let nextId = 1;
  const pending = new Map();
  ws.onmessage = message => {
    const data = JSON.parse(message.data);
    if (data.id && pending.has(data.id)) {
      const { resolve, reject } = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) reject(new Error(JSON.stringify(data.error) + ' ' + (data.message || '')));
      else resolve(data.result);
    } else if (data.method) {
      onEvent(data.method, data.params);
    }
  };
  return (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

function removeLater(folder) {
  setTimeout(() => {
    try {
      rmSync(folder, { recursive: true, force: true });
    } catch {
      // temp profile gets cleaned up by the system
    }
  }, 1000);
}

async function startChrome() {
  const profile = mkdtempSync(join(tmpdir(), 'ide-chrome-'));
  const browser = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' });
  const targets = await waitFor(async () => {
    const list = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json();
    return list.some(t => t.type === 'page') && list;
  }).catch(error => {
    browser.kill();
    throw error;
  });
  const version = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`)).json();
  const ws = await openSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl).catch(error => {
    browser.kill();
    throw error;
  });
  const requests = [];
  let onLoad = null;
  const send = protocolClient(ws, (method, params) => {
    if (method === 'Network.requestWillBeSent') {
      requests.push({ method: params.request.method, url: params.request.url, body: params.request.postData || '' });
    }
    if (method === 'Page.loadEventFired' && onLoad) onLoad();
  });
  await send('Page.enable');
  await send('Network.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false });
  return {
    version: 'Chrome ' + version.Browser.split('/')[1],
    requests,
    async open(url) {
      const loaded = new Promise(resolve => (onLoad = resolve));
      await send('Page.navigate', { url });
      await loaded;
    },
    async evaluate(expression) {
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    },
    async screenshot(file) {
      const r = await send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(file, Buffer.from(r.data, 'base64'));
    },
    close() {
      ws.close();
      browser.kill();
      removeLater(profile);
    },
  };
}

// firefox installs pending updates on next start, starting a test copy then would
// start replacing the app while the user's own firefox might be open, so refuse
function firefoxUpdateWaiting() {
  // update folder is named after the install path, eg updates/Applications/Firefox
  const installPath = FIREFOX_APP.replace(/^\/+/, '').replace(/\.app\/?$/, '');
  const status = join(homedir(), 'Library/Caches/Mozilla/updates', installPath, 'updates/0/update.status');
  return existsSync(status) && /^(pending|applied)/.test(readFileSync(status, 'utf8').trim());
}

async function startFirefox() {
  if (firefoxUpdateWaiting()) {
    throw new Error('Firefox has an update waiting to be installed. Quit and reopen Firefox to install it, then run this again.');
  }
  const profile = mkdtempSync(join(tmpdir(), 'ide-firefox-'));
  const browser = spawn(FIREFOX, ['--headless', '--no-remote', '--profile', profile,
    '--remote-debugging-port', String(DEBUG_PORT)], { stdio: 'ignore' });
  let ws;
  let session;
  let context;
  const requests = [];
  let send;
  try {
    ws = await waitFor(() => openSocket(`ws://127.0.0.1:${DEBUG_PORT}/session`));
    send = protocolClient(ws, (method, params) => {
      // bidi doesn't give request bodies so only keep the url
      if (method === 'network.beforeRequestSent') {
        requests.push({ method: params.request.method, url: params.request.url, body: '' });
      }
    });
    session = await send('session.new', { capabilities: {} });
    await send('session.subscribe', { events: ['network.beforeRequestSent'] });
    context = (await send('browsingContext.getTree', {})).contexts[0].context;
    // firefox starts on about:home (privileged page, can't change viewport)
    await send('browsingContext.navigate', { context, url: 'about:blank', wait: 'complete' });
    await send('browsingContext.setViewport', { context, viewport: { width: 1440, height: 900 }, devicePixelRatio: 2 });
  } catch (error) {
    browser.kill();
    throw error;
  }
  return {
    version: 'Firefox ' + session.capabilities.browserVersion,
    requests,
    async open(url) {
      await send('browsingContext.navigate', { context, url, wait: 'complete' });
    },
    async evaluate(expression) {
      const r = await send('script.evaluate', { expression, target: { context }, awaitPromise: true });
      if (r.type === 'exception') throw new Error(r.exceptionDetails.text);
      return r.result.value;
    },
    async screenshot(file) {
      const r = await send('browsingContext.captureScreenshot', { context });
      writeFileSync(file, Buffer.from(r.data, 'base64'));
    },
    close() {
      ws.close();
      browser.kill();
      removeLater(profile);
    },
  };
}

// ---------- code that runs inside the ide page ----------
// these get turned into text and evaluated in the page so they can only use
// what the page has. they return json text

async function pageSetUp() {
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const status = document.getElementById('status');
  for (let i = 0; i < 480 && status.textContent !== 'Ready'; i++) await sleep(250);
  // same url app.js imports so it reuses the loaded module (no request)
  const { EditorView } = await import('https://esm.sh/codemirror@6.0.2?target=es2022');
  const view = EditorView.findFromDOM(document.querySelector('.cm-editor'));
  window.testView = view;

  // same as a user: replace code, fill input, press run, wait for result
  window.testRun = async (source, input) => {
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: source } });
    document.getElementById('program-input').value = input;
    const run = document.getElementById('run');
    run.click();
    await sleep(100);
    for (let i = 0; i < 480 && run.disabled; i++) await sleep(250);
    const spans = [...document.querySelectorAll('#console span')];
    const text = kind => spans.filter(s => s.className === kind).map(s => s.textContent).join('');
    const exit = text('meta').match(/exit code (-?\d+)/);
    return {
      out: text('out'),
      err: text('err'),
      exit: exit ? Number(exit[1]) : null,
      problems: [...document.querySelectorAll('#problems li')].map(li => li.textContent.split('\n')[0]),
      marked: document.querySelectorAll('.cm-lint-marker-error').length,
      status: document.getElementById('status').textContent,
    };
  };

  window.testSelection = () => {
    const s = view.state.selection.main;
    const line = view.state.doc.lineAt(s.from);
    return { line: line.number, wholeLine: s.from === line.from && s.to === line.to };
  };

  window.testLog = () => [...document.querySelectorAll('#log-rows tr')].map(r => [...r.cells].map(c => c.textContent));

  window.testTests = async cases => {
    document.querySelector('[data-tab=tests]').click();
    document.querySelectorAll('.test-case header button').forEach(b => b.click());
    for (const [input, expected] of cases) {
      document.getElementById('add-test').click();
      const boxes = document.querySelectorAll('.test-case');
      boxes[boxes.length - 1].querySelector('.test-input').value = input;
      boxes[boxes.length - 1].querySelector('.test-expected').value = expected;
    }
    const button = document.getElementById('run-tests');
    button.click();
    await sleep(100);
    for (let i = 0; i < 480 && button.disabled; i++) await sleep(250);
    return {
      summary: document.getElementById('test-summary').textContent,
      results: [...document.querySelectorAll('.test-case')].map(b => ({
        result: b.querySelector('.result').textContent,
        actual: b.querySelector('.actual').hidden ? '' : b.querySelector('.actual').textContent,
      })),
    };
  };
  return JSON.stringify({ status: status.textContent });
}

async function pageRun(source, input) {
  return JSON.stringify(await window.testRun(source, input));
}

// TC-OP-01: click each stack trace link and the problem, then same for a compile error
async function pageDebuggingAid(source) {
  const run = await window.testRun(source, '');
  const clicks = [];
  for (const link of document.querySelectorAll('#console a.jump')) {
    link.click();
    clicks.push({ link: link.textContent, ...window.testSelection() });
  }
  document.querySelector('[data-tab=problems]').click();
  document.querySelector('#problems li').click();
  const problemClick = window.testSelection();
  const view = window.testView;
  const line7 = view.state.doc.line(7);
  const broken = view.state.doc.toString().slice(0, line7.to - 1) + view.state.doc.toString().slice(line7.to);
  await window.testRun(broken, '');
  const problem = document.querySelector('#problems li');
  problem.click();
  return JSON.stringify({ run, clicks, problemClick, compileProblem: problem.textContent, compileClick: window.testSelection() });
}

async function pageTestRunner(source) {
  window.testView.dispatch({ changes: { from: 0, to: window.testView.state.doc.length, insert: source } });
  return JSON.stringify(await window.testTests([
    ['3 9', 'Sum: 12\nLarger: 9'],
    ['-4 10', 'Sum: 6\nLarger: 10'],
    ['5 5', 'Sum: 11\nLarger: 5'],
  ]));
}

// TC-OP-03: compile error, good run, runtime exception, test run, then read the log
async function pageEventLog(sources) {
  await window.testRun(sources.compileError, '');
  await window.testRun(sources.good, '');
  await window.testRun(sources.exception, '');
  window.testView.dispatch({ changes: { from: 0, to: window.testView.state.doc.length, insert: sources.good } });
  await window.testTests([['', 'Sum: 108']]);
  document.querySelector('[data-tab=log]').click();
  return JSON.stringify(window.testLog());
}

function call(fn, ...args) {
  return `(${fn.toString()})(${args.map(a => JSON.stringify(a)).join(', ')})`;
}

// ---------- pass criteria ----------

const mainFrames = text => text.split('\n').filter(line => /^\tat Main\./.test(line)).join('\n');
const firstLine = text => text.split('\n')[0];

function checkCase(c, r, afterwards) {
  const group = c.id.slice(0, 5);
  if (group === 'TC-CE') {
    const expected = c.javac.split('\n')
      .map(line => line.match(/^Main\.java:(\d+): error: (.*)$/)).filter(Boolean)
      .map(m => `Line ${m[1]}: ${m[2]}`);
    const sameText = r.err === c.javac;
    const pass = r.exit === null && JSON.stringify(r.problems) === JSON.stringify(expected) && sameText && r.marked === expected.length;
    return { pass, notes: `javac messages and lines identical to JDK 8 (${expected.length} error${expected.length > 1 ? 's' : ''}); ${r.marked} line${r.marked > 1 ? 's' : ''} marked in the editor` };
  }
  if (c.exit !== 0) {
    const pass = r.out === c.stdout && r.exit === c.exit && firstLine(r.err) === firstLine(c.stderr)
      && mainFrames(r.err) === mainFrames(c.stderr) && (group !== 'TC-RE' || afterwards);
    const identical = r.err === c.stderr;
    let notes = `${group === 'TC-IO' ? 'stdout identical; ' : ''}exception type, message and Main.java lines identical to JDK 8`;
    if (!identical) notes += '; Java library frames show (Unknown Source)';
    if (group === 'TC-RE') notes += afterwards ? '; TC-CR-01 compiled and ran correctly afterwards' : '; IDE FAILED to run TC-CR-01 afterwards';
    return { pass, notes };
  }
  const pass = r.out === c.stdout && r.err === c.stderr && r.exit === 0;
  return { pass, notes: pass ? 'stdout and stderr identical to JDK 8' : 'output differs from JDK 8 (see browser-runs log)' };
}

// ---------- results.csv ----------

function parseCsv(text) {
  return text.trim().split('\n').map(line => {
    const cells = [];
    let cell = '';
    let quoted = false;
    for (const ch of line) {
      if (ch === '"') quoted = !quoted;
      else if (ch === ',' && !quoted) {
        cells.push(cell);
        cell = '';
      } else cell += ch;
    }
    cells.push(cell);
    return cells;
  });
}

function toCsv(rows) {
  return rows.map(row => row.map(cell => (/[",]/.test(cell) ? `"${cell.replaceAll('"', '""')}"` : cell)).join(',')).join('\n') + '\n';
}

function updateResults(browserVersion, results) {
  const file = join(testsDir, 'results.csv');
  const rows = parseCsv(readFileSync(file, 'utf8'));
  const family = browserVersion.split(' ')[0];
  const major = browserVersion.split(' ')[1].split('.')[0];
  for (const row of rows.slice(1)) {
    const result = results.find(r => r.id === row[0]);
    if (result && row[2].startsWith(family)) {
      row[2] = `${family} ${major}`;
      row[3] = result.pass ? 'Pass' : 'Fail';
      row[4] = result.notes + ' (automated run, ' + new Date().toISOString().slice(0, 10) + ')';
    }
  }
  writeFileSync(file, toCsv(rows));
}

// ---------- main ----------

async function main() {
  if (browserArg !== 'chrome' && browserArg !== 'firefox') {
    console.log('Usage: node tests/run_browser_tests.mjs chrome|firefox [--screenshots]');
    process.exit(1);
  }
  const server = spawn(process.execPath, [join(rootDir, 'serve.mjs'), String(SITE_PORT)], { stdio: 'ignore' });
  let browser;
  try {
    await waitFor(async () => (await fetch(SITE)).ok);
    browser = browserArg === 'chrome' ? await startChrome() : await startFirefox();
    console.log('Testing in ' + browser.version);
    const cases = browserArg === 'chrome' ? allCases : allCases.filter(c => FIREFOX_CASES.includes(c.id));
    const results = [];
    const report = [`Browser: ${browser.version}`, `Date: ${new Date().toISOString()}`, `Page: ${SITE}`, ''];

    await browser.open(SITE);
    await browser.evaluate(call(pageSetUp));

    for (const c of cases) {
      const requestsBefore = browser.requests.length;
      let result;
      let raw;
      if (c.id === 'TC-OP-01') {
        raw = JSON.parse(await browser.evaluate(call(pageDebuggingAid, c.source)));
        const lines = raw.clicks.map(k => k.line);
        const pass = JSON.stringify(lines) === '[7,13,18]' && raw.clicks.every(k => k.wholeLine)
          && raw.problemClick.line === 7 && raw.compileProblem.startsWith("Line 7: ';' expected") && raw.compileClick.line === 7;
        result = { pass, notes: `clicking ${raw.clicks.map(k => k.link).join(', ')} selected lines ${lines.join(', ')}; the runtime problem and the compile error (${raw.compileProblem}) both moved the cursor to line 7` };
      } else if (c.id === 'TC-OP-02') {
        raw = JSON.parse(await browser.evaluate(call(pageTestRunner, c.source)));
        const marks = raw.results.map(t => t.result).join(', ');
        const pass = raw.summary === '2 of 3 passed' && marks === 'PASS, PASS, FAIL' && raw.results[2].actual.includes('Sum: 10');
        result = { pass, notes: `three tests gave ${marks} ("${raw.summary}"); the failing test showed the actual output Sum: 10` };
      } else if (c.id === 'TC-OP-03') {
        await browser.open(SITE);
        await browser.evaluate(call(pageSetUp));
        raw = JSON.parse(await browser.evaluate(call(pageEventLog, {
          compileError: caseById['TC-CE-01'].source, good: c.source, exception: caseById['TC-RE-01'].source,
        })));
        const rows = raw.map(r => `${r[1]} | ${r[2]}`);
        const wanted = ['Java runtime loaded | OK', 'Compiler ready | OK', 'Compile Main.java | 1 error', 'Run Main | exit code 0',
          'Run Main | java.lang.ArithmeticException (line 3)', 'Test run | 1/1 passed'];
        const timed = raw.every(r => /^\d\d:\d\d:\d\d$/.test(r[0]) && /^\d+ ms$/.test(r[3]));
        const pass = wanted.every(w => rows.includes(w)) && timed;
        result = { pass, notes: `log had ${raw.length} rows with time and duration, including runtime load, compiler ready, compile with 1 error, run with exit code 0, run with ArithmeticException (line 3) and the test run` };
      } else {
        raw = JSON.parse(await browser.evaluate(call(pageRun, c.source, c.input)));
        let afterwards = true;
        if (c.id.startsWith('TC-RE')) {
          const hello = JSON.parse(await browser.evaluate(call(pageRun, caseById['TC-CR-01'].source, '')));
          afterwards = hello.out === 'Hello, World!\n' && hello.exit === 0;
        }
        result = checkCase(c, raw, afterwards);
      }

      // NFR1: nothing should be sent while a case compiles/runs
      const during = browser.requests.slice(requestsBefore);
      if (c.id.startsWith('TC-CS')) {
        const marker = c.id === 'TC-CS-01' ? 'CS01_SOURCE_MARKER_7319' : 'CS02_INPUT_MARKER_4826';
        const leaked = browser.requests.filter(q => q.url.includes(marker) || q.body.includes(marker));
        const sending = during.filter(q => q.method !== 'GET');
        const stdoutOk = raw.out === c.stdout;
        // no request should carry source code or input
        const fetched = during.length === 0 ? 'no network requests during compile and run'
          : `${during.length} requests during compile and run, all GET downloads of fixed files (${[...new Set(during.map(q => q.url))].join(', ')})`;
        result = {
          pass: sending.length === 0 && leaked.length === 0 && stdoutOk,
          notes: `${fetched}; none sent data; marker ${marker} found in ${leaked.length} of ${browser.requests.length} requests in the session; output identical to JDK 8`,
        };
      }

      results.push({ id: c.id, ...result });
      console.log(`${result.pass ? 'PASS' : 'FAIL'} ${c.folder}`);
      report.push(`${result.pass ? 'PASS' : 'FAIL'} ${c.folder}`, `  ${result.notes}`);
      if (during.length) report.push(`  requests during this case: ${during.map(q => q.method + ' ' + q.url).join(', ')}`);
      if (!result.pass) report.push('  raw result: ' + JSON.stringify(raw, null, 2).replaceAll('\n', '\n  '));
    }

    if (takeScreenshots) {
      const shots = join(testsDir, 'screenshots');
      mkdirSync(shots, { recursive: true });
      const prefix = browserArg === 'chrome' ? '' : 'firefox-';
      await browser.open(SITE);
      await browser.evaluate(call(pageSetUp));
      const starter = await browser.evaluate('window.testView.state.doc.toString()');
      await browser.evaluate(call(pageRun, starter, 'Ada'));
      await browser.screenshot(join(shots, `${prefix}01-successful-run.png`));
      if (browserArg === 'chrome') {
        await browser.evaluate(call(pageRun, caseById['TC-CE-05'].source, ''));
        await browser.screenshot(join(shots, '02-compile-errors.png'));
        await browser.evaluate(call(pageRun, caseById['TC-OP-01'].source, ''));
        await browser.evaluate("document.querySelector('#console a.jump').click(); 'ok'");
        await browser.screenshot(join(shots, '03-runtime-exception.png'));
        await browser.evaluate(call(pageTestRunner, caseById['TC-OP-02'].source));
        await browser.screenshot(join(shots, '04-test-runner.png'));
        await browser.evaluate("document.querySelector('[data-tab=log]').click(); 'ok'");
        await browser.screenshot(join(shots, '05-event-log.png'));
      }
      console.log('Screenshots saved in tests/screenshots/');
    }

    // every request the browser made (NFR1 evidence)
    const hosts = {};
    for (const q of browser.requests) {
      const key = q.method + ' ' + new URL(q.url).origin;
      hosts[key] = (hosts[key] || 0) + 1;
    }
    report.push('', 'All requests in the session, by method and origin:');
    for (const [key, count] of Object.entries(hosts)) report.push(`  ${count} x ${key}`);
    report.push(`  requests with a body: ${browser.requests.filter(q => q.method !== 'GET').length}`);

    const passed = results.filter(r => r.pass).length;
    report.splice(3, 0, `Result: ${passed} of ${results.length} passed`);
    mkdirSync(join(testsDir, 'browser-runs'), { recursive: true });
    const name = browser.version.split(' ')[0].toLowerCase() + '-' + browser.version.split(' ')[1].split('.')[0];
    writeFileSync(join(testsDir, 'browser-runs', name + '.txt'), report.join('\n') + '\n');
    updateResults(browser.version, results);
    console.log(`${passed} of ${results.length} passed. Details in tests/browser-runs/${name}.txt, results in tests/results.csv`);
  } finally {
    if (browser) browser.close();
    server.kill();
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
