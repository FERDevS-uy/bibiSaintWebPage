export { };

declare module "*.csv?raw" {
  const content: string;
  export default content;
}

// necesario para que no de errores de typescript
declare global {
  interface Window {
    updateCartCount?: () => void;
    baseUrl?: string;
  }
}
