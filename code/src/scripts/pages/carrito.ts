import renderCart from "../../utils/renderCart";

export function initCartPage() {
  const clearBtn = document.getElementById("clearBtn") as HTMLButtonElement;

  if (clearBtn) {
    clearBtn.onclick = () => {
      localStorage.removeItem("carrito");
      window.updateCartCount && window.updateCartCount();
      // Re-render to show empty state immediately
      renderCart(); 
    };
  }
  
  renderCart();
}
