/** A strip of red crime-scene tape with repeated words. Decorative. */
export default function CrimeTape({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden className={`crime-tape ${className}`}>
      {Array.from({ length: 14 }, () => "Crime scene · do not cross · ").join("")}
    </div>
  );
}
