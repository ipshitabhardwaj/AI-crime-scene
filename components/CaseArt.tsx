/**
 * The picture shown with each case: a drawn crime-scene illustration, chosen
 * by case code. Unknown codes get a generic "case file" picture.
 */
const RED = "#e11d2e";
const PAPER = "#f3ead9";
const INK = "#1b1214";
const DARK = "#150c0e";
const TAPE = "#f5c518";

function Frame({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 800 340" role="img" aria-label={label} className="block h-auto w-full" preserveAspectRatio="xMidYMid slice">
      <defs>
        <radialGradient id="lamp" cx="50%" cy="0%" r="90%">
          <stop offset="0" stopColor="#5a0f18" />
          <stop offset="0.6" stopColor={DARK} />
          <stop offset="1" stopColor="#070405" />
        </radialGradient>
      </defs>
      <rect width="800" height="340" fill="url(#lamp)" />
      {children}
      {/* police tape across the corner */}
      <g transform="rotate(-8 660 300)">
        <rect x="430" y="286" width="460" height="30" fill={TAPE} />
        <text x="446" y="307" fontFamily="'Courier New', monospace" fontWeight="700" fontSize="15" letterSpacing="3" fill={INK}>
          CRIME SCENE · DO NOT CROSS · CRIME SCENE
        </text>
      </g>
    </svg>
  );
}

function Stamp({ x, y, text, rot = -12 }: { x: number; y: number; text: string; rot?: number }) {
  const w = text.length * 23 + 28;
  return (
    <g transform={`rotate(${rot} ${x} ${y})`}>
      <rect x={x - w / 2} y={y - 28} width={w} height="52" rx="6" fill="none" stroke={RED} strokeWidth="5" />
      <text x={x} y={y + 10} textAnchor="middle" fontFamily="'Courier New', monospace" fontWeight="700" fontSize="34" letterSpacing="4" fill={RED}>
        {text}
      </text>
    </g>
  );
}

/** A: a study at night: stopped clock, ladder, open window, fallen paperweight. */
function LockedRoom() {
  return (
    <Frame label="A dark study with a library ladder, an open window and a wall clock stopped at 10:47">
      {/* bookshelf + ladder */}
      <rect x="520" y="30" width="230" height="250" fill="#2a2023" stroke="#5b4347" strokeWidth="3" />
      {[80, 130, 180, 230].map((y) => (
        <rect key={y} x="520" y={y} width="230" height="5" fill="#5b4347" />
      ))}
      {[535, 552, 566, 590, 604, 630, 648, 672, 690, 716].map((x, i) => (
        <rect key={x} x={x} y={i % 2 ? 44 : 38} width="12" height={i % 2 ? 36 : 42} fill={i % 3 === 0 ? RED : "#8a7a7d"} />
      ))}
      <path d="M560 290 L610 40 M620 290 L650 40" stroke={PAPER} strokeWidth="6" strokeLinecap="round" />
      {[80, 130, 180, 230].map((y, i) => (
        <path key={y} d={`M${603 - i * 10} ${y} H${644 - i * 6}`} stroke={PAPER} strokeWidth="5" />
      ))}
      {/* window, open a little */}
      <rect x="60" y="50" width="150" height="170" fill="#0b0708" stroke={PAPER} strokeWidth="5" />
      <path d="M135 50 V220 M60 135 H210" stroke={PAPER} strokeWidth="3" />
      <rect x="60" y="196" width="150" height="24" fill="#16263a" />
      <path d="M90 70 l-6 22 M120 64 l-6 22 M170 76 l-6 22 M190 110 l-6 22" stroke="#7fa3c7" strokeWidth="2" />
      {/* clock stopped */}
      <circle cx="330" cy="92" r="46" fill={PAPER} stroke="#5b4347" strokeWidth="5" />
      <path d="M330 92 L300 78 M330 92 L370 110" stroke={INK} strokeWidth="5" strokeLinecap="round" />
      <path d="M312 60 L340 96 L324 124" stroke={RED} strokeWidth="3" fill="none" />
      <text x="330" y="166" textAnchor="middle" fontFamily="'Courier New', monospace" fontWeight="700" fontSize="20" fill={TAPE}>10:47</text>
      {/* outline on the floor + paperweight */}
      <path d="M300 270 q40 -34 96 -20 q46 10 80 -10 q30 22 -8 44 q-80 34 -168 -14 z" fill="none" stroke={PAPER} strokeWidth="3" strokeDasharray="9 7" />
      <circle cx="250" cy="286" r="13" fill="#b08a4f" />
      <path d="M243 276 l3 -9 l5 7 l5 -7 l3 9" fill="#b08a4f" />
      <Stamp x={150} y={280} text="LOCKED" rot={-8} />
    </Frame>
  );
}

/** B: exam paper on a desk, a phone taking its photo, a green mug. */
function LeakedPaper() {
  return (
    <Frame label="An exam paper on a desk being photographed with a phone, next to a green mug">
      <rect x="60" y="210" width="430" height="70" rx="8" fill="#2a2023" />
      <g transform="rotate(-6 270 150)">
        <rect x="130" y="40" width="270" height="190" fill={PAPER} />
        <text x="150" y="72" fontFamily="'Courier New', monospace" fontWeight="700" fontSize="16" fill={INK}>DATA STRUCTURES</text>
        {[92, 110, 128, 146, 164, 182, 200].map((y, i) => (
          <rect key={y} x="150" y={y} width={i % 3 === 2 ? 150 : 225} height="6" fill="#b9ab97" />
        ))}
        <path d="M330 146 h44" stroke={RED} strokeWidth="4" />
        <text x="352" y="140" textAnchor="middle" fontFamily="'Courier New', monospace" fontWeight="700" fontSize="13" fill={RED}>6</text>
      </g>
      <Stamp x={290} y={180} text="LEAKED" />
      <g>
        <rect x="430" y="150" width="46" height="56" rx="6" fill="#2f8f5b" />
        <path d="M476 164 q20 4 0 30" fill="none" stroke="#2f8f5b" strokeWidth="7" />
        <path d="M430 150 l12 10 l-12 6 z" fill="#150c0e" />
      </g>
      <g transform="rotate(14 620 150)">
        <rect x="560" y="50" width="120" height="210" rx="16" fill="#0b0708" stroke="#5b4347" strokeWidth="3" />
        <rect x="570" y="70" width="100" height="160" fill="#241a1d" />
        <rect x="582" y="92" width="76" height="52" fill={PAPER} opacity="0.9" />
        <circle cx="620" cy="205" r="14" fill="none" stroke={PAPER} strokeWidth="3" />
        <circle cx="620" cy="205" r="8" fill={RED} />
      </g>
      <path d="M540 60 l-26 -18 M532 96 l-34 0 M544 132 l-28 16" stroke={TAPE} strokeWidth="4" strokeLinecap="round" />
    </Frame>
  );
}

/** C: an emerald necklace in a glass museum case. */
function MuseumHeist() {
  return (
    <Frame label="An emerald necklace displayed inside a locked glass case in a museum">
      <rect x="250" y="250" width="300" height="60" fill="#3a3033" stroke="#5b4347" strokeWidth="3" />
      <rect x="270" y="50" width="260" height="200" fill="#9fd6e8" opacity="0.1" stroke={PAPER} strokeWidth="3" />
      <path d="M290 70 l40 60 M300 60 l20 30" stroke={PAPER} strokeWidth="3" opacity="0.5" />
      <path d="M330 100 q70 130 140 0" fill="none" stroke={TAPE} strokeWidth="5" />
      {[[346, 128], [368, 152], [432, 152], [454, 128]].map(([x, y]) => (
        <circle key={`${x}`} cx={x} cy={y} r="8" fill="#2fb573" stroke={TAPE} strokeWidth="2" />
      ))}
      <path d="M400 160 l18 22 l-18 30 l-18 -30 z" fill="#2fb573" stroke={TAPE} strokeWidth="3" />
      <rect x="386" y="238" width="28" height="22" rx="4" fill={TAPE} />
      <path d="M392 238 v-8 a8 8 0 0 1 16 0 v8" fill="none" stroke={TAPE} strokeWidth="4" />
      {/* spotlights */}
      <path d="M400 0 L300 250 H500 Z" fill={PAPER} opacity="0.06" />
      {/* catalogue card with lion clasp */}
      <g transform="rotate(-7 130 170)">
        <rect x="60" y="110" width="150" height="120" fill={PAPER} />
        <text x="74" y="134" fontFamily="'Courier New', monospace" fontWeight="700" fontSize="12" fill={INK}>CATALOGUE</text>
        <circle cx="135" cy="180" r="26" fill="none" stroke={INK} strokeWidth="3" />
        <path d="M122 186 q13 -26 26 0 M128 176 h2 M140 176 h2 M131 190 q4 4 8 0" stroke={INK} strokeWidth="3" fill="none" strokeLinecap="round" />
      </g>
      <Stamp x={650} y={130} text="FAKE" rot={10} />
      <text x="604" y="200" fontFamily="'Courier New', monospace" fontWeight="700" fontSize="16" fill={PAPER}>clasp: “R.B.”</text>
    </Frame>
  );
}

/** D: a dressing-room mirror with a note, and an empty chair in the spotlight. */
function MissingPerson() {
  return (
    <Frame label="A dressing-room mirror with a note stuck on it, next to an empty chair in a spotlight on stage">
      {/* mirror with bulbs */}
      <rect x="90" y="40" width="300" height="220" rx="10" fill="#241a1d" stroke="#b08a4f" strokeWidth="6" />
      {[110, 160, 210, 260, 310, 360].map((x) => (
        <circle key={x} cx={x} cy="40" r="9" fill={TAPE} />
      ))}
      {[80, 130, 180, 230].map((y) => (
        <g key={y}>
          <circle cx="90" cy={y} r="9" fill={TAPE} />
          <circle cx="390" cy={y} r="9" fill={TAPE} />
        </g>
      ))}
      <path d="M130 70 l60 90 M150 62 l30 46" stroke={PAPER} strokeWidth="3" opacity="0.25" />
      <g transform="rotate(4 250 150)">
        <rect x="170" y="100" width="170" height="110" fill={PAPER} />
        <text x="184" y="128" fontFamily="'Courier New', monospace" fontSize="13" fill="#1d4fb8">{"I can't do this"}</text>
        <text x="184" y="150" fontFamily="'Courier New', monospace" fontSize="13" fill="#1d4fb8">anymore. I will</text>
        <text x="184" y="172" fontFamily="'Courier New', monospace" fontSize="13" fill="#1d4fb8">definately</text>
        <text x="184" y="194" fontFamily="'Courier New', monospace" fontSize="13" fill="#1d4fb8">not be back.</text>
      </g>
      {/* empty stage: curtains and a spotlight on an empty chair */}
      <path d="M500 20 q20 130 -6 270 h60 q-22 -140 6 -270 z" fill="#8f1420" />
      <path d="M770 20 q-20 130 6 270 h-60 q22 -140 -6 -270 z" fill="#8f1420" />
      <rect x="494" y="14" width="284" height="18" fill="#5e0d15" />
      <path d="M636 30 L566 286 H706 Z" fill={PAPER} opacity="0.12" />
      <ellipse cx="636" cy="286" rx="72" ry="10" fill={PAPER} opacity="0.18" />
      <path d="M612 286 v-52 h48 v52 M612 258 h48 M616 234 v-44 h40 v44" fill="none" stroke={PAPER} strokeWidth="5" strokeLinejoin="round" />
      <Stamp x={450} y={280} text="MISSING" rot={-8} />
    </Frame>
  );
}

function Generic() {
  return (
    <Frame label="A case folder and a magnifying glass">
      <path d="M130 90 h160 l26 26 h250 v170 h-436 z" fill="#b08a4f" />
      <rect x="150" y="130" width="400" height="140" fill={PAPER} />
      {[156, 176, 196, 216, 236].map((y) => (
        <rect key={y} x="172" y={y} width="300" height="7" fill="#b9ab97" />
      ))}
      <Stamp x={410} y={190} text="CASE FILE" rot={-9} />
      <circle cx="640" cy="130" r="52" fill="none" stroke={PAPER} strokeWidth="10" />
      <path d="M676 168 l56 60" stroke={PAPER} strokeWidth="14" strokeLinecap="round" />
    </Frame>
  );
}

const ART: Record<string, () => React.ReactElement> = { "CASE-A": LockedRoom, "CASE-B": LeakedPaper, "CASE-C": MuseumHeist, "CASE-D": MissingPerson };

export default function CaseArt({ code }: { code: string }) {
  const Art = ART[code] ?? Generic;
  return <Art />;
}
