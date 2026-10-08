# Sources

Code adapted from these sources is marked in the code with `// code adapted from <source>, <year>` and `// end of adapted code`. Details are listed here so that APA references can be added to the dissertation.

| Source | Used in | What was adapted |
|---|---|---|
| Leaning Technologies (2026). *JavaFiddle* [Source code, commit 741b8ab]. GitHub. https://github.com/leaningtech/javafiddle. Apache License 2.0. | `app.js`: `compileSource()` | Writing the source into CheerpJ's `/str/` file system and compiling into `/files/` with javac from `tools.jar` (from `src/lib/CheerpJ.svelte`) |
| Same as above | `app.js`: `parseJavacOutput()` | Reading line numbers from javac's `File.java:LINE: error: message` lines and the column from the caret line below (from `src/lib/repl/linter.ts`). Changed to allow `:` inside messages and to keep the "symbol:" detail lines. |
| Leaning Technologies (n.d.). *Implementing native methods*. CheerpJ documentation. https://cheerpj.com/docs/guides/implementing-native-methods | `app.js`: `Java_ide_Launcher_emit()`; `spike/index.html` | A JavaScript function named `Java_<class>_<method>` passed to `cheerpjInit` as a native method, so Java can call JavaScript |
| Leaning Technologies (n.d.). *cheerpjInit* and *cheerpjRunLibrary*. CheerpJ documentation. https://cheerpj.com/docs/reference/cheerpjInit, https://cheerpj.com/docs/reference/cheerpjRunLibrary | `app.js`: `startJava()`; `spike/index.html` | Starting CheerpJ with options, loading jars as a library and calling a Java class from JavaScript |
| Bruneton, E. (2011). *ASM 4.0: A Java bytecode engineering library* [User guide]. OW2 Consortium. https://asm.ow2.io/asm4-guide.pdf | `launcher/ide/Launcher.java`: `instrument()` | The ClassReader, ClassVisitor and ClassWriter chain for transforming a class file (section 2.2) |

The CheerpJ documentation pages have no publication date; they were accessed in October 2026.

## Licence checks

- **JavaFiddle** is Apache License 2.0, which allows adapting code with attribution. No files were copied; two short pieces of logic were adapted as listed above. The project's `tools.jar` is not used: `lib/tools.jar` comes from OpenJDK 8 instead.
- **CheerpJ** is used under its free community licence, which requires the "Powered by CheerpJ (Leaning Technologies)" credit shown in the page footer.
- **OpenJDK 8** (`lib/tools.jar`, Azul Zulu 8u504) is GPL version 2 with the Classpath Exception.
- **ASM** is BSD licensed. It is used from inside the Java 8 runtime, not copied.

