public class Main {
    public static void main(String[] args) {
        System.out.println("Starting");
        System.err.println("Warning: this goes to System.err");
        System.out.println("Still running");
        System.err.print("Error output without newline");
        System.err.println();
        System.out.println("Done");
    }
}
