public class IfSemicolonBug {
    public static void main(String[] args) {
        int score = 92;

        if (score > 90);
        {
            System.out.println("Great job!");
        }
    }
}
