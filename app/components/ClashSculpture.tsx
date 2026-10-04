import InteractiveClashSculpture from "./InteractiveClashSculpture";
import { CLASH_BRAND } from "../../lib/clash-brand";

/** A code-native brand object: two folded forms meeting in space. */
export default function ClashSculpture({ variant = "discover" }: { variant?: "discover" | "arena" | "champions" }) {
  const id = `clash-object-${variant}`;
  const sculpture = <svg viewBox="0 0 520 520" fill="none" focusable="false" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-cyan`} x1="140" y1="100" x2="285" y2="345" gradientUnits="userSpaceOnUse">
          <stop stopColor="#89cbd0" /><stop offset=".4" stopColor="#58b6c1" /><stop offset="1" stopColor="#167e91" />
        </linearGradient>
        <linearGradient id={`${id}-purple`} x1="250" y1="235" x2="425" y2="365" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7044a7" /><stop offset=".3" stopColor="#c6b4de" /><stop offset=".4" stopColor="#e3d9ed" /><stop offset=".5" stopColor="#9576bd" /><stop offset=".75" stopColor="#5a318e" /><stop offset="1" stopColor="#4b257c" />
        </linearGradient>
        <linearGradient id={`${id}-edge`} x1="100" y1="180" x2="370" y2="400" gradientUnits="userSpaceOnUse">
          <stop stopColor="#c0e1e5" /><stop offset=".45" stopColor="#245e70" /><stop offset="1" stopColor="#87b8c3" />
        </linearGradient>
        <radialGradient id={`${id}-pearl`} cx=".32" cy=".28" r=".7">
          <stop stopColor="#fff" /><stop offset=".24" stopColor="#edf2f3" /><stop offset=".48" stopColor="#b6c4cf" /><stop offset=".67" stopColor="#526071" /><stop offset=".78" stopColor="#657187" /><stop offset=".92" stopColor="#d3d7e2" /><stop offset="1" stopColor="#7d8b9d" />
        </radialGradient>
        <filter id={`${id}-shadow`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="13" />
        </filter>
      </defs>
      <ellipse cx="273" cy="420" rx="142" ry="18" fill="#4e5266" opacity=".11" filter={`url(#${id}-shadow)`} />
      <g className="sculpture-fold sculpture-fold--cyan">
        <path d="M248 87L108 240L238 345L254 328L127 238L265 99Z" fill={`url(#${id}-edge)`} />
        <path d="M248 87L108 240L238 345L244 225Z" fill={`url(#${id}-cyan)`} />
        <path d="M108 240L244 225L238 345Z" fill={CLASH_BRAND.cyan.dark} opacity=".42" />
        <path d="M248 87L244 225L108 240" stroke="#dcfcff" strokeOpacity=".35" strokeWidth=".8" />
        <path d="M238 345L254 328L265 99L248 87" fill="#07596b" opacity=".68" />
      </g>
      <g className="sculpture-fold sculpture-fold--violet">
        <path d="M288 182L426 288L280 437L262 425L407 285L270 197Z" fill={CLASH_BRAND.purple.dark} />
        <path d="M288 182L426 288L280 437L285 303Z" fill={`url(#${id}-purple)`} />
        <path d="M288 182L285 303L426 288Z" fill="#b3a0ca" opacity=".18" />
        <path d="M288 182L285 303L280 437" stroke="#efe0ff" strokeOpacity=".4" strokeWidth=".8" />
        <path d="M280 437L262 425L270 197L288 182" fill="#4e2096" opacity=".68" />
      </g>
      <g className="sculpture-core">
        <circle cx="260" cy="239" r="19" fill={`url(#${id}-pearl)`} />
      </g>
    </svg>;
  return <div className={`clash-sculpture clash-sculpture--${variant}`} aria-hidden={variant !== "discover" ? true : undefined}>
    {variant === "discover" ? <InteractiveClashSculpture>{sculpture}</InteractiveClashSculpture> : <>{sculpture}<div className="sculpture-caption"><span>INDEPENDENT BY DESIGN</span><span>↗</span></div></>}
  </div>;
}
