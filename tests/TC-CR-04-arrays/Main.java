import java.util.Arrays;

public class Main {
    public static void main(String[] args) {
        int[] numbers = {42, 7, 19, 3, 25};
        int sum = 0;
        int max = numbers[0];
        for (int n : numbers) {
            sum += n;
            if (n > max) {
                max = n;
            }
        }
        System.out.println("Sum: " + sum);
        System.out.println("Max: " + max);

        Arrays.sort(numbers);
        System.out.println(Arrays.toString(numbers));

        int[][] grid = new int[3][4];
        for (int r = 0; r < grid.length; r++) {
            for (int c = 0; c < grid[r].length; c++) {
                grid[r][c] = r * c;
            }
        }
        System.out.println(Arrays.deepToString(grid));

        String[] names = new String[3];
        names[0] = "Ada";
        names[2] = "Linus";
        System.out.println(Arrays.toString(names));

        double[] copy = Arrays.copyOf(new double[] {1.5, 2.5}, 4);
        System.out.println(Arrays.toString(copy));
    }
}
