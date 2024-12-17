// Testing different TypeScript patterns

// Type definitions
type CustomType = string | number;

// Interfaces with extends
interface BaseInterface {
  id: number;
}

interface ExtendedInterface extends BaseInterface {
  name: string;
}

// Abstract class
abstract class AbstractBase {
  abstract doSomething(): void;
}

// Class with implements
class Implementation implements BaseInterface {
  id: number = 1;
}

// Namespace
namespace TestNamespace {
  export class NamespacedClass {}
}

// Module augmentation
declare module 'some-module' {
  interface ModuleInterface {
    newProp: string;
  }
}

// Enum
enum Status {
  Active,
  Inactive
}

// Generic class
class GenericClass<T> {
  value: T;
  constructor(value: T) {
    this.value = value;
  }
}

// Export declarations
export const exportedVar = 'test';
export function exportedFunction() {}
export class ExportedClass {}

// Default export
export default class DefaultExport {}
