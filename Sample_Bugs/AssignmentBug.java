public class AssignmentBug {  
    public static void main(String[] args) {
        int x = 10;

        if (x = 5) {
            System.out.println("x is 5");
        } else {
            System.out.println("x is not 5");
        }
    }
}
