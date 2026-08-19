/**
 * Homepage + quiz payoff testimonials. One source so quotes are never retyped.
 * Payoff uses pull + who only; homepage also shows body.
 */
export type Testimonial = {
  id: string;
  pull: string;
  body: string;
  who: string;
};

export const TESTIMONIALS: Testimonial[] = [
  {
    id: "coti",
    pull: "I've never been able to lose weight while nursing — with any of my children — until now.",
    body: "And I'm not worried about my milk supply. I had been under-eating, prioritizing my children over myself, running on coffee and my kids' leftovers — and still holding weight. Callie taught me how to fuel my body properly instead of restricting, and the results followed. This is the first time in over a year I've seen the scale go down. Since day three I've stopped waking up puffy and bloated, I'm not shaky and starving in fight-or-flight mode, I'm less irritable, and I have more energy. Best thing I've done for myself in such a long time — and I have zero desire to quit.",
    who: "— Coti, nursing mama of three",
  },
  {
    id: "lauren",
    pull: "If I didn't lose another pound, this would still be the best investment I've made in myself in years.",
    body: "I was worried tracking macros would feel like a second job — that between kids and paid work, I wouldn't stick with it. But the app has made it so simple. Logging meals takes me two minutes, and I always know exactly what I need for the day. It's honestly become second nature. I'm happy to see the weight coming off, but the bigger thing is how I feel: no brain fog, consistent energy throughout the day. I feel like a new person.",
    who: "— Lauren, nursing mama of two",
  },
  {
    id: "becca",
    pull: "It's better and easier than anything I've used before, way better than MyFitnessPal.",
    body: "I really like this app for tracking. And being able to message Callie directly and have the other mamas right there in the thread is what keeps me on track when it gets hard.",
    who: "— Becca, mama of one",
  },
];

export function testimonialById(id: string): Testimonial | undefined {
  return TESTIMONIALS.find((t) => t.id === id);
}

/** Quiz payoff: Becca on the app, then Lauren and Coti. */
export const PAYOFF_TESTIMONIALS: Testimonial[] = ["becca", "lauren", "coti"]
  .map((id) => testimonialById(id))
  .filter((t): t is Testimonial => Boolean(t));

export const RESULTS_DISCLAIMER = "Every mama's results are her own.";
