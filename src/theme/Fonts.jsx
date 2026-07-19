import { F, T } from "./tokens";

export const Fonts = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Marcellus&family=Karla:wght@400;500;600;700&display=swap');
    * { box-sizing: border-box; }
    input, select, button, textarea { font-family: ${F}; }
    input:focus-visible, select:focus-visible, button:focus-visible { outline: 2px solid ${T.accent}; outline-offset: 2px; }
    @media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
  `}</style>
);
