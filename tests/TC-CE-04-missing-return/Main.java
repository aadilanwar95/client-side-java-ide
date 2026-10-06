public class Main {
    static String grade(int mark) {
        if (mark >= 70) {
            return "First";
        } else if (mark >= 40) {
            return "Pass";
        }
    }

    public static void main(String[] args) {
        System.out.println(grade(65));
    }
}
