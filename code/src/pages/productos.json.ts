import { cargarProductos } from "@utils/loadCSV";

export async function GET({ }): Promise<Response> {
    return new Response(JSON.stringify(await cargarProductos()), {
        status: 200,
        headers: {
            "Content-Type": "application/json"
        }
    })
}