package ide;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileDescriptor;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.PrintStream;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.net.URL;
import java.net.URLClassLoader;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

import jdk.internal.org.objectweb.asm.ClassReader;
import jdk.internal.org.objectweb.asm.ClassVisitor;
import jdk.internal.org.objectweb.asm.ClassWriter;
import jdk.internal.org.objectweb.asm.Handle;
import jdk.internal.org.objectweb.asm.Label;
import jdk.internal.org.objectweb.asm.MethodVisitor;
import jdk.internal.org.objectweb.asm.Opcodes;

// bridge between the page and the jvm in cheerpj
// js calls compile() and run() via cheerpjRunLibrary
public class Launcher {

    // implemented in js (cheerpjInit natives), prints to page console. 1 = stdout, 2 = stderr
    static native void emit(int stream, String text);

    // for testing on a normal jdk outside the browser:
    // java -cp lib/launcher.jar:lib/tools.jar ide.Launcher Main.java [input.txt]
    public static void main(String[] args) throws IOException {
        File source = new File(args[0]);
        File outDir = File.createTempFile("launcher", "");
        outDir.delete();
        String result = compile(source.getPath(), outDir.getPath());
        int newline = result.indexOf('\n');
        System.err.print(result.substring(newline + 1));
        if (!result.substring(0, newline).equals("0")) {
            System.exit(2);
        }
        String className = source.getName().replace(".java", "");
        String input = args.length > 1 ? args[1] : "/dev/null";
        System.exit(run(className, outDir.getPath(), input));
    }

    // compile one file with javac then add line tracking to the classes
    // returns exit code on first line, then javac output as is
    public static String compile(String sourcePath, String outDir) {
        deleteOldBuilds(new File(outDir));
        new File(outDir).mkdirs();
        StringWriter log = new StringWriter();
        PrintWriter writer = new PrintWriter(log);
        int code;
        try {
            // reflection so we don't need tools.jar on the compile classpath
            Class<?> javac = Class.forName("com.sun.tools.javac.Main");
            Method compile = javac.getMethod("compile", String[].class, PrintWriter.class);
            String[] args = { "-d", outDir, sourcePath };
            code = (Integer) compile.invoke(null, args, writer);
        } catch (Throwable t) {
            writer.println("Launcher could not start javac:");
            t.printStackTrace(writer);
            code = -1;
        }
        if (code == 0) {
            try {
                for (File f : classFiles(new File(outDir))) {
                    byte[] tracked = instrument(readAll(f));
                    FileOutputStream out = new FileOutputStream(f);
                    out.write(tracked);
                    out.close();
                }
            } catch (Throwable t) {
                // program still runs, just no line numbers in exceptions
                writer.println("note: line tracking unavailable: " + t);
            }
        }
        writer.flush();
        return code + "\n" + log;
    }

    // run className.main() from classDir with stdin from inputPath
    // returns exit code like the java command (0 ok, 1 uncaught exception)
    public static int run(String className, String classDir, String inputPath) {
        PrintStream oldOut = System.out;
        PrintStream oldErr = System.err;
        InputStream oldIn = System.in;
        PrintStream out = new PrintStream(new PageStream(1), true);
        PrintStream err = new PrintStream(new PageStream(2), true);
        int code = 0;
        try {
            System.setOut(out);
            System.setErr(err);
            System.setIn(new FileInputStream(inputPath));
            Set<String> names = new HashSet<String>();
            File root = new File(classDir);
            for (File f : classFiles(root)) {
                String path = f.getPath().substring(root.getPath().length() + 1);
                names.add(path.substring(0, path.length() - ".class".length()).replace(File.separatorChar, '.'));
            }
            LineTracker.reset(names);
            // new class loader each run so recompiled classes and statics start fresh
            URLClassLoader loader = new URLClassLoader(
                    new URL[] { root.toURI().toURL() }, Launcher.class.getClassLoader());
            Class<?> cls = Class.forName(className, false, loader);
            Method main;
            try {
                main = cls.getMethod("main", String[].class);
            } catch (NoSuchMethodException e) {
                main = null;
            }
            if (main == null || !Modifier.isStatic(main.getModifiers()) || main.getReturnType() != void.class) {
                err.println("Error: Main method not found in class " + className + ", please define the main method as:");
                err.println("   public static void main(String[] args)");
                return 1;
            }
            main.invoke(null, (Object) new String[0]);
        } catch (InvocationTargetException e) {
            code = reportUncaught(e.getCause(), err);
        } catch (ExceptionInInitializerError e) {
            code = reportUncaught(e, err);
        } catch (Throwable t) {
            err.println("Launcher error: " + t);
            code = 1;
        } finally {
            out.flush();
            err.flush();
            System.setOut(oldOut);
            System.setErr(oldErr);
            System.setIn(oldIn);
        }
        return code;
    }

    // print uncaught exception the same way the java command does
    private static int reportUncaught(Throwable t, PrintStream err) {
        t = LineTracker.translate(t);
        LineTracker.repair(t);
        err.print("Exception in thread \"main\" ");
        t.printStackTrace(err);
        return 1;
    }

    // cheerpj keeps /files/ in indexeddb between visits so old builds pile up
    // only deletes build* folders directly inside /files/
    private static void deleteOldBuilds(File outDir) {
        File parent = outDir.getAbsoluteFile().getParentFile();
        if (parent == null || !parent.getPath().equals("/files")) {
            return;
        }
        File[] children = parent.listFiles();
        if (children == null) {
            return;
        }
        for (File old : children) {
            if (old.isDirectory() && old.getName().startsWith("build") && !old.getName().equals(outDir.getName())) {
                deleteTree(old);
            }
        }
    }

    private static void deleteTree(File f) {
        File[] children = f.listFiles();
        if (children != null) {
            for (File c : children) {
                deleteTree(c);
            }
        }
        f.delete();
    }

    private static Set<File> classFiles(File dir) {
        Set<File> found = new HashSet<File>();
        File[] children = dir.listFiles();
        if (children != null) {
            for (File f : children) {
                if (f.isDirectory()) {
                    found.addAll(classFiles(f));
                } else if (f.getName().endsWith(".class")) {
                    found.add(f);
                }
            }
        }
        return found;
    }

    private static byte[] readAll(File f) throws IOException {
        InputStream in = new FileInputStream(f);
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        byte[] chunk = new byte[8192];
        for (int n; (n = in.read(chunk)) > 0;) {
            bytes.write(chunk, 0, n);
        }
        in.close();
        return bytes.toByteArray();
    }

    // add LineTracker calls to every method in a class file (asm from the java 8 runtime)
    static byte[] instrument(byte[] classFile) {
        // code adapted from Bruneton, 2011 (ASM 4.0 user guide, section 2.2: transforming classes)
        ClassReader reader = new ClassReader(classFile);
        ClassWriter writer = new ClassWriter(ClassWriter.COMPUTE_MAXS);
        reader.accept(new ClassVisitor(Opcodes.ASM5, writer) {
            private String owner;
            private String superName;
            private String source;

            @Override
            public void visit(int version, int access, String name, String signature, String superName, String[] interfaces) {
                this.owner = name;
                this.superName = superName;
                super.visit(version, access, name, signature, superName, interfaces);
            }

            @Override
            public void visitSource(String source, String debug) {
                this.source = source;
                super.visitSource(source, debug);
            }

            @Override
            public MethodVisitor visitMethod(int access, String name, String desc, String signature, String[] exceptions) {
                MethodVisitor mv = super.visitMethod(access, name, desc, signature, exceptions);
                if ((access & (Opcodes.ACC_ABSTRACT | Opcodes.ACC_NATIVE)) != 0) {
                    return mv;
                }
                return new TrackingMethod(mv, owner, superName, name, source);
            }
        }, ClassReader.EXPAND_FRAMES);
        return writer.toByteArray();
        // end of adapted code
    }

    // rewrites one method, new code goes straight to mv, original instructions go through super
    private static class TrackingMethod extends MethodVisitor {
        private static final String TRACKER = "ide/LineTracker";
        // array instruction -> LineTracker method that bounds checks then does the same access
        private static final Map<Integer, String[]> ARRAY_HELPERS = new HashMap<Integer, String[]>();

        static {
            ARRAY_HELPERS.put(Opcodes.IALOAD, new String[] { "iaload", "([II)I" });
            ARRAY_HELPERS.put(Opcodes.LALOAD, new String[] { "laload", "([JI)J" });
            ARRAY_HELPERS.put(Opcodes.FALOAD, new String[] { "faload", "([FI)F" });
            ARRAY_HELPERS.put(Opcodes.DALOAD, new String[] { "daload", "([DI)D" });
            ARRAY_HELPERS.put(Opcodes.BALOAD, new String[] { "baload", "(Ljava/lang/Object;I)I" });
            ARRAY_HELPERS.put(Opcodes.CALOAD, new String[] { "caload", "([CI)C" });
            ARRAY_HELPERS.put(Opcodes.SALOAD, new String[] { "saload", "([SI)S" });
            ARRAY_HELPERS.put(Opcodes.IASTORE, new String[] { "iastore", "([III)V" });
            ARRAY_HELPERS.put(Opcodes.LASTORE, new String[] { "lastore", "([JIJ)V" });
            ARRAY_HELPERS.put(Opcodes.FASTORE, new String[] { "fastore", "([FIF)V" });
            ARRAY_HELPERS.put(Opcodes.DASTORE, new String[] { "dastore", "([DID)V" });
            ARRAY_HELPERS.put(Opcodes.AASTORE, new String[] { "aastore", "([Ljava/lang/Object;ILjava/lang/Object;)V" });
            ARRAY_HELPERS.put(Opcodes.BASTORE, new String[] { "bastore", "(Ljava/lang/Object;II)V" });
            ARRAY_HELPERS.put(Opcodes.CASTORE, new String[] { "castore", "([CII)V" });
            ARRAY_HELPERS.put(Opcodes.SASTORE, new String[] { "sastore", "([SII)V" });
        }

        private final String owner;
        private final String superName;
        private final String method;
        private final String source;
        private final boolean constructor;
        private final Set<Label> handlers = new HashSet<Label>();
        private final Label start = new Label();
        private boolean started;
        private boolean pendingCatch;
        private int pendingLine = -1;

        TrackingMethod(MethodVisitor mv, String owner, String superName, String method, String source) {
            super(Opcodes.ASM5, mv);
            this.owner = owner;
            this.superName = superName;
            this.method = method;
            this.source = source;
            this.constructor = method.equals("<init>");
        }

        @Override
        public void visitCode() {
            super.visitCode();
            mv.visitLdcInsn(owner.replace('/', '.'));
            mv.visitLdcInsn(method);
            if (source == null) {
                mv.visitInsn(Opcodes.ACONST_NULL);
            } else {
                mv.visitLdcInsn(source);
            }
            mv.visitMethodInsn(Opcodes.INVOKESTATIC, TRACKER, "enter",
                    "(Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;)V", false);
            // constructor catch-all can only start after super() runs
            if (!constructor) {
                mv.visitLabel(start);
                started = true;
            }
        }

        @Override
        public void visitTryCatchBlock(Label from, Label to, Label handler, String type) {
            handlers.add(handler);
            super.visitTryCatchBlock(from, to, handler, type);
        }

        @Override
        public void visitLabel(Label label) {
            super.visitLabel(label);
            if (handlers.contains(label)) {
                pendingCatch = true;
            }
        }

        @Override
        public void visitLineNumber(int line, Label label) {
            super.visitLineNumber(line, label);
            pendingLine = line;
        }

        // emit pending calls right before the next real instruction (after any stack map frame)
        private void beforeInstruction() {
            if (pendingCatch) {
                mv.visitInsn(Opcodes.DUP);
                mv.visitMethodInsn(Opcodes.INVOKESTATIC, TRACKER, "caught", "(Ljava/lang/Throwable;)V", false);
                pendingCatch = false;
            }
            if (pendingLine >= 0) {
                mv.visitLdcInsn(pendingLine);
                mv.visitMethodInsn(Opcodes.INVOKESTATIC, TRACKER, "line", "(I)V", false);
                pendingLine = -1;
            }
        }

        @Override
        public void visitInsn(int opcode) {
            beforeInstruction();
            switch (opcode) {
                case Opcodes.IDIV:
                    mv.visitMethodInsn(Opcodes.INVOKESTATIC, TRACKER, "idiv", "(II)I", false);
                    return;
                case Opcodes.IREM:
                    mv.visitMethodInsn(Opcodes.INVOKESTATIC, TRACKER, "irem", "(II)I", false);
                    return;
                case Opcodes.LDIV:
                    mv.visitMethodInsn(Opcodes.INVOKESTATIC, TRACKER, "ldiv", "(JJ)J", false);
                    return;
                case Opcodes.LREM:
                    mv.visitMethodInsn(Opcodes.INVOKESTATIC, TRACKER, "lrem", "(JJ)J", false);
                    return;
                case Opcodes.AALOAD:
                    mv.visitInsn(Opcodes.DUP2);
                    mv.visitMethodInsn(Opcodes.INVOKESTATIC, TRACKER, "checkIndex", "([Ljava/lang/Object;I)V", false);
                    break;
                case Opcodes.IALOAD:
                case Opcodes.LALOAD:
                case Opcodes.FALOAD:
                case Opcodes.DALOAD:
                case Opcodes.BALOAD:
                case Opcodes.CALOAD:
                case Opcodes.SALOAD:
                case Opcodes.IASTORE:
                case Opcodes.LASTORE:
                case Opcodes.FASTORE:
                case Opcodes.DASTORE:
                case Opcodes.AASTORE:
                case Opcodes.BASTORE:
                case Opcodes.CASTORE:
                case Opcodes.SASTORE:
                    String[] helper = ARRAY_HELPERS.get(opcode);
                    mv.visitMethodInsn(Opcodes.INVOKESTATIC, TRACKER, helper[0], helper[1], false);
                    return;
                case Opcodes.IRETURN:
                case Opcodes.LRETURN:
                case Opcodes.FRETURN:
                case Opcodes.DRETURN:
                case Opcodes.ARETURN:
                case Opcodes.RETURN:
                    mv.visitMethodInsn(Opcodes.INVOKESTATIC, TRACKER, "exit", "()V", false);
                    break;
                default:
                    break;
            }
            super.visitInsn(opcode);
        }

        @Override
        public void visitMethodInsn(int opcode, String owner, String name, String desc, boolean itf) {
            beforeInstruction();
            if (opcode == Opcodes.INVOKEVIRTUAL && name.equals("printStackTrace") && desc.equals("()V")
                    && (owner.endsWith("Exception") || owner.endsWith("Error") || owner.equals("java/lang/Throwable"))) {
                mv.visitMethodInsn(Opcodes.INVOKESTATIC, TRACKER, "printStackTrace", "(Ljava/lang/Throwable;)V", false);
                return;
            }
            super.visitMethodInsn(opcode, owner, name, desc, itf);
            if (constructor && !started && opcode == Opcodes.INVOKESPECIAL && name.equals("<init>")
                    && (owner.equals(superName) || owner.equals(this.owner))) {
                mv.visitLabel(start);
                started = true;
            }
        }

        @Override
        public void visitMaxs(int maxStack, int maxLocals) {
            if (started) {
                // catch-all handler, last in the exception table
                // records where it happened, pops this frame, rethrows
                Label handler = new Label();
                mv.visitTryCatchBlock(start, handler, handler, null);
                mv.visitLabel(handler);
                mv.visitFrame(Opcodes.F_NEW, 0, new Object[0], 1, new Object[] { "java/lang/Throwable" });
                mv.visitMethodInsn(Opcodes.INVOKESTATIC, TRACKER, "unwind",
                        "(Ljava/lang/Throwable;)Ljava/lang/Throwable;", false);
                mv.visitInsn(Opcodes.ATHROW);
            }
            super.visitMaxs(maxStack, maxLocals);
        }

        @Override
        public void visitIntInsn(int opcode, int operand) {
            beforeInstruction();
            super.visitIntInsn(opcode, operand);
        }

        @Override
        public void visitVarInsn(int opcode, int var) {
            beforeInstruction();
            super.visitVarInsn(opcode, var);
        }

        @Override
        public void visitTypeInsn(int opcode, String type) {
            beforeInstruction();
            super.visitTypeInsn(opcode, type);
        }

        @Override
        public void visitFieldInsn(int opcode, String owner, String name, String desc) {
            beforeInstruction();
            super.visitFieldInsn(opcode, owner, name, desc);
        }

        @Override
        public void visitInvokeDynamicInsn(String name, String desc, Handle bsm, Object... bsmArgs) {
            beforeInstruction();
            super.visitInvokeDynamicInsn(name, desc, bsm, bsmArgs);
        }

        @Override
        public void visitJumpInsn(int opcode, Label label) {
            beforeInstruction();
            super.visitJumpInsn(opcode, label);
        }

        @Override
        public void visitLdcInsn(Object cst) {
            beforeInstruction();
            super.visitLdcInsn(cst);
        }

        @Override
        public void visitIincInsn(int var, int increment) {
            beforeInstruction();
            super.visitIincInsn(var, increment);
        }

        @Override
        public void visitTableSwitchInsn(int min, int max, Label dflt, Label... labels) {
            beforeInstruction();
            super.visitTableSwitchInsn(min, max, dflt, labels);
        }

        @Override
        public void visitLookupSwitchInsn(Label dflt, int[] keys, Label[] labels) {
            beforeInstruction();
            super.visitLookupSwitchInsn(dflt, keys, labels);
        }

        @Override
        public void visitMultiANewArrayInsn(String desc, int dims) {
            beforeInstruction();
            super.visitMultiANewArrayInsn(desc, dims);
        }
    }

    // buffers bytes, sends full lines (or leftovers on flush) to the page
    private static class PageStream extends OutputStream {
        private final int stream;
        private final ByteArrayOutputStream buffer = new ByteArrayOutputStream();

        PageStream(int stream) {
            this.stream = stream;
        }

        @Override
        public void write(int b) {
            buffer.write(b);
            if (b == '\n') {
                flush();
            }
        }

        @Override
        public void flush() {
            if (buffer.size() > 0) {
                String text = new String(buffer.toByteArray(), java.nio.charset.StandardCharsets.UTF_8);
                buffer.reset();
                try {
                    emit(stream, text);
                } catch (UnsatisfiedLinkError notInBrowser) {
                    // running from main() on a normal jdk
                    new PrintStream(new FileOutputStream(stream == 2 ? FileDescriptor.err : FileDescriptor.out), true).print(text);
                }
            }
        }
    }
}
