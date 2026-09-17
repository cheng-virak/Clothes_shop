import { useState } from 'react';
import { Link } from 'react-router-dom';

/**
 * Explains the reset flow without pretending to run it — there's no
 * password-reset endpoint on the backend yet. Submitting shows an honest
 * "not available yet" message rather than faking a sent email.
 */
export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);

  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <h1 className="mb-1 text-xl font-semibold text-stone-900">Reset your password</h1>
      <p className="mb-6 text-sm text-stone-500">
        Enter the email on your account and we'll send you a link to reset your password.
      </p>

      {submitted ? (
        <div className="rounded-md bg-stone-100 px-4 py-3 text-sm text-stone-700">
          Password reset isn't available in this demo yet. If this were live, a reset link
          would be sent to <span className="font-medium">{email}</span>. In the meantime,{' '}
          <Link to="/login" className="underline hover:text-stone-900">
            log in
          </Link>{' '}
          with your existing password, or contact support.
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSubmitted(true);
          }}
          className="space-y-4"
        >
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-stone-700">Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-stone-900 focus:outline-none focus:ring-1 focus:ring-stone-900"
            />
          </label>
          <button
            type="submit"
            className="w-full rounded-lg bg-stone-900 py-3 text-sm font-semibold uppercase tracking-wide text-white transition hover:bg-stone-700"
          >
            Send reset link
          </button>
        </form>
      )}

      <Link to="/login" className="mt-4 inline-block text-sm text-stone-500 underline hover:text-stone-900">
        ← Back to log in
      </Link>
    </div>
  );
}
