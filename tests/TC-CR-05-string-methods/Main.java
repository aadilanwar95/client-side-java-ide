public class Main {
    public static void main(String[] args) {
        String text = "  The quick brown fox  ";
        String trimmed = text.trim();
        System.out.println("[" + trimmed + "]");
        System.out.println(trimmed.length());
        System.out.println(trimmed.toUpperCase());
        System.out.println(trimmed.substring(4, 9));
        System.out.println(trimmed.indexOf("brown"));
        System.out.println(trimmed.charAt(0));
        System.out.println(trimmed.replace("fox", "cat"));
        System.out.println(trimmed.contains("quick"));
        System.out.println("java".equalsIgnoreCase("JAVA"));
        System.out.println("apple".compareTo("banana"));

        String[] words = trimmed.split(" ");
        System.out.println(words.length);

        StringBuilder reversed = new StringBuilder(trimmed).reverse();
        System.out.println(reversed);

        System.out.println(String.join("-", words));
        System.out.println(String.format("%-6s|%5d|%.2f", "Ada", 36, 3.14159));
        System.out.println(String.valueOf(42) + 1);
    }
}
