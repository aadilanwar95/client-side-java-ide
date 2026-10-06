import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner in = new Scanner(System.in);
        System.out.print("Age: ");
        int age = in.nextInt();
        in.nextLine();
        System.out.print("Name: ");
        String name = in.nextLine();
        System.out.println();
        System.out.println(name + " will be " + (age + 1) + " next year.");
    }
}
