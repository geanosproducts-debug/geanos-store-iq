export default function BusinessAnalysis() {
  return (
    <s-page heading="Business Analysis">
      <s-section heading="Understanding the Business">
        <s-paragraph>
          Why is it happening?
        </s-paragraph>

        <s-stack direction="block" gap="base">
          <s-link href="/app/understanding-products">
            Understanding the Products
          </s-link>

          <s-link href="/app/business-intelligence">
            Business Intelligence
          </s-link>
        </s-stack>
      </s-section>
    </s-page>
  );
}