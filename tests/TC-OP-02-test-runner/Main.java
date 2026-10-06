import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner in = new Scanner(System.in);
        int a = in.nextInt();
        int b = in.nextInt();
        System.out.println("Sum: " + (a + b));
        System.out.println("Larger: " + Math.max(a, b));
    }
}
