import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner in = new Scanner(System.in);
        int count = in.nextInt();
        double total = 0;
        for (int i = 1; i <= count; i++) {
            double mark = in.nextDouble();
            total += mark;
            System.out.println("Mark " + i + ": " + mark);
        }
        in.nextLine();
        String comment = in.nextLine();
        System.out.println("Average: " + total / count);
        System.out.println("Comment: " + comment);
        System.out.println("More input? " + in.hasNextLine());
    }
}
