export default function ActionStrategy() {
  return (
    <s-page heading="Action & Strategy">
      <s-section heading="Business Decisions">
        <s-paragraph>
          What should be done next?
        </s-paragraph>

        <s-paragraph>
         Use the AI Business Advisor to turn Store IQ analysis into practical
priorities and recommended next actions.
        </s-paragraph>
        <s-button href="/app/ai-business-advisor">
  Open AI Business Advisor
</s-button>
      </s-section>
      <s-section heading="Seasonal & Marketing Intelligence">
  <s-paragraph>
    Plan ahead with seasonal trends, holiday planning, marketing activity, and
    campaign performance intelligence.
  </s-paragraph>
  <s-button href="/app/seasonal-marketing-intelligence">
    Open Seasonal & Marketing Intelligence
  </s-button>
</s-section>
    </s-page>
  );
}