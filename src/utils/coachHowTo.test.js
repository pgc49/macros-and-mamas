import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { HOW_TO_TOPICS, howToBody, localCoachHowTo } from "./coachHowTo.js";
import { localCoachTeach, teachBody } from "./coachTeach.js";
import { COACH_HOW_TO } from "../content/coachVoice.js";

const topicOf = (text) => localCoachHowTo(text)?.topic || null;

describe("how to use the app", () => {
  it("answers the questions mamas ask about the app", () => {
    const asks = {
      "what can you help with?": "howCoach",
      "how does this work": "howCoach",
      "are you Callie?": "howCoach",
      "is this a bot": "howCoach",
      "does Callie read these": "howCoach",
      "how do I log a meal": "howLog",
      "how can I track what I ate": "howLog",
      "how do I delete something I logged": "howEdit",
      "how do I edit an entry in my log": "howEdit",
      "how do I see yesterday": "howPast",
      "how do I log for yesterday": "howPast",
      "where are my meals saved? how do I save a recipe": "howMyMeals",
      "how do I create a recipe": "howMyMeals",
      "how do I plan my week": "howPlan",
      "what does pencil in mean? how does pencil in work": "howPencil",
      "where do I see my macros": "howRanges",
      "how do I log my weight": "howWeight",
      "where do I log my weigh-in": "howWeight",
      "how do I message Callie": "howMessage",
      "how do I change my food preferences": "howFoodPrefs",
      "where do I put my allergies": "howFoodPrefs",
      "how do I change my profile photo": "howProfile",
      "how do I change my password": "howPassword",
      "how do I sign out": "howPassword",
      "how do I turn on notifications": "howNotify",
      "how do I report a bug": "howHelp",
      "where is my progress": "howProgress",
    };
    for (const [ask, topic] of Object.entries(asks)) expect(topicOf(ask), ask).toBe(topic);
  });

  it("leaves a meal question to the meal coach", () => {
    for (const ask of [
      "how can I add more protein to lunch",
      "how do I change my lunch to something lighter",
      "what do you recommend for lunch",
      "how do I make up for yesterday",
      "log this for lunch",
      "how should I eat this week to lose weight",
      "what should I eat",
    ]) {
      expect(topicOf(ask), ask).toBeNull();
    }
  });

  it("steps aside for anything a guardrail owns", () => {
    for (const ask of [
      "how do I support my milk supply",
      "how do I cancel my account",
      "how do I get a refund",
      "how do I log in",
      "how do I change my macros",
      "how do I stop wanting to hurt myself",
      "how do I track my symptoms",
    ]) {
      expect(topicOf(ask), ask).toBeNull();
    }
  });

  it("is reachable through the locked-sentence path the panel and server both use", () => {
    const teach = localCoachTeach("how do I log a meal");
    expect(teach).toEqual({ kind: "teach", topic: "howLog" });
    expect(teachBody("howLog")).toBe(COACH_HOW_TO.howLog);
    for (const topic of HOW_TO_TOPICS) expect(howToBody(topic).length, topic).toBeGreaterThan(20);
  });

  it("is honest about what the coach is", () => {
    const body = COACH_HOW_TO.howCoach;
    expect(body).toMatch(/automated, not Callie/i);
    expect(body).toMatch(/next meal/);
    expect(body).toMatch(/message|Messages/);
    expect(body).not.toMatch(/\bAI\b|\bbot\b/);
  });
});

/**
 * [topic, words in the answer, file that renders it, text in that file].
 * A renamed button fails here instead of leaving the coach describing a
 * screen that no longer exists.
 */
const LABELS = [
  ["howLog", "Log a meal", "src/components/MealLogCard.jsx", ">Log a meal<"],
  ["howLog", "Snap", "src/components/MealLogCard.jsx", "\"Snap\", \"plate or menu\""],
  ["howLog", "Describe", "src/components/MealLogCard.jsx", "\"Describe\", \"type it\""],
  ["howLog", "My plan", "src/components/MealLogCard.jsx", "\"My plan\", \"exact\""],
  ["howLog", "Macros", "src/components/MealLogCard.jsx", "\"Macros\", \"I know them\""],
  ["howEdit", "Today's log", "src/components/MealLogCard.jsx", "\"Today's log\""],
  ["howEdit", "move it to another meal", "src/components/MealLogCard.jsx", "tap any item to move or edit"],
  ["howEdit", "tap remove", "src/components/MealLogCard.jsx", "remove"],
  ["howPast", "arrows for another week", "src/components/MealLogCard.jsx", "Previous week"],
  ["howMyMeals", "My meals", "src/utils/mealSearch.js", "label: \"My meals\""],
  ["howMyMeals", "＋ Add meal", "src/views/ClientApp.jsx", "＋ Add meal"],
  ["howMyMeals", "create a recipe, describe a meal, or generate options", "src/views/ClientApp.jsx", "Create a recipe, describe a meal, or generate options"],
  ["howPlan", "Weekly Planner", "src/utils/mealSearch.js", "label: \"Weekly Planner\""],
  ["howPlan", "Suggest my week", "src/components/WeekPlanner.jsx", "\"Suggest my week\""],
  ["howPlan", "Add to Today", "src/components/WeekPlanner.jsx", "Add to Today"],
  ["howPencil", "Pencil in", "src/content/coachVoice.js", "pencilIn: \"Pencil in\""],
  ["howPencil", "Ate it", "src/content/coachVoice.js", "ateIt: \"Ate it\""],
  ["howPencil", "Clear", "src/content/coachVoice.js", "clearPencil: \"Clear\""],
  ["howRanges", "Protein, Carbs, Fat, and Calories", "src/views/ClientApp.jsx", "\"Protein\""],
  ["howProgress", "macros against your ranges", "src/components/ProgressCharts.jsx", "Macros vs your ranges"],
  ["howWeight", "Progress", "src/views/ClientApp.jsx", "[\"progress\", \"Progress\"]"],
  ["howWeight", "Weight (lbs)", "src/components/WeighInCard.jsx", "\"Weight (lbs)\""],
  ["howWeight", "Log it", "src/components/WeighInCard.jsx", "\"Log it\""],
  ["howMessage", "Messages", "src/views/ClientApp.jsx", "[\"messages\", \"Messages\"]"],
  ["howMessage", "photo or a PDF", "src/components/MessagesThread.jsx", "Attach photo or PDF"],
  ["howFoodPrefs", "Food prefs", "src/utils/mealSearch.js", "label: \"Food prefs\""],
  ["howProfile", "circle at the top right to open Account", "src/components/ui.jsx", "aria-label=\"Account\""],
  ["howProfile", "Profile", "src/views/AccountPage.jsx", "title: \"Profile\""],
  ["howPassword", "Password is under Profile", "src/views/ProfilePage.jsx", "Password"],
  ["howPassword", "Sign out", "src/views/AccountPage.jsx", "Sign out"],
  ["howNotify", "Turn on notifications", "src/components/MessagesThread.jsx", "\"Turn on notifications\""],
  ["howNotify", "Home Screen icon", "src/components/MessagesThread.jsx", "Home Screen icon"],
  ["howHelp", "Report a problem", "src/views/AccountPage.jsx", "title: \"Report a problem\""],
  ["howHelp", "App help & feedback", "src/components/TechHelpFooter.jsx", "App help & feedback"],
];

describe("every label the how-to answers quote is on screen", () => {
  const root = resolve(__dirname, "../..");

  it.each(LABELS)("%s says %s", (topic, words, file, source) => {
    expect(COACH_HOW_TO[topic]).toContain(words);
    expect(readFileSync(resolve(root, file), "utf8")).toContain(source);
  });
});
