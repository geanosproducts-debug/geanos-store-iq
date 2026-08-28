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
background and all details that do not require editing. Do not add new
products, logos, promotional claims or decorative elements.
`;

  if (processingChoice === "translate") {
    return `
Edit this authorised product photo. Detect visible text in ${language} and
replace it with accurate, natural English translations. Place each English
translation in the same location and use a closely matching size, colour and
style. ${preserveInstructions}
`;
  }

  if (processingChoice === "cleanup") {
    return `
Edit this authorised product photo. Remove only the visible watermarks or
unwanted overlays that the merchant has permission to remove. Reconstruct the
underlying background naturally. ${preserveInstructions}
`;
  }

  return `
Edit this authorised product photo. Detect visible text in ${language} and
replace it with accurate, natural English translations. Place each English
translation in the same location and use a closely matching size, colour and
style. Also remove only visible watermarks or unwanted overlays that the
merchant has permission to remove, reconstructing the underlying background
naturally. ${preserveInstructions}
`;
}

export async function processPhoto({
  imageFile,
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
    {
      type: imageFile.type || "image/png",
    },
  );

  const response = await client.images.edit({
    model: "gpt-image-2",
    image,
    prompt: createPrompt(processingChoice, sourceLanguage),
    quality: "medium",
    size: "auto",
  });

  const completedImage = response.data?.[0]?.b64_json;

  if (!completedImage) {
    throw new Error("OpenAI did not return a completed image.");
  }

  return {
    imageBase64: completedImage,
    mimeType: "image/png",
  };
}