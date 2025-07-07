public class StringComparisonBug{
    public static void main(String[] args) {
        String name = "Alice";
        if (name == "Alice") {
            System.out.println("Hello Alice!");
        } else {
            System.out.println("You're not Alice!");
        }
    }
}

