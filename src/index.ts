export interface GreetingOptions {
  name: string;
  greeting?: string;
}

export function greet(options: GreetingOptions): string {
  const { name, greeting = 'Hello' } = options;
  return `${greeting}, ${name}!`;
}

export function add(a: number, b: number): number {
  return a + b;
}

export function multiply(a: number, b: number): number {
  return a * b;
}

export default {
  greet,
  add,
  multiply,
};