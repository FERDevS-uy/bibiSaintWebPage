export default interface Category {
  name: string;
  count: number;
  subcategories: subCategory[];
}

export interface subCategory {
  name: string;
  count: number
}