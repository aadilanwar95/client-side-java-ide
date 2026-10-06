public class Main {
    public static void main(String[] args) {
        for (int i = 1; i <= 15; i++) {
            if (i % 15 == 0) {
                System.out.println("FizzBuzz");
            } else if (i % 3 == 0) {
                System.out.println("Fizz");
            } else if (i % 5 == 0) {
                System.out.println("Buzz");
            } else {
                System.out.println(i);
            }
        }

        int n = 27;
        int steps = 0;
        while (n != 1) {
            n = (n % 2 == 0) ? n / 2 : 3 * n + 1;
            steps++;
        }
        System.out.println("Collatz steps: " + steps);

        int day = 3;
        switch (day) {
            case 1:
                System.out.println("Monday");
                break;
            case 3:
                System.out.println("Wednesday");
                break;
            default:
                System.out.println("Another day");
        }

        String grade = "B";
        switch (grade) {
            case "A":
                System.out.println("Excellent");
                break;
            case "B":
                System.out.println("Good");
                break;
            default:
                System.out.println("Keep going");
        }

        int count = 0;
        do {
            count += 2;
        } while (count < 7);
        System.out.println("count = " + count);
    }
}
