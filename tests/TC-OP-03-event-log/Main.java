public class Main {
    public static void main(String[] args) {
        int[] values = {4, 8, 15, 16, 23, 42};
        int sum = 0;
        for (int v : values) {
            sum += v;
        }
        System.out.println("Sum: " + sum);
    }
}
