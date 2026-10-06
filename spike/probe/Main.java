import java.util.ArrayList;
import java.util.List;

public class Main {
    private final int[] data;

    Main(int size) {
        super();
        data = new int[size];
        if (size < 0) throw new IllegalStateException("never");
    }

    static int helper() {
        return 7;
    }

    static int risky(String s) {
        try {
            return Integer.parseInt(s);
        } catch (NumberFormatException e) {
            System.out.println("caught " + e.getMessage());
            return -1;
        } finally {
            System.out.println("finally " + s);
        }
    }

    static void arrays() {
        byte[] b = {1, 2};
        boolean[] z = {true, false};
        char[] c = {'a', 'b'};
        short[] s = {3, 4};
        long[] l = {5L, 6L};
        float[] f = {1.5f, 2.5f};
        double[] d = {0.25, 0.75};
        String[] t = {"x", "y"};
        int[][] grid = new int[2][3];
        b[1] += 10;
        z[1] = !z[0];
        c[0]++;
        s[1] *= 2;
        l[0] = l[1] * 100;
        f[1] /= 2;
        d[0] += d[1];
        t[1] = t[0] + t[1];
        grid[1][2] = 9;
        System.out.println(b[1] + " " + z[1] + " " + c[0] + " " + s[1] + " " + l[0] + " " + f[1] + " " + d[0] + " " + t[1] + " " + grid[1][2]);
        try {
            grid[2][0] = 1;
        } catch (ArrayIndexOutOfBoundsException e) {
            System.out.println("caught " + e);
        }
        try {
            int[] none = null;
            none[0] = 1;
        } catch (NullPointerException e) {
            System.out.println("caught " + e);
        }
        try {
            Object[] objs = new Integer[1];
            objs[0] = "not an Integer";
        } catch (ArrayStoreException e) {
            System.out.println("caught " + e);
        }
        try {
            System.out.println(c[-1]);
        } catch (ArrayIndexOutOfBoundsException e) {
            System.out.println("caught " + e);
        }
    }

    public static void main(String[] args) {
        System.out.println(risky("5") + risky("x"));
        try {
            Object o = null;
            o.toString();
        } catch (NullPointerException e) {
            e.printStackTrace();
        }
        List<Integer> nums = new ArrayList<>();
        nums.add(3);
        nums.forEach(n -> System.out.println("lambda " + n));
        long big = 10L;
        System.out.println(big % 3 + " " + (17 % 5));
        Main m = new Main(2);
        System.out.println(m.data.length);
        arrays();
        int zero = helper() - 7;
        System.out.println(helper() /
            zero);
    }
}
