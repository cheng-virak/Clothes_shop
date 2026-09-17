function Section({ title, children }) {
  return (
    <div className="mb-8">
      <h2 className="mb-2 text-lg font-semibold text-stone-900">{title}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-stone-600">{children}</div>
    </div>
  );
}

export default function ShippingReturns() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
      <h1 className="mb-6 text-2xl font-semibold text-stone-900">Shipping &amp; Returns</h1>

      <Section title="Shipping">
        <p>Orders are processed within 1–2 business days. A flat shipping fee is calculated at checkout based on your order.</p>
        <p>Once your order ships, you'll be able to track its status from your order history.</p>
      </Section>

      <Section title="Returns">
        <p>Unworn items with tags attached can be returned within 30 days of delivery for a full refund.</p>
        <p>To start a return, contact us with your order number and we'll walk you through the next steps.</p>
      </Section>

      <Section title="Exchanges">
        <p>Need a different size or color? Return the original item and place a new order — this keeps stock accurate and gets your replacement out faster than a swap.</p>
      </Section>
    </div>
  );
}
