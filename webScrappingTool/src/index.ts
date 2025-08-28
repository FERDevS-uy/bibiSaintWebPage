import fs from 'fs/promises'
import Papa from 'papaparse'

const base_URL =
  "https://api.nuvex.uy/catalog/search/?category=null&page=<page>&s=&ordering=-updated_at";
const cantPostsPerPage = 20;
const csvFilePath = "data/result.csv"

export default interface Product {
  id: string;
  producto: string;
  description: string;
  precio: string;
  imagen: string; // [<imageLink>]
  categorias: string; // [<category>]
  linkPago: string
}

async function scrap(): Promise<void> {
    const totalPages = await getTotalPages();
    const res: Product[] = [];

  try {
    for(let pag = 1; pag <= totalPages; pag++){
        console.log(`Consultando página ${pag}...`);
        const data = await getInfoPage(pag)
        res.push(...data)
    }

  } catch (error) {
    console.error("Hubo un error al consultar la API: ", error);
  }

  try {
    const csv = Papa.unparse(res)
    fs.writeFile(csvFilePath, csv)
    
  } catch (error) {
    console.error("Hubo un error al guardar el archivo: ", error)
  }
}

async function getTotalPages(): Promise<number> {
    /* Primera página */
    const res = await fetch(base_URL.replace("<page>", "1"));
    if (!res.ok)
      throw new Error(
        `Error en la solicitud: ${res.status} - ${res.statusText}`
      );

    const data = await res.json();
    const count = data.count;
    const totalPages = Math.ceil(count / cantPostsPerPage);

    return totalPages
}

async function getInfoPage(page: number):Promise<Product[]>{
    const url = base_URL.replace("<page>", String(page))
    const res = await fetch(url)
    if (!res.ok)
      throw new Error(
        `Error en la solicitud: ${res.status} - ${res.statusText}`
      );

    const {data} = await res.json()
    return data.map((d: any) => ({
        id: d.id,
        producto: d.name,
        description: d.description,
        precio: d.price,
        categorias: d.category_data.name,
        imagen: d.image_1.full_size,
        linkPago: "<paymentLink>"
    }))
}

scrap();
