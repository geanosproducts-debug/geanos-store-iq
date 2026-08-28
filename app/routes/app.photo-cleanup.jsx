import { useEffect, useState } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { processPhoto } from "../services/photo-processor.server";
import {
  completeMediaCredit,
  getMediaCreditAccount,
  InsufficientMediaCreditsError,
  refundMediaCredit,
  reserveMediaCredit,
} from "../services/media-credits.server";

const MAX_FILE_SIZE = 20 * 1024 * 1024;
export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  const account = await getMediaCreditAccount(session.shop);

  return {
    creditBalance: account.balance,
  };
}
export async function action({ request }) {
  const { session } = await authenticate.admin(request);

  const formData = await request.formData();
  const imageFile = formData.get("image");
  const rightsConfirmed = formData.get("rightsConfirmed");
  const processingChoice = formData.get("processingChoice");
  const sourceLanguage = formData.get("sourceLanguage");
const requestId = formData.get("requestId");

  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
  const allowedChoices = ["translate", "cleanup"];
  const allowedLanguages = [
    "auto",
    "chinese",
    "japanese",
    "korean",
    "other",
  ];
if (!requestId) {
  return {
    error: "A photo-processing request ID is required.",
  };
}
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

let creditReserved = false;

try {
  await reserveMediaCredit({
    shop: session.shop,
    processingType: processingChoice,
    requestId,
  });

  creditReserved = true;

  const result = await processPhoto({
    imageFile,
    processingChoice,
    sourceLanguage,
  });

  await completeMediaCredit(requestId);

  const account = await getMediaCreditAccount(session.shop);

  return {
    completedImageUrl: `data:${result.mimeType};base64,${result.imageBase64}`,
    creditBalance: account.balance,
  };
} catch (error) {
  if (creditReserved) {
    try {
      await refundMediaCredit(requestId);
    } catch (refundError) {
      console.error("Photo credit refund failed:", refundError);
    }
  }

  console.error("Photo processing failed:", error);

  if (error instanceof InsufficientMediaCreditsError) {
    return {
      error:
        "No photo credits are available. Please purchase or add credits before processing.",
    };
  }

  return {
    error:
      "The photo could not be processed. Please try again. If the problem continues, contact support.",
  };
}
}

export default function PhotoCleanup() {
  const { creditBalance } = useLoaderData();
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [error, setError] = useState("");
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [analysisStarted, setAnalysisStarted] = useState(false);
  const [processingChoice, setProcessingChoice] = useState("translate");
  const [sourceLanguage, setSourceLanguage] = useState("auto");
const fetcher = useFetcher();
const isProcessing = fetcher.state !== "idle";
const [completedImageUrl, setCompletedImageUrl] = useState("");
const [processingError, setProcessingError] = useState("");
const displayedCreditBalance =
  fetcher.data?.creditBalance ?? creditBalance;

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

useEffect(() => {
  if (fetcher.data?.completedImageUrl) {
    setCompletedImageUrl(fetcher.data.completedImageUrl);
    setProcessingError("");
  } else if (fetcher.data?.error) {
    setProcessingError(fetcher.data.error);
    setCompletedImageUrl("");
  }
}, [fetcher.data]);

  function handleFileChange(event) {
    const file = event.target.files?.[0];

    setError("");
setCompletedImageUrl("");
setProcessingError("");
setAnalysisStarted(false);
setRightsConfirmed(false);

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
setCompletedImageUrl("");
setProcessingError("");
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
formData.append("requestId", crypto.randomUUID());

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
<s-banner tone="warning">
  Processing can take up to 1–2 minutes. Please keep this page open and
  click Start Photo Analysis only once.
</s-banner>

<s-paragraph>
  For best results when both services are required, complete Watermark
  Removal first. Then upload the cleaned photo again and use the Translate
  Visible Text option.
</s-paragraph>
<s-banner>
  Each successfully completed processing run uses 1 photo credit.
  Watermark removal and translation are separate processes and use 1 credit
  each. Failed processing attempts do not use a credit.
</s-banner>
<s-paragraph>
  Available photo credits: {displayedCreditBalance}
</s-paragraph>
<s-paragraph>
  Uploaded and completed photos are not saved in the GEANOS Store IQ
  database. Download the completed photo before leaving or refreshing this
  page.
</s-paragraph>
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

         </fieldset>
{displayedCreditBalance < 1 && (
  <s-banner tone="warning">
    No photo credits are currently available. Add or purchase credits before
    starting photo processing.
  </s-banner>
)}
   <s-button
  variant="primary"
  disabled={isProcessing || displayedCreditBalance < 1}
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

   <div
  style={{
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: "20px",
    marginTop: "16px",
  }}
>
  <div>
    <h3>Before</h3>
    <img
      src={previewUrl}
      alt="Original uploaded product"
      style={{
        display: "block",
        width: "100%",
        maxHeight: "600px",
        objectFit: "contain",
        borderRadius: "8px",
      }}
    />
  </div>

  <div>
    <h3>After</h3>
    <img
      src={completedImageUrl}
      alt="Completed translated or cleaned product"
      style={{
        display: "block",
        width: "100%",
        maxHeight: "600px",
        objectFit: "contain",
        borderRadius: "8px",
      }}
    />
  </div>
</div>

    <p>
      <a
        href={completedImageUrl}
        download="GEANOS-completed-photo.png"
      >
        Download Completed Photo
      </a>
    </p>
<s-button onClick={clearImage}>
  Process Another Photo
</s-button>
  </s-section>
)}
    </s-page>
  );
}