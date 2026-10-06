import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner in = new Scanner(System.in);
        String secret = in.nextLine();
        System.out.println("Read " + secret.length() + " characters of input");
        System.out.println("Echo: " + secret);
    }
}
