import OpenAI, { toFile } from "openai";

const ALLOWED_LANGUAGES = {
  auto: "the language detected automatically",
  chinese: "Chinese",
  japanese: "Japanese",
  korean: "Korean",
  other: "the detected source language",
};

function createPrompt(processingChoice, sourceLanguage) {
  const language =
    ALLOWED_LANGUAGES[sourceLanguage] || ALLOWED_LANGUAGES.auto;

  const preserveInstructions = `
Preserve the original product, composition, dimensions, colours, lighting,
background and every detail that does not require editing. Do not add new
products, logos, promotional claims or decorative elements.
`;

  if (processingChoice === "cleanup") {
    return `
Edit this authorised product photo using the supplied mask. Remove only the
watermark or unwanted overlay inside the transparent painted part of the mask.
Reconstruct the background naturally inside that area. Do not remove, replace,
translate or alter any text or pixels outside the transparent masked area.
${preserveInstructions}
`;
  }

  return `
Edit this authorised product photo. Detect visible text in ${language} and
replace it with accurate, natural, customer-facing retail English. Translate
the meaning rather than producing awkward word-for-word English. Use concise
phrasing that an English-speaking online store would normally display. For
example, translate wording meaning a large available quantity as "Plenty in
Stock", never "Mass In Stock". Place each English translation in the same
location and use a closely matching size, colour and style. Do not remove
unselected logos or watermarks. ${preserveInstructions}
`;
}

export async function processPhoto({
  imageFile,
  maskFile,
  processingChoice,
  sourceLanguage,
}) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("The OpenAI API key is not configured.");
  }

  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const image = await toFile(
    new Uint8Array(await imageFile.arrayBuffer()),
    imageFile.name || "uploaded-photo.png",
    { type: imageFile.type || "image/png" },
  );

  const request = {
    model: "gpt-image-2",
    image,
    prompt: createPrompt(processingChoice, sourceLanguage),
    quality: "medium",
    size: "auto",
  };

  if (processingChoice === "cleanup") {
    if (!maskFile || typeof maskFile.arrayBuffer !== "function") {
      throw new Error("Paint over the watermark before processing.");
    }

    request.mask = await toFile(
      new Uint8Array(await maskFile.arrayBuffer()),
      "painted-removal-mask.png",
      { type: "image/png" },
    );
  }

  const response = await client.images.edit(request);
  const completedImage = response.data?.[0]?.b64_json;

  if (!completedImage) {
    throw new Error("OpenAI did not return a completed image.");
  }

  return {
    imageBase64: completedImage,
    mimeType: "image/png",
  };
}
