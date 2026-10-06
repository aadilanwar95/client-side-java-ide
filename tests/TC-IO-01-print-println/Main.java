public class Main {
    public static void main(String[] args) {
        System.out.print("No newline, ");
        System.out.print("still the same line");
        System.out.println();
        System.out.println("A full line");
        System.out.println(3.5);
        System.out.println(true);
        System.out.println('x');
        System.out.println();
        System.out.printf("%d + %d = %d%n", 2, 3, 5);
        System.out.print("Tab\tseparated\n");
        System.out.println("Unicode: caf\u00e9");
    }
}
