export default function InventoryThresholds() {
  return (
    <s-stack direction="block" gap="small">
      <s-paragraph>
        Out of Stock: zero units or fewer
      </s-paragraph>

      <s-paragraph>
        Low Stock: between 1 and 10 units
      </s-paragraph>

      <s-paragraph>
        High Stock: more than 50 units
      </s-paragraph>
    </s-stack>
  );
}