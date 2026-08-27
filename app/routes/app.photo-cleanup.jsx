import { useEffect, useState } from "react";

const MAX_FILE_SIZE = 20 * 1024 * 1024;

export default function PhotoCleanup() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [error, setError] = useState("");
  const [rightsConfirmed, setRightsConfirmed] = useState(false);

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
        >
          Analyse Photo - Next Build
        </s-button>
      </s-section>
    </s-page>
  );
}