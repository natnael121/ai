/**
 * Uploads a single image file directly from the browser to ImageBB.
 * Doing this client-side (rather than proxying through /api) keeps
 * large image bytes off the Vercel serverless functions, which have
 * small payload/time limits — important since researchers may upload
 * 100+ screenshots at once.
 */

const IMAGEBB_ENDPOINT = "https://api.imgbb.com/1/upload";

export interface ImageBbResult {
  imageUrl: string;
  deleteUrl: string;
  thumbUrl?: string;
}

export async function uploadToImageBb(file: File): Promise<ImageBbResult> {
  const apiKey = import.meta.env.VITE_IMAGEBB_API_KEY;
  if (!apiKey) {
    throw new Error("VITE_IMAGEBB_API_KEY is not set");
  }

  const formData = new FormData();
  formData.append("image", file);

  const response = await fetch(`${IMAGEBB_ENDPOINT}?key=${apiKey}`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`ImageBB upload failed (${response.status}): ${text}`);
  }

  const json = await response.json();
  if (!json.success) {
    throw new Error(`ImageBB upload failed: ${JSON.stringify(json)}`);
  }

  return {
    imageUrl: json.data.url as string,
    deleteUrl: json.data.delete_url as string,
    thumbUrl: json.data.thumb?.url as string | undefined,
  };
}
