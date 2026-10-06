public class Main {
    static int[] readings = {12, 15, 9};

    static double average(int[] values, int count) {
        int sum = 0;
        for (int i = 0; i <= count; i++) {
            sum += values[i];
        }
        return (double) sum / count;
    }

    static void report() {
        System.out.println("Average: " + average(readings, readings.length));
    }

    public static void main(String[] args) {
        System.out.println("Readings: " + readings.length);
        report();
    }
}
