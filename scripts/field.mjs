// この半年（26 週）のコントリビューションを「畑」の絵にして、明るい画面用と暗い画面用の SVG を書き出す。
// 使い方: GITHUB_TOKEN=... node scripts/field.mjs [出力先のフォルダ]
// 開いたときに、育っている株が左から順にぴょこんと伸びる。動きが止まった環境でも絵は最初から見えている。
// 多い日ほど大きく育つ（空の土 → 芽 → 葉 → にんじん）。色だけでなく形と大きさでも量が分かるようにしている。
import { writeFileSync, mkdirSync } from "node:fs";
import assert from "node:assert";

const login = process.env.GITHUB_REPOSITORY_OWNER || "ninjin0802";
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
const out = process.argv[2] || "dist";

const THEMES = {
  light: { soil: "#f1e6cb", dim: "#dccb9f", leafA: "#8fa873", leafB: "#56684a", carrot: "#e8742a", line: "#b9531a", text: "#7a5028", muted: "#8a7a62" },
  dark: { soil: "#231c15", dim: "#4a3a28", leafA: "#7d9467", leafB: "#a7ba92", carrot: "#f08a45", line: "#c9631f", text: "#cfc6b8", muted: "#9a8d7c" },
};
const LEVEL = { NONE: 0, FIRST_QUARTILE: 1, SECOND_QUARTILE: 2, THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4 };
const WEEKS = 26, Z = 2, P = 15 * Z, X0 = 40, Y0 = 30; // 描く週の数、絵の倍率、マスの間隔、畑の左上

async function fetchDays() {
  const query = `query($login:String!){user(login:$login){contributionsCollection{contributionCalendar{totalContributions weeks{contributionDays{date contributionCount contributionLevel weekday}}}}}}`;
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { authorization: `bearer ${token}`, "content-type": "application/json", "user-agent": "profile-field" },
    body: JSON.stringify({ query, variables: { login } }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) throw new Error(`GitHub API: ${res.status} ${JSON.stringify(json.errors ?? json)}`);
  return json.data.user.contributionsCollection.contributionCalendar;
}

// 1 マス（15×15、地面は y=11.5）に収まる絵。A は明るい葉、B は濃い葉。
// 葉 1 枚。根元 (7.5, 11.5-dy) から、横に dx*w・上に h の先端へ伸びる。
const leaf = (dx, dy, w, h, c) => {
  const by = 11.5 - dy, tx = 7.5 + dx * w, ty = by - h;
  return `<path d="M7.5 ${by}Q${7.5 + dx * w * 0.05} ${by - h * 0.95} ${tx} ${ty}Q${7.5 + dx * w * 1.05} ${by - h * 0.15} 7.5 ${by}z" fill="var(--${c})"/>`;
};
const SYMBOLS = `
<g id="l0"><ellipse cx="7.5" cy="11.5" rx="2.6" ry=".9" fill="var(--dim)"/></g>
<g id="l1">${leaf(-1, 0, 3.2, 4.2, "A")}${leaf(1, 0, 3.2, 4.2, "A")}</g>
<g id="l2">${leaf(-1, 0, 4, 5.4, "A")}${leaf(1, 0, 4, 5.4, "B")}</g>
<g id="l3">${leaf(-1, 0, 5, 6.4, "A")}${leaf(1, 0, 5, 6.4, "A")}<path d="M7.5 11.5q-2.4-5 0-10q2.4 5 0 10z" fill="var(--B)"/></g>
<g id="l4">${leaf(-1, 3, 5, 5.6, "A")}${leaf(1, 3, 5, 5.6, "A")}<path d="M7.5 8.5q-2.2-4.2 0-8.3q2.2 4.1 0 8.3z" fill="var(--B)"/><path d="M3.6 10.2q0-2.4 3.9-2.4t3.9 2.4q0 2.3-1.1 4.3h-5.6q-1.1-2-1.1-4.3z" fill="var(--carrot)"/><path d="M5.6 10.6h2.4M7.6 12.6h2" stroke="var(--line)" stroke-width=".8" stroke-linecap="round" fill="none"/></g>`;

function render(cal, t) {
  const weeks = cal.weeks.slice(-WEEKS), days = weeks.flatMap((w) => w.contributionDays);
  const total = days.reduce((a, d) => a + d.contributionCount, 0);
  const W = X0 + weeks.length * P + 12, H = Y0 + 7 * P + 62;
  const best = days.reduce((a, d) => (d.contributionCount > a.contributionCount ? d : a), days[0]);
  let cells = "", months = "", n = 0, prevMonth = -1;
  weeks.forEach((w, i) => {
    const m = +w.contributionDays[0].date.slice(5, 7);
    if (m !== prevMonth && w.contributionDays[0].weekday === 0) { months += `<text x="${X0 + i * P + 4}" y="16">${m}月</text>`; prevMonth = m; }
    for (const d of w.contributionDays) {
      const lv = LEVEL[d.contributionLevel], x = X0 + i * P, y = Y0 + d.weekday * P;
      cells += `<g transform="translate(${x} ${y}) scale(${Z})"><use href="#l${lv}"${lv ? ` class="p" style="animation-delay:${(0.4 + i * 0.05).toFixed(2)}s"` : ""}/></g>`;
      n++;
    }
  });
  assert.equal(n, days.length, "描いたマスの数が日数と合わない");
  const L = 22, lx = W - 46 - 5 * L; // 凡例のマスの間隔と、絵の左端
  const legend = [0, 1, 2, 3, 4].map((lv) => `<g transform="translate(${lx + lv * L} ${H - 40}) scale(1.4)"><use href="#l${lv}"/></g>`).join("");
  const [, bm, bd] = best.date.split("-").map(Number);
  const summary = `この半年で ${total.toLocaleString("en-US")} 回、畑に出ました。いちばん多かった日は ${bm}月${bd}日の ${best.contributionCount} 回。`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="t">
<title id="t">${login} のこの半年のコントリビューション。${summary}</title>
<style>
svg{--soil:${t.soil};--dim:${t.dim};--A:${t.leafA};--B:${t.leafB};--carrot:${t.carrot};--line:${t.line}}
text{font:12px system-ui,-apple-system,"Hiragino Sans","Noto Sans JP",sans-serif;fill:${t.muted}}
.s{font-size:14px;fill:${t.text}}
.p{transform-box:fill-box;transform-origin:50% 100%;animation:pop .6s ease-out}
@keyframes pop{40%{transform:scale(1.4)}}
@media (prefers-reduced-motion:reduce){.p{animation:none}}
</style>
<defs>${SYMBOLS}</defs>
<rect x="${X0 - 8}" y="${Y0 - 6}" width="${weeks.length * P + 16}" height="${7 * P + 14}" rx="16" fill="var(--soil)"/>
${months}
<text x="10" y="${Y0 + 1 * P + 22}">月</text><text x="10" y="${Y0 + 3 * P + 22}">水</text><text x="10" y="${Y0 + 5 * P + 22}">金</text>
${cells}
<text class="s" x="${X0 - 8}" y="${H - 18}">${summary}</text>
<text x="${lx - 6}" y="${H - 19}" text-anchor="end">少ない</text>${legend}<text x="${lx + 5 * L + 6}" y="${H - 19}">多い</text>
</svg>
`;
}

const cal = await fetchDays();
mkdirSync(out, { recursive: true });
for (const [name, t] of Object.entries(THEMES)) writeFileSync(`${out}/field-${name}.svg`, render(cal, t));
console.log(`${login}: ${cal.totalContributions} contributions in the last year → ${out}/field-{light,dark}.svg`);
