// TypeScript test file
interface UserInterface {
  name: string;
  age: number;
}

class UserClass {
  private name: string;
  constructor(name: string) {
    this.name = name;
  }
}

function normalFunction() {
  return true;
}

const arrowFunction = () => {
  return false;
}

export async function asyncFunction() {
  return Promise.resolve();
}

// Nested definition (should not be captured as it's not top-level)
function outer() {
  function inner() {
    return null;
  }
}
