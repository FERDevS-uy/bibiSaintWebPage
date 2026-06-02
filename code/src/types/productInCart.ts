export default interface ProductInCart {
    id: string;
    name: string;
    price: string;
    cantidad: number;
    img: string;
    selectedColorId?: number | null;
    selectedColorName?: string | null;
}