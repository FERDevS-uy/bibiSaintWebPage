export {};

// necesario para que no de errores de typescript
declare global {
  interface Window {
    updateCartCount?: () => void;
  }
}
