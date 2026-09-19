// Small shared helpers. These existed in two or three copies each, which is how
// they drifted -- one id generator used an `i_` prefix where the others used `i`.

export const $ = (id) => document.getElementById(id);

export function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

// Short, collision-resistant enough for ids that only ever live in one profile.
export const rid = (prefix) => `${prefix}${Math.random().toString(36).slice(2, 9)}`;
