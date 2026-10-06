# Tests

The test cases match Table 3.3 in the dissertation. Each `TC-*` folder holds one `Main.java` and, where the program reads input, an `input.txt`.

| Group | Cases | What they check |
|---|---|---|
| TC-CR | 01 to 07 | Compiling and running ordinary programs (FR1 to FR4) |
| TC-IO | 01 to 05 | Output, `System.err` and `System.in` (FR4, FR5) |
| TC-CE | 01 to 05 | Compile errors (FR6) |
| TC-RE | 01 to 05 | Runtime exceptions (FR7) |
| TC-CS | 01, 02 | No source code or input leaves the browser (NFR1) |
| TC-OP | 01 to 03 | Optional features: debugging aid (FR8), test case runner (FR9), event log (FR10) |

## Expected results

`make_expected.sh` compiles and runs every case with the local JDK 8, which is the baseline. It saves the results to `expected/`:

- `<case>.javac`: javac messages
- `<case>.stdout` and `<case>.stderr`: program output, including uncaught exceptions
- `<case>.exit`: exit code

```
tests/make_expected.sh
```

It uses `JAVA_HOME`, or the JDK in `.jdk/` if `JAVA_HOME` is not set. The version used is saved in `expected/JDK_VERSION.txt`.

## Running a case in the IDE

1. Start the IDE (see the main README) and wait for the status to say Ready.
2. Paste the case's `Main.java` into the editor.
3. If the case has an `input.txt`, paste its contents into Program input.
4. Press Run and compare with the files in `expected/`.

Record each result in `results.csv`. Chrome runs all cases. Firefox runs ten: CR-01, CR-07, IO-03, IO-05, CE-01, CE-05, RE-01, RE-05, CS-01 and CS-02.

## Automated browser runs

`run_browser_tests.mjs` does the same steps in a real browser: it pastes each case into the editor, fills in Program input, presses Run, clicks links and buttons, and reads the console, Problems, Tests and Log panels. It checks the pass criteria below, fills in the result and notes columns of `results.csv`, and writes a detailed log to `browser-runs/`. It also records every network request the browser makes, for TC-CS.

```
node tests/run_browser_tests.mjs chrome --screenshots
node tests/run_browser_tests.mjs firefox
```

Each run starts the browser with a new, empty profile in a temporary folder, without a window, and starts its own copy of the server on port 8090. Chrome is driven through the Chrome DevTools Protocol and Firefox through WebDriver BiDi; no packages need installing. `--screenshots` also saves screenshots to `screenshots/`.

To test a Firefox installed somewhere else, set `FIREFOX_APP`, for example `FIREFOX_APP=/path/to/Firefox.app node tests/run_browser_tests.mjs firefox`. If that Firefox has downloaded an update that is waiting to be installed, the script stops, because starting Firefox would begin installing the update.

## Pass criteria

- **CR and IO:** output identical to the JDK.
- **CE:** same line and message as javac, and the line is marked in the editor.
- **RE:** same exception type and line as the JDK, and the IDE can still compile and run another program afterwards (run TC-CR-01 again).
- **CS:** no network request carries source code or input.

### Known difference

When an exception is thrown inside the Java library (TC-IO-05 `Scanner.nextInt`, TC-RE-04 `Integer.parseInt`), the JDK prints line numbers for the library's own frames, for example `at java.util.Scanner.throwFor(Scanner.java:864)`. CheerpJ's runtime classes have no line number information, so the IDE prints `(Unknown Source)` for those frames. The exception type, message and the frames in `Main.java` are identical. Record this in the notes column.

## Manual steps

### TC-CS-01: network during compile

1. Open DevTools, Network panel, with "Preserve log" ticked. Clear the list once the IDE says Ready.
2. Paste `TC-CS-01-network-during-compile/Main.java` and press Run.
3. Search the Network panel (Ctrl+F / Cmd+F inside the panel) for `CS01_SOURCE_MARKER_7319`.
4. Pass if there is no match and no request was sent to any server during the compile.

### TC-CS-02: network during run

1. As above, clear the Network panel once the IDE is Ready.
2. Paste `TC-CS-02-network-during-run/Main.java`, put `CS02_INPUT_MARKER_4826` in Program input and press Run.
3. Search the Network panel for `CS02_INPUT_MARKER_4826`.
4. Pass if there is no match and no request was sent during the run.

### TC-OP-01: debugging aid (FR8)

1. Run `TC-OP-01-debugging-aid/Main.java`. It ends with `ArrayIndexOutOfBoundsException: 3`.
2. In the console, click `Main.java:7`, `Main.java:13` and `Main.java:18` in turn. Each click should move the cursor to that line and highlight it.
3. Open the Problems tab and click the entry. The cursor should move to line 7.
4. Delete the semicolon at the end of line 7 and press Run. Click the compile error in the Problems tab. The cursor should move to line 7.
5. Pass if every click lands on the right line.

### TC-OP-02: test case runner (FR9)

1. Paste `TC-OP-02-test-runner/Main.java` and open the Tests tab. Remove the example test.
2. Add three tests:

   | Input | Expected output |
   |---|---|
   | `3 9` | `Sum: 12` and `Larger: 9` on two lines |
   | `-4 10` | `Sum: 6` and `Larger: 10` on two lines |
   | `5 5` | `Sum: 11` and `Larger: 5` on two lines (deliberately wrong) |

3. Press Run tests.
4. Pass if tests 1 and 2 show PASS, test 3 shows FAIL with the actual output `Sum: 10`, and the summary says 2 of 3 passed.

### TC-OP-03: event log (FR10)

1. Reload the page and wait for Ready.
2. Run `TC-CE-01-missing-semicolon/Main.java`, then `TC-OP-03-event-log/Main.java`, then `TC-RE-01-division-by-zero/Main.java`, then press Run tests.
3. Open the Log tab.
4. Pass if it lists, with times and durations: the runtime and compiler loading, a compile with 1 error, a compile OK and run with exit code 0, a compile OK and run ending in `java.lang.ArithmeticException (line 3)`, and the test run.
