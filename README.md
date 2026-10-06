# client side java ide

java ide that runs fully in the browser. write a program, type the input, hit Run. javac compiles it and the program runs on a jvm, both inside [CheerpJ](https://cheerpj.com) in the browser tab. no server compiles or runs anything, and nothing you type gets sent anywhere.

made for my MSc dissertation (University of Chester, CO7047).

## features

- java editor with syntax highlighting (CodeMirror 6)
- compile and run in the browser (java 8, CheerpJ 4.3)
- console with stdout and stderr
- program input box, read through `System.in`
- compile errors with line and message, marked in the editor
- runtime exceptions with type, message and line, same as the `java` command prints them
- click an error or a stack trace line to jump to it
- test runner: run the program against a few inputs and expected outputs
- log of compiles and runs

## running it

cheerpj doesn't work from `file://` and needs a server that supports range requests, so there's a small one included (`serve.mjs`, no dependencies, needs node 20.11+):

```
node serve.mjs
```

then open http://localhost:8080/ in chrome or firefox. the first load takes a few seconds while cheerpj loads java and warms up javac.

## files

| file | what it does |
|---|---|
| `index.html`, `style.css` | page layout and styles |
| `app.js` | editor, run button, console, problems, tests and log. talks to java through cheerpj |
| `launcher/ide/Launcher.java` | runs javac, runs `main()` with input/output hooked up to the page, adds line tracking |
| `launcher/ide/LineTracker.java` | puts line numbers (and some missing messages) back into exceptions, since cheerpj leaves them out |
| `launcher/build.sh` | rebuilds `lib/launcher.jar`, needs a jdk 8 in `JAVA_HOME` or `.jdk/` |
| `lib/` | `launcher.jar` and `tools.jar` (javac from openjdk 8, see `lib/README.md`) |
| `serve.mjs` | local server with range requests |
| `spike/` | first test that javac runs in cheerpj, kept for reference |
| `tests/` | test cases, expected outputs, browser test runner, results and screenshots (see `tests/README.md`) |

## limitations

- java 8 only, cheerpj's java 17 runtime has no javac
- one source file at a time (it can have several classes)
- a running program can't be stopped, so an infinite loop means reloading the page
- input has to be typed in before pressing Run
- line tracking assumes one thread, and recursion deeper than 2000 calls stops with `StackOverflowError`
- java library frames show `(Unknown Source)` in stack traces
- desktop browsers only

## credits

- [CheerpJ](https://cheerpj.com) by Leaning Technologies runs the jvm in the browser (free community licence)
- [CodeMirror 6](https://codemirror.net) (MIT), loaded from [esm.sh](https://esm.sh)
- `lib/tools.jar` is from OpenJDK 8 (Azul Zulu build), GPL v2 with the Classpath Exception
- the launcher uses the [ASM](https://asm.ow2.io) copy that comes inside the java 8 runtime (BSD)
- the compile and run approach is based on [JavaFiddle](https://github.com/leaningtech/javafiddle) by Leaning Technologies (Apache 2.0)

adapted code is listed in `SOURCES.md`. the rest is MIT, see `LICENSE`.
