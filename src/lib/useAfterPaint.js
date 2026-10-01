import { startTransition, useEffect, useState } from "react";

/**
 * False on the first paint, then true. Lets Today get a scroll layer up
 * before mounting the week goals / water card.
 */
export function useAfterPaint() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    startTransition(() => setReady(true));
  }, []);
  return ready;
}
