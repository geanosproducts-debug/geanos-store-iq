import { useEffect, useState } from "react";
import { useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import { processPhoto } from "../services/photo-processor.server";

const MAX_FILE_SIZE = 20 * 1024 * 1024;
export async function action({ request }) {
  await authenticate.admin(request);

  const formData = await request.formData();
  const imageFile = formData.get("image");
  const rightsConfirmed = formData.get("rightsConfirmed");
  const processingChoice = formData.get("processingChoice");
  const sourceLanguage = formData.get("sourceLanguage");

  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
  const allowedChoices = ["translate", "cleanup", "both"];
  const allowedLanguages = [
    "auto",
    "chinese",
    "japanese",
    "korean",
    "other",
  ];

  if (rightsConfirmed !== "true") {
    return {
      error: "Content-rights confirmation is required before processing.",
    };
  }

  if (!imageFile || typeof imageFile.arrayBuffer !== "function") {
    return {
      error: "Please upload a valid image.",
    };
  }

  if (!allowedTypes.includes(imageFile.type)) {
    return {
      error: "The uploaded image must be JPG, PNG or WEBP.",
    };
  }

  if (imageFile.size > MAX_FILE_SIZE) {
    return {
      error: "The uploaded image must be 20 MB or smaller.",
    };
  }

  if (!allowedChoices.includes(processingChoice)) {
    return {
      error: "Please select a valid processing option.",
    };
  }

  if (!allowedLanguages.includes(sourceLanguage)) {
    return {
      error: "Please select a valid source language.",
    };
  }

  try {
    const result = await processPhoto({
      imageFile,
      processingChoice,
      sourceLanguage,
    });

    return {
      completedImageUrl: `data:${result.mimeType};base64,${result.imageBase64}`,
    };
  } catch (error) {
    console.error("Photo processing failed:", error);

    return {
      error:
        error instanceof Error
          ? error.message
          : "The photo could not be processed.",
    };
  }
}

export default function PhotoCleanup() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [error, setError] = useState("");
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [analysisStarted, setAnalysisStarted] = useState(false);
  const [processingChoice, setProcessingChoice] = useState("both");
  const [sourceLanguage, setSourceLanguage] = useState("auto");
const fetcher = useFetcher();
const isProcessing = fetcher.state !== "idle";
const completedImageUrl = fetcher.data?.completedImageUrl;
const processingError = fetcher.data?.error;

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  function handleFileChange(event) {
    const file = event.target.files?.[0];

    setError("");

    if (!file) {
      setSelectedFile(null);
      setPreviewUrl("");
      return;
    }

    if (!file.type.startsWith("image/")) {
      setError("Please select a valid image file.");
      event.target.value = "";
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setError("The image must be 20 MB or smaller.");
      event.target.value = "";
      return;
    }

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  }

  function clearImage() {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setSelectedFile(null);
    setPreviewUrl("");
    setError("");
    setRightsConfirmed(false);
setAnalysisStarted(false);
  }
function startPhotoAnalysis() {
  if (!selectedFile || !rightsConfirmed || isProcessing) {
    return;
  }

  const formData = new FormData();

  formData.append("image", selectedFile);
  formData.append("rightsConfirmed", "true");
  formData.append("processingChoice", processingChoice);
  formData.append("sourceLanguage", sourceLanguage);

  fetcher.submit(formData, {
    method: "post",
    encType: "multipart/form-data",
  });
}

  return (
    <s-page heading="Photo Translator & Cleanup">
      <s-section>
        <s-button href="/app/media-tools">
          Back to Media Tools
        </s-button>
      </s-section>

      <s-section heading="Upload Photo">
        <s-paragraph>
          Upload a product photo to translate visible text, remove authorised
          watermarks or overlays, and preview the completed image.
        </s-paragraph>

        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={handleFileChange}
        />

        <s-paragraph>
          Accepted formats: JPG, PNG and WEBP. Maximum file size: 20 MB.
        </s-paragraph>

        {error && (
          <s-banner tone="critical">
            {error}
          </s-banner>
        )}
      </s-section>

      {selectedFile && (
        <s-section heading="Original Photo">
          <s-paragraph>
            File: {selectedFile.name}
          </s-paragraph>

          <img
            src={previewUrl}
            alt="Uploaded product preview"
            style={{
              display: "block",
              maxWidth: "100%",
              maxHeight: "500px",
              borderRadius: "8px",
            }}
          />

          <s-button onClick={clearImage}>
            Remove Photo
          </s-button>
        </s-section>
      )}

      <s-section heading="Content Rights">
        <label>
          <input
            type="checkbox"
            checked={rightsConfirmed}
            onChange={(event) => setRightsConfirmed(event.target.checked)}
          />{" "}
         I confirm that I own this media or have permission to translate,
modify and remove its watermarks or overlays for promotional purposes
in my store or stores only.
        </label>
      </s-section>

      <s-section heading="Processing Options">
        <s-unordered-list>
          <s-list-item>Detect visible text in the photo</s-list-item>
          <s-list-item>Translate detected text into English</s-list-item>
          <s-list-item>Remove authorised watermarks or overlays</s-list-item>
          <s-list-item>Preview the completed photo before download</s-list-item>
        </s-unordered-list>

        <s-button
  variant="primary"
  disabled={!selectedFile || !rightsConfirmed}
  onClick={() => setAnalysisStarted(true)}
>
  Analyse Photo
</s-button>
      </s-section>
{analysisStarted && selectedFile && (
  <s-section heading="Photo Analysis Setup">
    <s-banner tone="success">
      Photo accepted. Choose the work required before processing begins.
    </s-banner>

    <s-paragraph>
      Selected photo: {selectedFile.name}
    </s-paragraph>

    <label>
      Original language
      <br />
      <select
        value={sourceLanguage}
        onChange={(event) => setSourceLanguage(event.target.value)}
      >
        <option value="auto">Detect automatically</option>
        <option value="chinese">Chinese</option>
        <option value="japanese">Japanese</option>
        <option value="korean">Korean</option>
        <option value="other">Other language</option>
      </select>
    </label>

    <fieldset>
      <legend>Choose the required processing</legend>

      <label>
        <input
          type="radio"
          name="processingChoice"
          value="translate"
          checked={processingChoice === "translate"}
          onChange={(event) => setProcessingChoice(event.target.value)}
        />{" "}
        Detect and translate visible text into English
      </label>

      <br />

      <label>
        <input
          type="radio"
          name="processingChoice"
          value="cleanup"
          checked={processingChoice === "cleanup"}
          onChange={(event) => setProcessingChoice(event.target.value)}
        />{" "}
        Remove authorised watermarks or overlays
      </label>

      <br />

      <label>
        <input
          type="radio"
          name="processingChoice"
          value="both"
          checked={processingChoice === "both"}
          onChange={(event) => setProcessingChoice(event.target.value)}
        />{" "}
        Translate visible text and remove authorised overlays
      </label>
    </fieldset>

   <s-button
  variant="primary"
  disabled={isProcessing}
  onClick={startPhotoAnalysis}
>
  {isProcessing ? "Processing Photo..." : "Start Photo Analysis"}
</s-button>
  </s-section>
)}
{processingError && (
  <s-section heading="Photo Processing Error">
    <s-banner tone="critical">
      {processingError}
    </s-banner>
  </s-section>
)}

{completedImageUrl && (
  <s-section heading="Completed Photo">
    <s-banner tone="success">
      Photo processing completed successfully. Review the result before
      downloading it.
    </s-banner>

    <img
      src={completedImageUrl}
      alt="Completed translated and cleaned product"
      style={{
        display: "block",
        maxWidth: "100%",
        maxHeight: "600px",
        marginTop: "16px",
        borderRadius: "8px",
      }}
    />

    <p>
      <a
        href={completedImageUrl}
        download="GEANOS-completed-photo.png"
      >
        Download Completed Photo
      </a>
    </p>
  </s-section>
)}
    </s-page>
  );
}