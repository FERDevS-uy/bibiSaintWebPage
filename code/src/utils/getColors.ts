// types/color.ts (opcional pero recomendado)
export interface ColorMatch {
    name: string;
    matchWords: string[];
  }
  
  
  // ---------------- FILE: getColors.ts ------------------
  
  export const colorDictionary: Record<string, string[]> = {
    rojo: ["rojo", "rojizo", "bordó", "vino", "carmesí"],
    azul: ["azul", "azulado", "celeste", "turquesa", "marino"],
    negro: ["negro", "oscuro", "carbón", "grafito"],
    blanco: ["blanco", "marfil", "beige", "crema", "manteca"],
    verde: ["verde", "oliva", "esmeralda", "pasto"],
    amarillo: ["amarillo", "dorado", "mostaza"],
  };
  
  
  export function getColors(description: string): string[] {
    if (!description) return [];
  
    const text = description.toLowerCase();
  
    const matched: string[] = [];
  
    // recorrer diccionario
    Object.entries(colorDictionary).forEach(([baseColor, variations]) => {
      const found = variations.some(v => {
        // caso estricto: rojo, azul, verde...
        if (text.includes(v)) return true;
  
        // caso con palabra exacta (evita coincidencias dentro de otras)
        const regex = new RegExp(`\\b${v}\\b`, "i");
        return regex.test(text);
      });
  
      if (found) matched.push(baseColor);
    });
  
    // unique + sorted
    return [...new Set(matched)].sort();
  }
  export default getColors;