export default interface CategoryList {
  name: string;
  count: number;
  subcategories?: { name: string; count: number }[];
}