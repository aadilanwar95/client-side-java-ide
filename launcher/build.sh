#!/bin/sh
# builds lib/launcher.jar from launcher/ide/*.java with jdk 8 (what cheerpj runs)
# -XDignore.symbol.file lets us use the jdk's internal asm copy
set -e
cd "$(dirname "$0")/.."
JAVA_HOME="${JAVA_HOME:-$(ls -d .jdk/zulu8*/Contents/Home 2>/dev/null | head -1)}"
rm -rf launcher/classes
mkdir -p launcher/classes lib
"$JAVA_HOME/bin/javac" -source 8 -target 8 -XDignore.symbol.file -d launcher/classes launcher/ide/*.java
"$JAVA_HOME/bin/jar" cf lib/launcher.jar -C launcher/classes .
rm -rf launcher/classes
echo "Built lib/launcher.jar"
