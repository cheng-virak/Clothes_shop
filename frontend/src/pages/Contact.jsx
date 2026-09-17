export default function Contact() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
      <h1 className="mb-4 text-2xl font-semibold text-stone-900">Contact</h1>
      <p className="text-sm leading-relaxed text-stone-600">
        Questions about an order, a product, or this project? Reach out at{' '}
        <a href="mailto:hello@shopeclothes.test" className="underline hover:text-stone-900">
          hello@shopeclothes.test
        </a>
        .
      </p>
    </div>
  );
}
