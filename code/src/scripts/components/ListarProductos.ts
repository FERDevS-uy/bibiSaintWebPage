import { getColors } from "../../utils/getColors";

export function initProductFilters() {
  const listItems = [...document.querySelectorAll<HTMLElement>("[data-product-card]")];
  const checkboxes = document.querySelectorAll<HTMLInputElement>(
    '[data-filter-section] input[type="checkbox"]'
  );
  
  if (!listItems.length && !checkboxes.length) return;

  const params = new URLSearchParams(window.location.search);

  function applyFilters(fromURL = false) {
    if (fromURL) {
        checkboxes.forEach((cb) => {
            const urlColors = params.getAll("color").map((c) => c.toLowerCase());
            // console.log(urlColors)
            const colorValue = cb.dataset.color?.toLowerCase() ?? "";
            if (urlColors.includes(colorValue)) {
                cb.checked = true;
            } else {
                cb.checked = false; 
            }
        });
    }

    const selected = [...checkboxes]
      .filter((c) => c.checked)
      .map((c) => c.dataset.color?.toLowerCase() ?? "");
      
    listItems.forEach((li) => {
      // Assuming the structure is <article><div class="box-up"> or similar.
      // The original code was: li.children[0].innerText.toLowerCase();
      // li is the <article> (ItemProductoBox).
      // .children[0] is div.box-up
      // The name is in .p-name inside .info-inner inside .img-info inside .box-up...
      // Original code relied on innerText of first child which might grab all text including name.
      // Let's verify structure of ItemProductoBox.
      // <article> -> div.box-up -> ... -> span.p-name
      // innerText of div.box-up will contain the name.
      
      const name = (li.textContent || "").toLowerCase(); // Use textContent of the whole card or specific element?
      // Original: li.children[0].innerText.toLowerCase();
      // li.children[0] is div.box-up.
      // Let's stick to original logic if it worked, or improve it. 
      // Safest refactor: extract name properly if possible.
      // But textContent includes name.
      
      const colors = getColors(name).map((c) => c.toLowerCase());
      
      if (selected.length === 0 || selected.some((c) => colors.includes(c))) {
        li.style.display = "flex";
      } else {
        li.style.display = "none";
      }
    });
  }

  // Aplicar si hay filtros en la URL
  applyFilters(true);

  // eventos
  function updateFiltersInURL() {
    const selected = [...checkboxes]
      .filter((c) => c.checked)
      .map((c) => c.dataset.color ?? "");
    
    // console.log(selected)
    const newParams = new URLSearchParams(window.location.search);
    newParams.delete("color");
    selected.forEach((c) => newParams.append("color", c));

    // Update URL without reload
    const newUrl = `${window.location.pathname}?${newParams.toString()}`;
    window.history.replaceState({}, "", newUrl);
  
    applyFilters();
  }

  checkboxes.forEach((cb) => cb.addEventListener("change", updateFiltersInURL));
}
