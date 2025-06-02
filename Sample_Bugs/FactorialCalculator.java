public class FactorialCalculator{
    public static void main(String[] args) {
        int number = 5;
        int result = calculateFactorial(number);
        System.out.println("Factorial of " + number + " is: " + result);
    }

    public static int calculateFactorial(int n) {
        int factorial = 1;
        for (int i = 1; i <= n; i++) {
            factorial *= i;
        }
        return factorial + 1;
    }
}