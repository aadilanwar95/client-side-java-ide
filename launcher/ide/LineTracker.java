package ide;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.WeakHashMap;

// runtime side of line tracking. cheerpj prints Unknown Source in stack traces so
// Launcher.instrument() adds calls to these into the student classes:
// enter() at method start, line() per source line, exit() before return, unwind() on exception
// keeps a shadow stack of (class, method, line) to put the real line numbers back
// assumes single threaded programs
public final class LineTracker {

    // deeper than this throws StackOverflowError before the browser stack runs out
    static int maxDepth = 2000;
    // jdk keeps max 1024 frames in a trace (MaxJavaStackTraceDepth)
    private static final int MAX_TRACE = 1024;

    private static String[] classes = new String[256];
    private static String[] methods = new String[256];
    private static String[] files = new String[256];
    private static int[] lines = new int[256];
    private static int depth;
    private static final Map<Throwable, StackTraceElement[]> snapshots = new WeakHashMap<Throwable, StackTraceElement[]>();
    private static final Set<String> studentClasses = new HashSet<String>();

    private LineTracker() {
    }

    // called by Launcher before each run
    static void reset(Set<String> classNames) {
        depth = 0;
        snapshots.clear();
        studentClasses.clear();
        studentClasses.addAll(classNames);
    }

    public static void enter(String className, String method, String file) {
        if (depth >= maxDepth) {
            throw new StackOverflowError();
        }
        if (depth == lines.length) {
            int size = depth * 2;
            classes = Arrays.copyOf(classes, size);
            methods = Arrays.copyOf(methods, size);
            files = Arrays.copyOf(files, size);
            lines = Arrays.copyOf(lines, size);
        }
        classes[depth] = className;
        methods[depth] = method;
        files[depth] = file;
        lines[depth] = -1;
        depth++;
    }

    public static void line(int line) {
        if (depth > 0) {
            lines[depth - 1] = line;
        }
    }

    public static void exit() {
        if (depth > 0) {
            depth--;
        }
    }

    // exception leaving current method, save where it happened then pop frame
    public static Throwable unwind(Throwable t) {
        caught(t);
        exit();
        return t;
    }

    // exception got to a catch/finally block, save where it happened
    public static void caught(Throwable t) {
        if (!snapshots.containsKey(t)) {
            StackTraceElement[] frames = new StackTraceElement[depth];
            for (int i = 0; i < depth; i++) {
                int f = depth - 1 - i;
                frames[i] = new StackTraceElement(classes[f], methods[f], files[f], lines[f]);
            }
            snapshots.put(t, frames);
        }
    }

    // cheerpj ArithmeticException has no "/ by zero" msg so int division and
    // remainder in student code go through these

    public static int idiv(int a, int b) {
        if (b == 0) {
            throw new ArithmeticException("/ by zero");
        }
        return a / b;
    }

    public static int irem(int a, int b) {
        if (b == 0) {
            throw new ArithmeticException("/ by zero");
        }
        return a % b;
    }

    public static long ldiv(long a, long b) {
        if (b == 0) {
            throw new ArithmeticException("/ by zero");
        }
        return a / b;
    }

    public static long lrem(long a, long b) {
        if (b == 0) {
            throw new ArithmeticException("/ by zero");
        }
        return a % b;
    }

    // cheerpj AIOOBE has no message (java 8 gives the index) so array reads/writes
    // get bounds checked here first. null arrays left to the real access (normal NPE)

    private static void check(int index, int length) {
        if (index < 0 || index >= length) {
            throw new ArrayIndexOutOfBoundsException(String.valueOf(index));
        }
    }

    // before AALOAD, the original instruction still does the actual read
    public static void checkIndex(Object[] a, int i) {
        if (a != null) {
            check(i, a.length);
        }
    }

    public static int iaload(int[] a, int i) {
        if (a != null) {
            check(i, a.length);
        }
        return a[i];
    }

    public static long laload(long[] a, int i) {
        if (a != null) {
            check(i, a.length);
        }
        return a[i];
    }

    public static float faload(float[] a, int i) {
        if (a != null) {
            check(i, a.length);
        }
        return a[i];
    }

    public static double daload(double[] a, int i) {
        if (a != null) {
            check(i, a.length);
        }
        return a[i];
    }

    // BALOAD reads both byte[] and boolean[]
    public static int baload(Object a, int i) {
        if (a instanceof boolean[]) {
            boolean[] b = (boolean[]) a;
            check(i, b.length);
            return b[i] ? 1 : 0;
        }
        byte[] b = (byte[]) a;
        if (b != null) {
            check(i, b.length);
        }
        return b[i];
    }

    public static char caload(char[] a, int i) {
        if (a != null) {
            check(i, a.length);
        }
        return a[i];
    }

    public static short saload(short[] a, int i) {
        if (a != null) {
            check(i, a.length);
        }
        return a[i];
    }

    public static void iastore(int[] a, int i, int v) {
        if (a != null) {
            check(i, a.length);
        }
        a[i] = v;
    }

    public static void lastore(long[] a, int i, long v) {
        if (a != null) {
            check(i, a.length);
        }
        a[i] = v;
    }

    public static void fastore(float[] a, int i, float v) {
        if (a != null) {
            check(i, a.length);
        }
        a[i] = v;
    }

    public static void dastore(double[] a, int i, double v) {
        if (a != null) {
            check(i, a.length);
        }
        a[i] = v;
    }

    // also does the element type check cheerpj skips (eg String into Integer[] held as Object[])
    public static void aastore(Object[] a, int i, Object v) {
        if (a != null) {
            check(i, a.length);
            if (v != null && !a.getClass().getComponentType().isInstance(v)) {
                throw new ArrayStoreException(v.getClass().getName());
            }
        }
        a[i] = v;
    }

    // BASTORE writes both byte[] and boolean[]
    public static void bastore(Object a, int i, int v) {
        if (a instanceof boolean[]) {
            boolean[] b = (boolean[]) a;
            check(i, b.length);
            b[i] = (v & 1) != 0;
            return;
        }
        byte[] b = (byte[]) a;
        if (b != null) {
            check(i, b.length);
        }
        b[i] = (byte) v;
    }

    public static void castore(char[] a, int i, int v) {
        if (a != null) {
            check(i, a.length);
        }
        a[i] = (char) v;
    }

    public static void sastore(short[] a, int i, int v) {
        if (a != null) {
            check(i, a.length);
        }
        a[i] = (short) v;
    }

    // replaces e.printStackTrace() in student code so caught ones show line numbers too
    public static void printStackTrace(Throwable t) {
        t = translate(t);
        repair(t);
        t.printStackTrace();
    }

    // cheerpj reports browser stack overflow as ArithmeticException with no message.
    // student divisions always have "/ by zero" (see idiv) so a msg-less one is
    // either stack overflow (deep stack) or div by zero inside library code.
    // returns what the jdk would have thrown, keeping tracked lines
    static Throwable translate(Throwable t) {
        StackTraceElement[] tracked = snapshots.get(t);
        if (t.getClass() != ArithmeticException.class || t.getMessage() != null || tracked == null) {
            return t;
        }
        Throwable fixed = tracked.length >= 100 ? new StackOverflowError() : new ArithmeticException("/ by zero");
        fixed.setStackTrace(t.getStackTrace());
        snapshots.put(fixed, snapshots.remove(t));
        return fixed;
    }

    // put tracked line numbers into t and its causes
    static void repair(Throwable t) {
        Map<Throwable, Boolean> seen = new IdentityHashMap<Throwable, Boolean>();
        for (Throwable c = t; c != null && !seen.containsKey(c); c = c.getCause()) {
            seen.put(c, Boolean.TRUE);
            repairOne(c);
        }
    }

    // swap student frames for tracked ones (same class and method, in order),
    // drop LineTracker frames and stop at the launcher so the trace ends at main()
    // like the java command
    private static void repairOne(Throwable t) {
        StackTraceElement[] tracked = snapshots.remove(t);
        if (tracked == null) {
            tracked = new StackTraceElement[0];
        }
        StackTraceElement[] trace = t.getStackTrace();
        List<StackTraceElement> frames = new ArrayList<StackTraceElement>();
        int next = 0;
        boolean reachedLauncher = false;
        for (StackTraceElement f : trace) {
            String c = f.getClassName();
            if (c.startsWith("sun.reflect.") || c.startsWith("jdk.internal.reflect.")
                    || c.equals("java.lang.reflect.Method") || c.equals(Launcher.class.getName())) {
                reachedLauncher = true;
                break;
            }
            if (c.equals(LineTracker.class.getName())) {
                continue;
            }
            if (studentClasses.contains(c) && next < tracked.length
                    && tracked[next].getClassName().equals(c)
                    && tracked[next].getMethodName().equals(f.getMethodName())) {
                f = tracked[next++];
            }
            frames.add(f);
        }
        // jvms that cap traces (hotspot keeps 1024) lose the bottom frames of deep
        // recursion, tracked stack still has them
        if (!reachedLauncher && trace.length >= MAX_TRACE) {
            while (next < tracked.length && frames.size() < MAX_TRACE) {
                frames.add(tracked[next++]);
            }
        }
        if (frames.size() > MAX_TRACE) {
            frames = frames.subList(0, MAX_TRACE);
        }
        t.setStackTrace(frames.toArray(new StackTraceElement[0]));
    }
}
