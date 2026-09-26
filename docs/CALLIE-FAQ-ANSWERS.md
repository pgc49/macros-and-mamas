# How the Meal Coach answers the inbox FAQs

**For Callie.** This is the answer key for the questions in `docs/CALLIE-MESSAGE-FAQ.md`, run through the coach as it works today. Nothing new was added to the product to write this.

Mark each row **Keep**, **Rewrite** (paste your line), **Mine** (handoff, the model never sees it), or **Model** (the model may answer, using only the prompt at the bottom). A row marked Rewrite or Model does not go live until you send the line back.

The model is not trained on your texts. When a question reaches it, the only "training" is the written prompt. The last section is the draft of that prompt for these FAQs. Edit it in your words.

Four doors, first match wins:

1. **Your sentence.** Instant. Your words, not rewritten.
2. **The phone.** Her log and her ranges. Cards or a read of the day. No model.
3. **The model.** One call. It already has her ranges for this meal, what she ate today, and the rules below. It must not quote her numbers.
4. **You.** She sees Message Callie. Nothing is sent until she taps Send.

---

## Says your sentence, and the match is right

She does not reach the model.

| She types something like | She sees |
| --- | --- |
| Is coffee ok? A latte? | "Coffee is allowed — Callie has a cup or two a day — but never on an empty stomach. Have it with breakfast. And after about 7 hours, half the caffeine is still in your blood, so if falling asleep is hard, it may be the afternoon cup." |
| What should I order? I'm at a restaurant. | "Use the PS method: protein and a side. Roasted chicken, a burger, steak — then rice, salad or potatoes. Eating out makes it really hard not to blow through fat, so do your best. Dressing on the side, and dip your fork as you go." |
| Can I have a glass of wine? | "Alcohol is up to you — no judgment either way. If you want a drink, we can fit it in your macros. Keep fat in range, that's the one that adds up, and have it with food, not on an empty stomach." |
| Is pizza ok? Can I have a cookie? | "Any real food can fit your macros. A slice of pizza is real food — water, yeast, flour, tomatoes, cheese. An Oreo is not; it's full of stuff made in a lab. We can make macros work for real food. If this one blows through fat, calories or carbs, next time log it ahead and keep breakfast and lunch lower fat or lower carb so it fits." |
| Steps, or a walk after meals | "Getting your steps in, and a walk after meals, is a good basic." |
| Should I skip dinner? | "Absolutely not. You never skip a meal! …" (your full never-skip line) |
| Should I try intermittent fasting? | "No intermittent fasting. …" (your full fasting line) |
| I hit my protein. Should I eat more? | "If you've eaten three square meals, you can leave the rest. Follow your hunger. We never want to eat less than 50g of fat in a day — hormones really do need it." Plus the fat-floor line if she is under 50g, and a carb question if carbs are short. |

Chipotle, Cava, and Sweetgreen do **not** get the PS sentence. They go to the model, which is told to use that restaurant's real menu. In-N-Out, Italian, Chinese, sushi, and pizza-as-the-meal stay your locked lines.

**Mark:** Keep, or rewrite. The latte row is the one to look at twice. "How do I bring the fat down in a latte?" gets the coffee sentence above. That sentence never mentions the milk. If you want a fat answer, Rewrite it. If the coffee sentence is enough, Keep.

---

## The phone answers, no model

| She types | What she gets |
| --- | --- |
| How's my day? Am I on track? How much protein do I have left? | A read of her actual log against the ranges you approved. If protein is still open it says "You need about Xg of protein" for the next meal. If she is past her ranges: "You're past your ranges for today. One day doesn't change anything, and you still eat." |
| I'm hungry. More protein. What else can I eat? | Three cards that fit what's left. More protein prefers a higher-protein card. |
| What should I eat for dinner? (that short, nothing else) | Dinner cards from the bank and My meals. |

"Did I get enough protein?" does **not** hit this door. It is a longer sentence, so it falls through to the model, and the model is forbidden to quote her numbers. **Mark:** should "enough protein" be the phone read instead? That is a yes/no. No new sentence needed.

---

## Comes to you, and the model is not called

| She types something like | She sees |
| --- | --- |
| Should I lower my macros? I'm not postpartum and I don't move much. | "Your ranges are Callie's call, not mine. Message her and she'll get back to you." |
| Do I eat my workout calories back? | "I only do food and your ranges. Message her and she'll get back to you." |
| Can I take creatine while breastfeeding? | "That's something Callie might be better able to sit with than me. Message her and she'll get back to you." Supplements are on the never-answer list. |
| My supply dipped. / Supply seems back. | "We protect your supply first, always. Your ranges already use the gentler calorie math for that. If you think your supply is being affected, that's something Callie might be better able to answer than me. Message her and she'll get back to you." |
| I've been constipated. What else can I do? | The care handoff. Same "sit with" line. Constipation is never answered. |
| Can I add a goal, not only the scale? | "I'd rather not put a number on that one. Message her and she'll get back to you." The word "scale" is what sends it. |

**Mark:** Keep these handoffs. The workout row is narrower than the way mamas ask. See the misfire below.

---

## Misfires — she gets a locked sentence that does not answer her

These are live. They should not be copied into the prompt as the desired answer.

**A long workout day.** "My workout was 30 minutes one day and 2 hours the next. Should I eat more on the long day?"

The phrase "should I eat more" is the end-of-day trigger. She gets the three-square-meals line, not you. "Eat my workout calories back" does come to you. The longer wording does not.

**No sleep, still had energy.** "I got no sleep and I still had energy. Is that fine?"

"Is that fine?" is the same trigger as "is this ok?" She gets the pizza-and-Oreo paragraph. Sleep was supposed to be yours. The Oreo line wins first.

**Mark** each: Mine (always you), or Rewrite the trigger so your sentence only fires on food.

---

## Reaches the model today

No locked sentence. One model call, unless you mark the row Mine. What it is already told is in the draft prompt. Where we do not have your words, the draft tells it to hand the question back rather than invent a remedy.

| She types something like | What happens now | Mark |
| --- | --- | --- |
| I'm bored of the same breakfast. What's an easy one I can prep? | Model. It is already told breakfast is eggs, chicken sausage, sourdough or Ezekiel, yogurt, oats, a shake, fruit. Chicken and rice is not breakfast. | Keep that list, or Rewrite |
| Is an Ezekiel muffin with cottage cheese enough for breakfast? | Model. It must not say "enough" as a number. It can build from that breakfast list. | |
| I'm hungry after nursing and I feel like I'm failing. | Model, after your supply preface: "Callie builds your macros with your supply at the center and it is always protected. If you ever notice a negative shift in your supply, please reach out to Callie directly immediately." "I'm failing" does **not** add Message Callie. That button only comes if she says guilty, or awful, or bad about what she ate, and also asks what to eat next. | Should "I'm failing" come to you after the food? |
| I think I'm eating when I'm not hungry. | Model. It is told never to skip a meal, never to judge, and that she can follow her hunger once three meals are in. | |
| I'm traveling. What should I eat? | Model. Same meal rules. It is not told to plan the trip. | |
| This meal is really high in fat. What do I do? | Model. Fat stays in range. Never skip the next meal. It must not quote the number. | |
| I want something sweet. | Model. "Can I have a cookie?" would have been your real-food line. "Something sweet," with no food named, does not match that line. | |
| Look at this meal (typed, no photo attached). | Model, and it cannot see a picture. A photo she actually attaches is a different path: a menu photo becomes an order, a fridge photo becomes a meal from what is in the picture. | |
| I'm bloated and backed up. I'm drinking water. | Model. "Constipated" would have come to you. "Bloated" and "backed up" do not. | Mine, unless you write a food-only line |
| I feel sick at night and then I don't sleep. What should I eat tomorrow? | Model, because she asked what to eat. It is told not to discuss symptoms. It is not forced to hand her to you. | |
| Is it normal to go up in weight on my period? Are we weighing every day? | Model. The hard weight door did not match these wordings. The prompt says never comment on weight, and to hand it back if it is not food. That is a hope, not a guarantee. | Mine |

A passing "I'm nursing" on a food question keeps the preface and then the food. A supply problem ("my supply dipped") never gets cards.

---

## Draft prompt — only after you mark it

This is what we would add for the model, on the calls that still reach it. Lines you already locked stay as they are. Cut any line you do not want. Rewrite in your words where a blank is waiting. Do not leave a blank in: an empty blank means the model is told to hand it to you.

```
You are the Meal Coach. Never call yourself Callie, an AI, or a bot.
Do not greet her with hey love, hey boo, dude, or good girl. No lol. No emoji.
One or two sentences. You may say "let's try." Name real food from her list.
Do not mention the scale, pounds, a goal weight, or how fast she is losing.

Breakfast, when she is bored of hers or asks if a breakfast is enough:
eggs, chicken sausage, sourdough or an Ezekiel English muffin, yogurt,
cottage cheese, oats, a shake, fruit. Rotate that list. Do not invent a
new breakfast. Do not say the plate is enough or not enough in numbers.
If she only has the muffin, you may add from that same list.
Chicken and rice is lunch or dinner.

Fat blew up on a meal she already ate: do not tell her to skip. The next
meal stays lower fat. Never quote the number.

She is eating and she is not hungry: do not scold. Follow her hunger.
She still does not skip the next meal.

Travel, or "what should I eat" away from home: the next meal only, from
the same foods. Do not plan the trip.

Something sweet, and she did not name the food: a real food can fit.
Keep fat in range. Do not invent a diet dessert. Do not use the Oreo line
unless she asked if a specific food is allowed.

A latte, if it reaches you: coffee with breakfast, not on an empty stomach.
Fat is the milk. Callie's line for the milk: "[REWRITE OR CUT]"

She says look at this, and there is no photo: name no foods. Tell her to
send the photo.

Hungry after nursing is still a food question. Do not discuss her milk.
Do not shrink the plate. The app already said her supply is protected.

"I'm failing," "I'm doing badly," bloated, backed up, sick, no sleep,
the scale, weighing in, a period bump, eating more because a workout was
longer: set scope to callie, leave meals empty, and do not answer.
Do not use the end-of-day line. Do not use the pizza and Oreo line.
```

Send the marked file back. Keep means the row above is already the product. Rewrite replaces a sentence word for word. Mine never spends a model call. Model means the draft prompt, with your edits, is what the call is allowed to say.
