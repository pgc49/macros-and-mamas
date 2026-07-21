import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { APP_URL, FROM_CALLIE, renderEmail } from "../_shared/emailTemplates.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { assertServiceRole } from "../_shared/assertServiceRole.ts";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const denied = assertServiceRole(req);
  if (denied) return denied;

  try {
    const { email, name } = await req.json();
    if (!email) return jsonResponse({ error: "missing email" }, 400);

    const first = (name || "Mama").trim().split(/\s+/)[0] || "Mama";

    const { data, error } = await resend.emails.send({
      from: FROM_CALLIE,
      to: [email],
      reply_to: "calista@nourishwithcalista.com",
      subject: "You're in, mama 🤍 (here's what happens next)",
      html: renderEmail({
        header: `Hi ${first},`,
        body: `
          <p>Welcome to Macros and Mamas — I'm so glad you're here!</p>
          <p>I want to tell you what makes this different, because you've probably tried the other way. This is not a 1,200-calorie plan. We don't crash, we don't punish, and we don't earn our food. We eat enough, we lift, and we lose fat while keeping the muscle that makes us strong enough for everything our lives ask of us. If you ever lose faster than about a pound to a pound and a half a week, I'll be the one telling you to eat more. That's the whole philosophy, and I mean it.</p>
          <p>I also want to reinforce that tracking your macros and meals doesn't have to happen for perpetuity! I tracked for 8 weeks, lost 11 pounds, stopped tracking for 3 months (but still used everything I learned as my guide), and I have maintained that 11 pound weight loss! This system works! I was the guinea pig! And now I get to teach you!</p>
          <p><b>Here's what happens next:</b></p>
          <p><b>First, complete your intake — it takes about 3 minutes.</b> That's where I learn your goals, your season of life, and even the foods you love. The moment you finish, I get to work.</p>
          <p>Then your macros get built — not by a calculator — by me. I personally review every mama's numbers before they go live. You'll get them within a day of finishing your intake, as flexible ranges, because real life doesn't happen in exact grams.</p>
          <p>Once your macros are approved, your invite to our WhatsApp Macros group is coming by text. That's where I live Monday through Friday — voice notes, plate pics, wins, questions, all of it. Every Monday I drop a short voice note that sets the week's focus. Listen while you pump, nurse, walk, or hide in the pantry. No judgment!</p>
          <p><b>While you're at it, do these two things — today if you can:</b></p>
          <ol>
            <li><b>Take your before photos.</b> Same outfit, same spot, same lighting — front, side, and back. Your face doesn't need to be in them. You will not believe how much you'll want these in eight weeks!</li>
            <li><b>Weigh yourself tomorrow morning</b> — first thing, before coffee, before your morning hydration, and right after you pee! That's your starting point, and it's the last time that number gets to feel like a verdict. From here on, it's just data.</li>
          </ol>
          <p>That's it. No prep, no pantry purge, no guilt about whatever you ate today.</p>
          <p>I'll see you inside, mama! We're going to do this together! I am truly so honored to spend the next 8 weeks with you!</p>
          <p>Blessings,<br/>Callie</p>
        `,
        cta_text: "Complete my intake",
        cta_url: `${APP_URL}/onboarding`,
      }),
    });

    if (error) {
      console.error("welcome-email resend error", error);
      return jsonResponse({ error }, 502);
    }
    return jsonResponse({ data });
  } catch (e) {
    console.error("welcome-email failed", e);
    return jsonResponse({ error: String(e) }, 500);
  }
});
