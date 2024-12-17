// Edge cases for parser testing

// Variable declarations with different patterns
const constVar = "test";
let letVar = "test";
var varVariable = "test";

// Arrow functions with different patterns
const arrowConst = () => {};
export const exportedArrow = () => {};
const asyncArrow = async () => {};

// Function declarations with different patterns
function plainFunction() {}
const functionExpression = function() {};
const namedFunctionExpression = function named() {};

// Class with static members
class StaticTest {
    static staticMethod() {}
    static staticProp = "test";
}

// Multiple declarations in one statement
const func1 = () => {}, 
    func2 = () => {},
    func3 = function() {};

// Decorated class
@decorator
class DecoratedClass {
    @methodDecorator
    method() {}
}

// Function overloads
function overloaded(x: string): string;
function overloaded(x: number): number;
function overloaded(x: any): any {
    return x;
}

// Immediately Invoked Function Expression (IIFE)
(function() {
    function shouldNotBeVisible() {}
})();

// Object with method definitions
const obj = {
    method1() {},
    method2: function() {},
    method3: () => {}
};

// Export named with rename
export { plainFunction as renamed };

// Re-export
export * from './test2';
export { ExportedClass } from './test2';
