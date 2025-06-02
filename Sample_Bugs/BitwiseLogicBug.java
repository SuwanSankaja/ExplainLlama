public class BitwiseLogicBug {
    public static void main(String[] args) {
        int temp = 25;
        boolean isSunny = true;

        if (temp > 20 & isSunny) {
            System.out.println("Great day for a walk!");
        }
    }
}
