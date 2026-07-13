import type { APIRoute } from "astro";
import { getSupabaseAdmin } from "../../../server/supabase";
import { verifyAdmin } from "../../../server/auth";

export const POST: APIRoute = async ({ request }) => {
  if (!await verifyAdmin(request)) {
    return new Response(JSON.stringify({ error: "No autorizado" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return new Response(JSON.stringify({ error: "Archivo no recibido" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    if (file.size > 5 * 1024 * 1024) {
      return new Response(JSON.stringify({ error: "La imagen no puede superar los 5 MB" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!ext || !["jpg", "jpeg", "png", "webp"].includes(ext)) {
      return new Response(JSON.stringify({ error: "Formato no soportado. Usá jpg, jpeg, png o webp" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    const supabase = getSupabaseAdmin();
    const fileName = `${Date.now()}_${file.name}`;
    const arrayBuffer = await file.arrayBuffer();
    const { error: uploadError } = await supabase.storage
      .from("product-images")
      .upload(fileName, arrayBuffer, {
        contentType: file.type,
      });

    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage
      .from("product-images")
      .getPublicUrl(fileName);

    if (!urlData?.publicUrl) {
      throw new Error("No se pudo obtener la URL pública");
    }

    return new Response(JSON.stringify({ data: { url: urlData.publicUrl } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (e: any) {
    console.error("Admin upload image error:", e?.message || e);
    return new Response(JSON.stringify({ error: e?.message || "Error interno" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
};
