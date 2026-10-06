#!/bin/sh
# generates expected results for every test case with the local jdk 8
# for each tests/TC-*/ folder: javac the .java, if ok run it with input.txt (if there) as stdin
# output goes to tests/expected/:
#   <case>.javac   javac messages (empty if it compiles)
#   <case>.stdout  program output
#   <case>.stderr  error output incl uncaught exceptions
#   <case>.exit    exit code of javac (if compile fails) or java
#
# usage: tests/make_expected.sh   (uses JAVA_HOME or the jdk 8 in .jdk/)
set -e
cd "$(dirname "$0")"
if [ -z "$JAVA_HOME" ]; then
    JAVA_HOME=$(cd ../.jdk/zulu8*/Contents/Home 2>/dev/null && pwd) || true
fi
if [ ! -x "$JAVA_HOME/bin/javac" ]; then
    echo "No JDK 8 found. Set JAVA_HOME to a JDK 8 (Eclipse Temurin 8 or Azul Zulu 8)." >&2
    exit 1
fi

mkdir -p expected
"$JAVA_HOME/bin/java" -version > expected/JDK_VERSION.txt 2>&1
build=$(mktemp -d)
trap 'rm -r "$build"' EXIT

for dir in TC-*/; do
    name=${dir%/}
    file=$(cd "$dir" && ls *.java | head -1)
    class=${file%.java}
    mkdir "$build/$name"
    input="$dir/input.txt"
    [ -f "$input" ] || input=/dev/null
    # compile from inside the folder so messages say Main.java:3: ... like in the ide
    if (cd "$dir" && "$JAVA_HOME/bin/javac" -d "$build/$name" "$file") > "expected/$name.javac" 2>&1; then
        code=0
        "$JAVA_HOME/bin/java" -cp "$build/$name" "$class" < "$input" \
            > "expected/$name.stdout" 2> "expected/$name.stderr" || code=$?
    else
        code=$?
        : > "expected/$name.stdout"
        : > "expected/$name.stderr"
    fi
    echo "$code" > "expected/$name.exit"
    echo "$name: exit $code"
done
