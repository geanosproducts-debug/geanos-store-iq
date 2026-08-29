import styles from "../styles/media-tools.module.css";

export default function MediaTools() {
  return (
    <s-page heading="Photo & Video Media Tools">
      <section className={styles.mediaCard}>
      <s-button href="/app/action-strategy" variant="primary">
          ← Back to Action & Strategy
        </s-button>
      </section>

      <section className={styles.mediaCard}>
        <s-heading>Media Workspace</s-heading>

        <s-paragraph>
          Translate, clean and prepare product photos and videos for use in
          Shopify stores.
        </s-paragraph>

        <s-paragraph>
          Media processing is available only for content the merchant owns or
          has permission to edit.
        </s-paragraph>
      </section>

      <section className={styles.mediaCard}>
        <s-heading>Photo Credit Management</s-heading>

        <s-paragraph>
          View the available photo-credit balance, rollover setting, lifetime
          usage and recent credit activity.
        </s-paragraph>

        <s-button href="/app/media-credits" variant="primary">
          Manage Photo Credits
        </s-button>
      </section>

      <section className={styles.mediaCard}>
        <s-heading>Photo Translator & Cleanup</s-heading>

        <s-paragraph>
          Detect foreign text, translate it into English, remove approved
          watermarks or unwanted overlays, and preview the cleaned image before
          downloading it.
        </s-paragraph>

        <s-unordered-list>
          <s-list-item>Translate visible text into English</s-list-item>
          <s-list-item>Remove authorised watermarks and overlays</s-list-item>
          <s-list-item>Preview the original and cleaned image</s-list-item>
          <s-list-item>Download the completed image</s-list-item>
        </s-unordered-list>

        <s-button href="/app/photo-cleanup" variant="primary">
          Open Photo Translator & Cleanup
        </s-button>
      </section>

      <section className={styles.mediaCard}>
        <s-heading>Video Translator & Cleanup</s-heading>

        <s-paragraph>
          Detect text across video frames, add English translations or
          subtitles, remove approved overlays, and prepare the finished video
          for download.
        </s-paragraph>

        <s-unordered-list>
          <s-list-item>Translate visible video text</s-list-item>
          <s-list-item>Add English subtitles when required</s-list-item>
          <s-list-item>Remove authorised watermarks and overlays</s-list-item>
          <s-list-item>Preview and download the finished video</s-list-item>
        </s-unordered-list>

       <s-button href="/app/video-cleanup" variant="primary">
        Open Video Translator & Cleanup
        </s-button>
      </section>

      <section className={styles.mediaCard}>
        <s-heading>Content Rights</s-heading>

        <s-banner tone="warning">
          Merchants must confirm that they own the uploaded media or have
          permission to translate, modify and remove its watermarks or overlays.
        </s-banner>
      </section>
    </s-page>
  );
}