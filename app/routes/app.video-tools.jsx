import styles from "../styles/media-tools.module.css";

const creditPacks = [10, 25, 50];

export default function VideoTools() {
  return (
    <s-page heading="GEANOS Video Tools">
      <section className={styles.mediaCard}>
        <s-button href="/app" variant="primary">
          ← Back to Store IQ Dashboard
        </s-button>

        <s-button href="/app/media-tools">
          Back to Photo & Video Tools
        </s-button>
      </section>

      <section className={styles.mediaCard}>
        <s-heading>What GEANOS Video Tools Can Do</s-heading>

        <s-paragraph>
          GEANOS Video Tools helps merchants prepare authorised product videos
          for their Shopify stores. Remove unwanted visible writing on one
          dedicated page or translate foreign-language writing into English on
          a separate page.
        </s-paragraph>

        <s-unordered-list>
          <s-list-item>Remove authorised writing and overlays</s-list-item>
          <s-list-item>Translate visible foreign-language text into English</s-list-item>
          <s-list-item>Keep the original video sound</s-list-item>
          <s-list-item>Review and download the completed video</s-list-item>
        </s-unordered-list>

        <s-banner tone="warning">
          Only upload videos that you own or have permission to edit. Process
          one section at a time and keep the page open while processing.
        </s-banner>
      </section>

      <section className={styles.mediaCard}>
        <s-heading>Choose a Video Action</s-heading>

        <s-paragraph>
          Choose one action below. Text removal and text translation use
          separate pages and separate processing workflows.
        </s-paragraph>

        <s-button href="/app/video-cleanup" variant="primary">
          Video Text Removal
        </s-button>

        <s-button href="/app/video-translate" variant="primary">
          Video Text Translate
        </s-button>
      </section>

      <section className={styles.mediaCard}>
        <s-heading>Credit Packs</s-heading>

        <s-paragraph>
          Video processing uses the GEANOS media-credit account. Choose from
          the same credit-pack sizes available through Photo Cleaner.
        </s-paragraph>

        <s-stack direction="inline" gap="base">
          {creditPacks.map((credits) => (
            <s-box key={credits} padding="base" flex-grow="1">
              <s-heading>{credits} Credits</s-heading>
              <s-paragraph>
                One-time media-credit pack purchased securely through Shopify.
              </s-paragraph>
            </s-box>
          ))}
        </s-stack>

        <s-button href="/app/media-credits" variant="primary">
          View Credit Prices and Purchase
        </s-button>
      </section>

      <section className={styles.mediaCard}>
        <s-heading>Video Tools Questions & Answers</s-heading>

        <s-heading>
          Can I remove or translate more than one section of writing?
        </s-heading>
        <s-paragraph>
          Yes. The service works best when completing one section at a time.
          For text removal, mark and process only one script section, then use
          Continue Editing This Video to complete the next section. For
          translation, translate one section at a time because each phrase must
          be translated, the original writing removed, the background repaired,
          and the English wording added. Removing the original writing and
          repairing the background take most of the processing time.
        </s-paragraph>

        <s-heading>How long does processing take?</s-heading>
        <s-paragraph>
          Video editing can take several minutes. Keep the processing page open
          and wait patiently until the completed video appears.
        </s-paragraph>

        <s-heading>Will the original sound be kept?</s-heading>
        <s-paragraph>
          Yes. The working text-removal process restores the original audio to
          the completed video.
        </s-paragraph>

        <s-heading>Do failed processing attempts use a credit?</s-heading>
        <s-paragraph>
          Failed processing attempts are refunded automatically when the media
          credit has been reserved through GEANOS Store IQ.
        </s-paragraph>

        <s-heading>Are uploaded videos stored permanently?</s-heading>
        <s-paragraph>
          Download the completed video before leaving the page. Uploaded and
          completed media should not be treated as permanent storage.
        </s-paragraph>
      </section>
    </s-page>
  );
}
