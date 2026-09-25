import { FESTIVAL, type Letter } from "@/lib/blessings";

const MOON_SRC = "/moon.jpg";

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    if (!para) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const ch of para) {
      const next = line + ch;
      if (ctx.measureText(next).width > maxWidth && line) {
        lines.push(line);
        line = ch;
      } else {
        line = next;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("moon image failed to load"));
    img.src = src;
  });
}

function token(name: string, fallback: string) {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || fallback;
}

export async function renderPoster(letter: Letter): Promise<Blob> {
  const width = 1080;
  const height = 1920;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");

  await document.fonts.ready;

  const bg = token("--color-bg", "#0c0d12");
  const fg = token("--color-fg", "#f3ead8");
  const muted = token("--color-muted", "#9a9184");
  const accent = token("--color-accent", "#e8d5b0");

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  const moon = await loadImage(MOON_SRC);
  const moonX = width / 2;
  const moonY = 620;
  const moonR = 236;

  const glow = ctx.createRadialGradient(moonX, moonY, moonR * 0.2, moonX, moonY, moonR * 2.4);
  glow.addColorStop(0, "rgba(232, 213, 176, 0.28)");
  glow.addColorStop(0.45, "rgba(232, 213, 176, 0.08)");
  glow.addColorStop(1, "rgba(232, 213, 176, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.beginPath();
  ctx.arc(moonX, moonY, moonR, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(moon, moonX - moonR, moonY - moonR, moonR * 2, moonR * 2);
  ctx.restore();

  ctx.strokeStyle = "rgba(243, 234, 216, 0.16)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(moonX, moonY, moonR, 0, Math.PI * 2);
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.fillStyle = muted;
  ctx.font = '500 28px "Noto Serif SC", serif';
  ctx.fillText("月  笺", width / 2, 168);

  ctx.font = '400 22px "Noto Serif SC", serif';
  ctx.fillText(`${FESTIVAL.ganzhi}  ·  ${FESTIVAL.lunar}`, width / 2, 214);

  const to = letter.to.trim() || "月亮";
  const from = letter.from.trim() || "无名";
  const message =
    letter.message.trim() || "今晚月圆。把想说的话，留给今晚。";

  let y = 980;
  ctx.fillStyle = muted;
  ctx.font = '400 24px "Noto Serif SC", serif';
  ctx.fillText("写给", width / 2, y);

  y += 70;
  ctx.fillStyle = fg;
  ctx.font = '500 56px "Noto Serif SC", serif';
  ctx.fillText(to.length > 12 ? `${to.slice(0, 12)}…` : to, width / 2, y);

  y += 36;
  ctx.strokeStyle = "rgba(232, 213, 176, 0.28)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(width / 2 - 48, y);
  ctx.lineTo(width / 2 + 48, y);
  ctx.stroke();

  y += 72;
  ctx.fillStyle = accent;
  ctx.font = '400 36px "Noto Serif SC", serif';
  const lines = wrapText(ctx, message, 760).slice(0, 7);
  for (const line of lines) {
    ctx.fillText(line, width / 2, y);
    y += 56;
  }

  y = Math.max(y + 48, 1620);
  ctx.fillStyle = fg;
  ctx.font = '500 28px "Noto Serif SC", serif';
  ctx.fillText(from, width / 2, y);

  y += 44;
  ctx.fillStyle = muted;
  ctx.font = '400 22px "Noto Serif SC", serif';
  ctx.fillText(FESTIVAL.gregorian, width / 2, y);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  if (!blob) throw new Error("poster encode failed");
  return blob;
}

export async function downloadPoster(letter: Letter) {
  const blob = await renderPoster(letter);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `月笺-${letter.to.trim() || "中秋"}.png`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function sharePoster(letter: Letter, text: string) {
  const blob = await renderPoster(letter);
  const file = new File([blob], "月笺.png", { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({
      title: "月笺 · 中秋",
      text,
      files: [file],
    });
    return true;
  }
  if (navigator.share) {
    await navigator.share({ title: "月笺 · 中秋", text });
    return true;
  }
  return false;
}
