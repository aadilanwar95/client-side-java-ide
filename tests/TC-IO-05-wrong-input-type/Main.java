import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner in = new Scanner(System.in);
        System.out.print("How many tickets? ");
        int tickets = in.nextInt();
        System.out.println("You asked for " + tickets + " tickets.");
    }
}
