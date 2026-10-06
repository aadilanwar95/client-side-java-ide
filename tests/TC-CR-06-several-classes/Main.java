interface Shape {
    double area();
}

class Rectangle implements Shape {
    private final double width;
    private final double height;

    Rectangle(double width, double height) {
        this.width = width;
        this.height = height;
    }

    public double area() {
        return width * height;
    }

    @Override
    public String toString() {
        return "Rectangle " + width + " x " + height;
    }
}

class Square extends Rectangle {
    Square(double side) {
        super(side, side);
    }

    @Override
    public String toString() {
        return "Square, " + super.toString();
    }
}

class Circle implements Shape {
    private final double radius;

    Circle(double radius) {
        this.radius = radius;
    }

    public double area() {
        return Math.PI * radius * radius;
    }

    @Override
    public String toString() {
        return "Circle r=" + radius;
    }
}

public class Main {
    public static void main(String[] args) {
        Shape[] shapes = {new Rectangle(2, 3), new Square(4), new Circle(1)};
        double total = 0;
        for (Shape s : shapes) {
            System.out.println(s + " has area " + s.area());
            total += s.area();
        }
        System.out.printf("Total area: %.3f%n", total);
    }
}
