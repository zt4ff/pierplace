export const DEFAULT_PROFILE = Object.freeze({
  name: "",
  skin: "#b57c54",
  hair: "#332c30",
  shirt: "#548e80",
  wearId: true,
  photo: null,
});
export const COLORS = {
  skin: ["#f0c7a0", "#d7a076", "#b57c54", "#895337", "#5b392b"],
  hair: ["#332c30", "#75523a", "#c69a57", "#a85241", "#e6ded0"],
  shirt: ["#548e80", "#8973aa", "#d29361", "#6487aa", "#bc7082"],
};
export const QUESTIONS = [
  {
    title: "Find the next piece.",
    hint: "Look at how the colors alternate.",
    sequence: ["leaf", "sun", "leaf", "sun", "?"],
    choices: ["sun", "leaf", "moon"],
    answer: "leaf",
  },
  {
    title: "One of these is a little different.",
    hint: "Choose the shape that doesn’t belong.",
    sequence: [],
    choices: ["diamond", "diamond", "circle", "diamond"],
    answerIndex: 2,
  },
  {
    title: "What comes next?",
    hint: "The number of blocks grows by one each time.",
    sequence: ["block1", "block2", "block3", "?"],
    choices: ["block2", "block4", "block1"],
    answer: "block4",
  },
];
export const NPC_LINES = {
  "Mr Jonathan": [
    "Big ideas start with small experiments. What will you try today?",
    "Stuck on something? Break it into the smallest possible step.",
    "Progress over perfection. Always.",
  ],
  "Mr Femi": [
    "A good question is often worth more than a quick answer.",
    "Find a table, meet someone new, and build something together.",
    "Remember to give your eyes a break from the screen.",
  ],
  "Mr Ezekiel": [
    "Your next breakthrough might be one conversation away.",
    "Every expert was once a beginner. You belong here.",
    "Try explaining what you learned to a friend. It really helps!",
  ],
  "Mr Emmanuel": [
    "Let’s slow down and understand why this solution works.",
    "A clear plan makes a difficult project feel possible.",
    "Test your assumptions before you build on them.",
  ],
  "Mr Itunu": [
    "Show me your prototype. We can learn by trying it together.",
    "I’m checking in on projects upstairs and downstairs—what are you making?",
    "Make one small improvement, test it, then try the next.",
  ],
  "Facility Manager": [
    "Water is in the middle, restrooms on the right. Make yourself at home!",
    "Two floors, plenty of seats, and room for your next big idea.",
    "Please keep the walkways clear. Happy exploring!",
  ],
  Kayode: [
    "Hey! Welcome to the crew. Come say hello at a table.",
    "The beanbags are my favorite thinking spot. Don’t tell anyone.",
    "Got an idea for the community? I’m all ears.",
  ],
};
const KEY = "Fella.v1";
export function freshState() {
  return {
    profile: { ...DEFAULT_PROFILE },
    admitted: false,
    floor: 1,
    chats: {},
    lessons: [],
  };
}
export function loadState(storage) {
  try {
    const data = JSON.parse(storage.getItem(KEY));
    if (!data || typeof data !== "object") return freshState();
    const profile = { ...DEFAULT_PROFILE };
    if (typeof data.profile?.name === "string")
      profile.name = data.profile.name.slice(0, 24);
    for (const key of ["skin", "hair", "shirt"])
      if (COLORS[key].includes(data.profile?.[key]))
        profile[key] = data.profile[key];
    profile.wearId =
      typeof data.profile?.wearId === "boolean" ? data.profile.wearId : true;
    if (
      typeof data.profile?.photo === "string" &&
      /^data:image\/(png|jpeg|webp);base64,/.test(data.profile.photo) &&
      data.profile.photo.length < 500000
    )
      profile.photo = data.profile.photo;
    const chats = {};
    if (data.chats && typeof data.chats === "object")
      for (const [key, messages] of Object.entries(data.chats)) {
        if (/^floor-[12]-[a-z0-9-]+$/.test(key) && Array.isArray(messages))
          chats[key] = messages
            .filter(
              (m) => typeof m?.text === "string" && typeof m?.name === "string",
            )
            .slice(-100)
            .map((m) => ({
              name: m.name.slice(0, 24),
              text: m.text.slice(0, 500),
              time: typeof m.time === "string" ? m.time : "",
            }));
      }
    return {
      profile,
      admitted: data.admitted === true && Boolean(profile.name.trim()),
      floor: data.floor === 2 ? 2 : 1,
      chats,
      lessons: Array.isArray(data.lessons)
        ? data.lessons.filter((v) => ["welcome", "web", "design"].includes(v))
        : [],
    };
  } catch {
    return freshState();
  }
}
export function saveState(storage, state) {
  try {
    storage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}
export function isCorrect(question, index) {
  return (
    Number.isInteger(index) &&
    index >= 0 &&
    index < question.choices.length &&
    (question.answerIndex === undefined
      ? question.choices[index] === question.answer
      : index === question.answerIndex)
  );
}
export function tableLabel(id) {
  return (
    id?.replace(/^floor-([12])-/, "Floor $1 · ").replaceAll("-", " ") || "Table"
  );
}
