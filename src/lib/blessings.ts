export type Tone = "heart" | "easy" | "poem" | "play";

export const TONES: { id: Tone; label: string; hint: string }[] = [
  { id: "heart", label: "走心", hint: "认真说一句" },
  { id: "easy", label: "松弛", hint: "轻一点也很好" },
  { id: "poem", label: "诗意", hint: "像一封短信" },
  { id: "play", label: "俏皮", hint: "熟人才说得出口" },
];

export const WHO: { label: string; value: string }[] = [
  { label: "朋友", value: "我的朋友" },
  { label: "家人", value: "家人" },
  { label: "喜欢的人", value: "喜欢的人" },
  { label: "自己", value: "自己" },
];

export const TEMPLATES: { id: string; tone: Tone; text: string }[] = [
  {
    id: "h1",
    tone: "heart",
    text: "人不必常聚，心要记得圆。今晚的月亮，替我靠近你。",
  },
  {
    id: "h2",
    tone: "heart",
    text: "这一年你辛苦了。月圆的晚上，把心事放下，把灯打开。",
  },
  {
    id: "h3",
    tone: "heart",
    text: "想你的时候，就把月亮当成已读。它会替我亮着。",
  },
  {
    id: "h4",
    tone: "heart",
    text: "先把这轮月亮过好。你已经很努力了，中秋快乐。",
  },
  {
    id: "e1",
    tone: "easy",
    text: "今晚不谈理想，只谈月亮和晚饭。中秋快乐，少加班。",
  },
  {
    id: "e2",
    tone: "easy",
    text: "月饼我先吃为敬，祝福后补：把待办关掉，把窗打开。",
  },
  {
    id: "e3",
    tone: "easy",
    text: "月亮免费，心情也请顺便圆一下。中秋快乐。",
  },
  {
    id: "p1",
    tone: "poem",
    text: "月是今夜的信，寄给你。山河很远，你在灯里。",
  },
  {
    id: "p2",
    tone: "poem",
    text: "天上的圆，是给没能见面的人的。中秋好。",
  },
  {
    id: "p3",
    tone: "poem",
    text: "风从桂花里走过，我从你的名字里路过。",
  },
  {
    id: "y1",
    tone: "play",
    text: "中秋快乐。记得把我从待办里勾掉，改成置顶。",
  },
  {
    id: "y2",
    tone: "play",
    text: "月亮这么大，你还在回我消息吗。中秋快乐呀。",
  },
  {
    id: "y3",
    tone: "play",
    text: "月饼口味随缘，祝福不含糖。今晚早点睡，明天也圆。",
  },
];

export const LANTERN_WISHES = ["平安", "顺遂", "团圆", "有光", "少烦忧", "月圆"] as const;

export const FESTIVAL = {
  gregorian: "2026.09.25",
  ganzhi: "丙午年",
  lunar: "八月十五",
  title: "今晚月圆",
} as const;

export type Letter = {
  to: string;
  from: string;
  tone: Tone;
  message: string;
};

export const EMPTY_LETTER: Letter = {
  to: "",
  from: "",
  tone: "heart",
  message: "",
};

export function formatLetterText(letter: Letter) {
  const to = letter.to.trim() || "月亮";
  const from = letter.from.trim() || "无名";
  const message =
    letter.message.trim() || "今晚月圆。把想说的话，留给今晚。";
  return `写给 ${to}\n\n${message}\n\n—— ${from}\n${FESTIVAL.ganzhi} · ${FESTIVAL.lunar}`;
}
