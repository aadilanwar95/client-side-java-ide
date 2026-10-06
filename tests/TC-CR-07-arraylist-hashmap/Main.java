import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class Main {
    public static void main(String[] args) {
        List<String> fruit = new ArrayList<>();
        fruit.add("pear");
        fruit.add("apple");
        fruit.add("cherry");
        fruit.add("apple");
        System.out.println(fruit);
        System.out.println(fruit.size() + " items, apple at " + fruit.indexOf("apple"));
        fruit.remove("pear");
        Collections.sort(fruit);
        System.out.println(fruit);

        Map<String, Integer> counts = new HashMap<>();
        for (String f : fruit) {
            counts.put(f, counts.getOrDefault(f, 0) + 1);
        }
        System.out.println(counts);
        System.out.println(counts.containsKey("cherry"));
        for (Map.Entry<String, Integer> entry : counts.entrySet()) {
            System.out.println(entry.getKey() + " -> " + entry.getValue());
        }

        List<Integer> squares = new ArrayList<>();
        for (int i = 1; i <= 5; i++) {
            squares.add(i * i);
        }
        squares.removeIf(n -> n % 2 == 0);
        System.out.println(squares);
    }
}
