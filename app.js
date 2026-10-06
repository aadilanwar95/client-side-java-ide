// client side java ide, javac and the program both run in cheerpj (browser tab)
// nothing (code or input) gets sent to a server

// codemirror 6 from esm.sh, core packages use same version ranges as codemirror@6.0.2
// so only one copy of @codemirror/state and view gets loaded
import { EditorView, basicSetup } from 'https://esm.sh/codemirror@6.0.2?target=es2022';
import { java } from 'https://esm.sh/@codemirror/lang-java@6.0.2?target=es2022';
import { indentUnit } from 'https://esm.sh/@codemirror/language@^6.0.0?target=es2022';
import { lintGutter, setDiagnostics } from 'https://esm.sh/@codemirror/lint@^6.0.0?target=es2022';

const STARTER_CODE = `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner in = new Scanner(System.in);
        System.out.print("What is your name? ");
        String name = in.nextLine();
        System.out.println("Hello, " + name + "!");
    }
}
`;

const runButton = document.getElementById('run');
const statusText = document.getElementById('status');
const fileNameLabel = document.getElementById('file-name');
const inputBox = document.getElementById('program-input');
const consoleBox = document.getElementById('console');
const problemList = document.getElementById('problems');
const noProblems = document.getElementById('no-problems');
const problemCount = document.getElementById('problem-count');
const testCases = document.getElementById('test-cases');
const runTestsButton = document.getElementById('run-tests');
const testSummary = document.getElementById('test-summary');
const logRows = document.getElementById('log-rows');

let launcher = null; // ide.Launcher class, set once cheerpj loads
let busy = false;
let buildCount = 0;
let inputCount = 0;
let outputSink = null; // gets program output while running
const sessionId = Date.now().toString(36);

// ---------- editor ----------

const editor = new EditorView({
  doc: STARTER_CODE,
  extensions: [basicSetup, java(), indentUnit.of('    '), lintGutter()],
  parent: document.getElementById('editor'),
});
inputBox.value = 'Ada';

function sourceCode() {
  return editor.state.doc.toString();
}

// jump to a line and select it so it shows highlighted (FR8)
function goToLine(lineNumber) {
  const doc = editor.state.doc;
  const line = doc.line(Math.min(Math.max(lineNumber, 1), doc.lines));
  editor.dispatch({ selection: { anchor: line.from, head: line.to }, scrollIntoView: true });
  editor.focus();
}

// mark error lines with codemirror lint (FR6)
function markLines(problems) {
  const doc = editor.state.doc;
  const diagnostics = [];
  for (const p of problems) {
    if (!p.line || p.line > doc.lines) continue;
    const line = doc.line(p.line);
    let from;
    let to;
    if (p.column === undefined) {
      // runtime errors have no column so mark whole line minus indent
      from = line.from + line.text.search(/\S|$/);
      to = line.to;
    } else {
      // underline word at javac column (or 1 char if no word)
      from = Math.min(line.from + p.column, line.to);
      const word = line.text.slice(from - line.from).match(/^\w+/);
      to = Math.min(from + (word ? word[0].length : 1), line.to);
    }
    diagnostics.push({
      from,
      to,
      severity: p.severity === 'warning' ? 'warning' : 'error',
      message: p.message,
    });
  }
  editor.dispatch(setDiagnostics(editor.state, diagnostics));
}

// ---------- finding class names ----------

function withoutComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
}

// file has to be named after the public class (if any)
function fileClassName(source) {
  const match = withoutComments(source).match(/public\s+(?:final\s+|abstract\s+)*(?:class|interface|enum)\s+(\w+)/);
  return match ? match[1] : 'Main';
}

// class to run = last class declared before main()
function mainClassName(source) {
  const text = withoutComments(source);
  const mainAt = text.search(/static\s+void\s+main\s*\(/);
  let name = fileClassName(source);
  if (mainAt < 0) return name;
  const classPattern = /\b(?:class|interface|enum)\s+(\w+)/g;
  let match;
  while ((match = classPattern.exec(text)) !== null && match.index < mainAt) {
    name = match[1];
  }
  return name;
}

// ---------- compiling and running ----------

async function compileSource(source) {
  const className = fileClassName(source);
  const fileName = className + '.java';
  buildCount++;
  // code adapted from Leaning Technologies, 2026 (JavaFiddle, src/lib/CheerpJ.svelte)
  // source goes in /str/, javac writes classes to /files/
  const sourcePath = '/str/' + fileName;
  const outDir = `/files/build-${sessionId}-${buildCount}/`;
  cheerpOSAddStringFile(sourcePath, source);
  // end of adapted code

  const started = performance.now();
  const result = await launcher.compile(sourcePath, outDir);
  const ms = Math.round(performance.now() - started);

  // line 1 = exit code, rest = javac output
  const newline = result.indexOf('\n');
  const exitCode = Number(result.slice(0, newline));
  const javacOutput = result.slice(newline + 1).replaceAll('/str/', '');
  return {
    ok: exitCode === 0,
    fileName,
    mainClass: mainClassName(source),
    outDir,
    javacOutput,
    problems: parseJavacOutput(javacOutput, fileName),
    ms,
  };
}

// code adapted from Leaning Technologies, 2026 (JavaFiddle, src/lib/repl/linter.ts)
// javac format: File.java:LINE: error: msg, then source line, then caret under col
// sometimes extra lines after, like '  symbol: variable x'
function parseJavacOutput(output, fileName) {
  const lines = output.split('\n');
  const problems = [];
  const pattern = /^(.+\.java):(\d+): (error|warning): (.*)$/;
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(pattern);
    if (!match || match[1] !== fileName) continue;
    const caretLine = lines[i + 2] || '';
    const details = [];
    for (let j = i + 3; j < lines.length && /^ {2}\S/.test(lines[j]); j++) {
      details.push(lines[j].trim());
    }
    problems.push({
      line: Number(match[2]),
      column: Math.max(caretLine.indexOf('^'), 0),
      severity: match[3],
      message: match[4],
      details: details.join('\n'),
    });
  }
  return problems;
}
// end of adapted code

async function runCompiled(compiled, input, onOutput) {
  const inputPath = `/str/input-${sessionId}-${++inputCount}.txt`;
  cheerpOSAddStringFile(inputPath, input);
  let stdout = '';
  let stderr = '';
  outputSink = (stream, text) => {
    if (stream === 2) stderr += text;
    else stdout += text;
    if (onOutput) onOutput(stream, text);
  };
  const started = performance.now();
  let exitCode;
  try {
    exitCode = await launcher.run(compiled.mainClass, compiled.outDir, inputPath);
  } finally {
    outputSink = null;
  }
  const ms = Math.round(performance.now() - started);
  return { exitCode, stdout, stderr, ms, exception: parseException(stderr, compiled.fileName) };
}

// find the exception line and first stack frame in the user's file (FR7)
function parseException(stderr, fileName) {
  const prefix = 'Exception in thread "main" ';
  const lines = stderr.split('\n');
  const start = lines.findIndex(l => l.startsWith(prefix));
  if (start < 0) return null;
  const description = lines[start].slice(prefix.length);
  const where = '(' + fileName + ':';
  for (let i = start + 1; i < lines.length; i++) {
    const at = lines[i].indexOf(where);
    if (lines[i].trim().startsWith('at ') && at >= 0) {
      return { description, line: parseInt(lines[i].slice(at + where.length), 10) };
    }
  }
  return { description, line: null };
}

// code adapted from Leaning Technologies, n.d. (CheerpJ documentation, "Implementing native methods")
// called from java native Launcher.emit() (see natives in cheerpjInit)
async function Java_ide_Launcher_emit(lib, stream, text) {
  if (outputSink) outputSink(stream, text);
}
// end of adapted code

// ---------- console ----------

function clearConsole() {
  consoleBox.textContent = '';
}

// add text to console, File.java:12 in errors becomes a link to line 12 (FR8)
function printToConsole(text, kind, fileName) {
  const span = document.createElement('span');
  span.className = kind;
  if (kind === 'err' && fileName) {
    const pattern = new RegExp('(' + fileName.replace('.', '\\.') + '):(\\d+)', 'g');
    let last = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      span.append(text.slice(last, match.index));
      const link = document.createElement('a');
      link.className = 'jump';
      link.textContent = match[0];
      const line = Number(match[2]);
      link.addEventListener('click', () => goToLine(line));
      span.append(link);
      last = match.index + match[0].length;
    }
    span.append(text.slice(last));
  } else {
    span.textContent = text;
  }
  consoleBox.append(span);
  consoleBox.parentElement.scrollTop = consoleBox.parentElement.scrollHeight;
}

// ---------- problems panel ----------

function showProblems(problems) {
  problemList.textContent = '';
  for (const p of problems) {
    const item = document.createElement('li');
    const where = document.createElement('span');
    where.className = 'where';
    where.textContent = p.line ? `Line ${p.line}: ` : '';
    item.append(where, p.message + (p.details ? '\n' + p.details : ''));
    if (p.line) item.addEventListener('click', () => goToLine(p.line));
    problemList.append(item);
  }
  const errors = problems.filter(p => p.severity !== 'warning').length;
  noProblems.hidden = problems.length > 0;
  problemCount.hidden = errors === 0;
  problemCount.textContent = errors;
  markLines(problems);
}

// ---------- tabs ----------

function showTab(name) {
  for (const tab of document.querySelectorAll('.tabs button')) {
    const selected = tab.dataset.tab === name;
    tab.setAttribute('aria-selected', selected);
    document.getElementById('panel-' + tab.dataset.tab).hidden = !selected;
  }
}

for (const tab of document.querySelectorAll('.tabs button')) {
  tab.addEventListener('click', () => showTab(tab.dataset.tab));
}

// ---------- event log (FR10) ----------

function addLog(event, result, ms) {
  const row = document.createElement('tr');
  const time = new Date().toLocaleTimeString('en-GB');
  for (const value of [time, event, result, ms === undefined ? '' : ms + ' ms']) {
    const cell = document.createElement('td');
    cell.textContent = value;
    row.append(cell);
  }
  logRows.append(row);
}

document.getElementById('clear-log').addEventListener('click', () => {
  logRows.textContent = '';
});

// ---------- run button ----------

function setBusy(isBusy, message) {
  busy = isBusy;
  runButton.disabled = isBusy || !launcher;
  runTestsButton.disabled = isBusy || !launcher;
  statusText.textContent = message;
}

// compile editor code, show errors and return null if javac fails
async function compileForRun() {
  const compiled = await compileSource(sourceCode());
  fileNameLabel.textContent = compiled.fileName;
  if (compiled.javacOutput) printToConsole(compiled.javacOutput, 'err', compiled.fileName);
  showProblems(compiled.problems);
  const errors = compiled.problems.filter(p => p.severity === 'error').length;
  addLog('Compile ' + compiled.fileName, compiled.ok ? 'OK' : `${errors} error${errors === 1 ? '' : 's'}`, compiled.ms);
  if (!compiled.ok) {
    showTab('problems');
    return null;
  }
  return compiled;
}

async function runProgram() {
  if (busy || !launcher) return;
  setBusy(true, 'Compiling…');
  clearConsole();
  showTab('console');
  try {
    const compiled = await compileForRun();
    if (!compiled) {
      setBusy(false, 'Compile failed');
      return;
    }
    setBusy(true, 'Running…');
    const result = await runCompiled(compiled, inputBox.value, (stream, text) => {
      printToConsole(text, stream === 2 ? 'err' : 'out', compiled.fileName);
    });
    printToConsole(`\n[finished with exit code ${result.exitCode} in ${result.ms} ms]\n`, 'meta');
    if (result.exception) {
      const e = result.exception;
      showProblems([{ line: e.line, message: e.description, severity: 'error' }]);
      addLog('Run ' + compiled.mainClass, e.description.split(':')[0] + (e.line ? ` (line ${e.line})` : ''), result.ms);
    } else {
      addLog('Run ' + compiled.mainClass, 'exit code ' + result.exitCode, result.ms);
    }
    setBusy(false, result.exitCode === 0 ? 'Finished' : 'Finished with an exception');
  } catch (error) {
    printToConsole('Internal error: ' + error + '\n', 'err');
    setBusy(false, 'Something went wrong');
  }
}

runButton.addEventListener('click', runProgram);
document.addEventListener('keydown', event => {
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    runProgram();
  }
});

// ---------- test case runner (FR9) ----------

function addTestCase(input = '', expected = '') {
  const box = document.createElement('div');
  box.className = 'test-case';
  box.innerHTML = `
    <header><span class="title"></span><span class="result"></span><button type="button">Remove</button></header>
    <div class="fields">
      <label>Input<textarea class="test-input" spellcheck="false"></textarea></label>
      <label>Expected output<textarea class="test-expected" spellcheck="false"></textarea></label>
    </div>
    <pre class="actual" hidden></pre>`;
  box.querySelector('.test-input').value = input;
  box.querySelector('.test-expected').value = expected;
  box.querySelector('header button').addEventListener('click', () => {
    box.remove();
    numberTestCases();
  });
  testCases.append(box);
  numberTestCases();
}

function numberTestCases() {
  testCases.querySelectorAll('.test-case').forEach((box, i) => {
    box.querySelector('.title').textContent = 'Test ' + (i + 1);
  });
}

// ignore line endings and trailing spaces when comparing
function normalise(text) {
  return text.replace(/\r\n/g, '\n').split('\n').map(l => l.trimEnd()).join('\n').trimEnd();
}

async function runTests() {
  const boxes = [...testCases.querySelectorAll('.test-case')];
  if (busy || !launcher || boxes.length === 0) return;
  setBusy(true, 'Compiling…');
  clearConsole();
  testSummary.textContent = '';
  for (const box of boxes) {
    box.querySelector('.result').textContent = '';
    box.querySelector('.actual').hidden = true;
  }
  try {
    const compiled = await compileForRun();
    if (!compiled) {
      testSummary.textContent = 'The program does not compile.';
      setBusy(false, 'Compile failed');
      return;
    }
    let passed = 0;
    const started = performance.now();
    for (let i = 0; i < boxes.length; i++) {
      setBusy(true, `Running test ${i + 1} of ${boxes.length}…`);
      const box = boxes[i];
      const result = await runCompiled(compiled, box.querySelector('.test-input').value);
      const expected = box.querySelector('.test-expected').value;
      const ok = result.exitCode === 0 && normalise(result.stdout) === normalise(expected);
      const label = box.querySelector('.result');
      label.textContent = ok ? 'PASS' : 'FAIL';
      label.className = 'result ' + (ok ? 'pass' : 'fail');
      if (ok) {
        passed++;
      } else {
        const actual = box.querySelector('.actual');
        actual.textContent = 'Actual output:\n' + (result.stdout || '(none)') +
          (result.exception ? '\n' + result.exception.description : '');
        actual.hidden = false;
      }
    }
    const ms = Math.round(performance.now() - started);
    testSummary.textContent = `${passed} of ${boxes.length} passed`;
    addLog('Test run', `${passed}/${boxes.length} passed`, ms);
    showTab('tests');
    setBusy(false, 'Tests finished');
  } catch (error) {
    printToConsole('Internal error: ' + error + '\n', 'err');
    setBusy(false, 'Something went wrong');
  }
}

document.getElementById('add-test').addEventListener('click', () => addTestCase());
runTestsButton.addEventListener('click', runTests);
addTestCase('Ada', 'What is your name? Hello, Ada!');

// ---------- starting Java ----------

async function startJava() {
  const started = performance.now();
  // code adapted from Leaning Technologies, n.d. (CheerpJ documentation, cheerpjInit and cheerpjRunLibrary)
  await cheerpjInit({ version: 8, status: 'none', natives: { Java_ide_Launcher_emit } });
  // /app/ = folder the page is served from
  const appPath = '/app' + location.pathname.replace(/[^/]*$/, '');
  const lib = await cheerpjRunLibrary(`${appPath}lib/tools.jar:${appPath}lib/launcher.jar`);
  launcher = await lib.ide.Launcher;
  // end of adapted code
  addLog('Java runtime loaded', 'OK', Math.round(performance.now() - started));

  // first javac call is slow (cheerpj compiling javac itself) so warm it up now
  statusText.textContent = 'Preparing compiler…';
  const warmUp = performance.now();
  cheerpOSAddStringFile('/str/WarmUp.java', 'class WarmUp {}');
  await launcher.compile('/str/WarmUp.java', `/files/build-${sessionId}-0/`);
  addLog('Compiler ready', 'OK', Math.round(performance.now() - warmUp));
  setBusy(false, 'Ready');
}

startJava().catch(error => {
  statusText.textContent = 'Could not load the Java runtime: ' + error;
});
