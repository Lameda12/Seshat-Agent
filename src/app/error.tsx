"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main>
      <h1>We couldn’t open this part of your ledger.</h1>
      <p>
        Your saved data has not been deleted. Check configuration or try again.
      </p>
      <button onClick={reset}>Try again</button>
    </main>
  );
}
