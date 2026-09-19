// In-place editor, deliberately plain.
//
// Everything defaults to going ON the contact card, so one scan hands over the
// lot. Each link is a single line: what it is, the handle, and a way to remove
// it. No labels, no reordering, no per-row chrome.

import { TYPES } from './rows.js';
import { iconSvg } from './icons.js';
import { el, rid } from './dom.js';
import { CAPS } from './store.js';
import { buildVCard, VCARD_BUDGET } from './vcard.js';
import { COUNTRIES, flag, splitE164, toE164, guessIso, rememberIso } from './countries.js';

// Derived from the registry in declaration order, so adding a service is one
// entry in rows.js and nothing else. `sms` was absent from the old hand-written
// list, which made a fully-registered type impossible to create.
const ADDABLE = Object.keys(TYPES).filter((t) => TYPES[t].addable !== false);


// Country selector plus the national number, so nobody has to know what "+"
// means or which code their country uses. The stored value stays E.164.
function phoneRow(labelText, value, onchange) {
  const wrap = el('div', 'f');
  const lab = el('label', 'f__label', labelText);
  const box = el('div', 'phone');

  const split = splitE164(value);
  let iso = split.iso || guessIso();

  const select = el('select', 'phone__cc');
  select.setAttribute('aria-label', 'Country code');
  for (const c of COUNTRIES) {
    const o = el('option', null, `${flag(c.iso)} +${c.dial}  ${c.name}`);
    o.value = c.iso;
    if (c.iso === iso) o.selected = true;
    select.appendChild(o);
  }

  const input = el('input', 'f__input phone__num');
  input.type = 'tel';
  input.autocomplete = 'tel-national';
  input.id = rid('ph');
  input.placeholder = 'Phone number';
  input.maxLength = 20;
  input.value = split.national || '';
  lab.htmlFor = input.id;

  const hint = el('p', 'f__hint');

  const emit = () => {
    const e164 = toE164(iso, input.value);
    // Not validation -- just showing back exactly what will be handed over, so a
    // wrong country or a stray digit is visible without anything being blocked.
    hint.textContent = e164 ? `Shares as ${e164}` : '';
    onchange(e164);
  };

  select.addEventListener('change', () => { iso = select.value; rememberIso(iso); emit(); });
  input.addEventListener('input', () => {
    // Paste a full international number and the selector follows it.
    if (/^\+/.test(input.value)) {
      const s2 = splitE164(input.value);
      if (s2.iso) { iso = s2.iso; select.value = iso; input.value = s2.national; rememberIso(iso); }
    }
    emit();
  });

  box.appendChild(select);
  box.appendChild(input);
  wrap.appendChild(lab);
  wrap.appendChild(box);
  wrap.appendChild(hint);
  emit();
  return { wrap, input, err: hint };
}

function row(labelText, value, oninput, opts = {}) {
  const wrap = el('div', 'f');
  const lab = el('label', 'f__label', labelText);
  const input = el('input', 'f__input');
  input.type = opts.type || 'text';
  input.id = rid('f');
  lab.htmlFor = input.id;
  if (opts.autocomplete) input.autocomplete = opts.autocomplete;
  if (opts.placeholder) input.placeholder = opts.placeholder;
  input.maxLength = opts.maxlength || CAPS.handle;
  input.value = value ?? '';
  input.addEventListener('input', () => oninput(input.value));
  wrap.appendChild(lab);
  wrap.appendChild(input);
  // A parenthetical inside a label is a footnote; this puts it under the field.
  if (opts.hint) wrap.appendChild(el('p', 'f__hint', opts.hint));
  const err = el('p', 'f__err');
  wrap.appendChild(err);
  return { wrap, input, err };
}

export function renderEditor(root, profile, { onChange, onDone }) {
  root.textContent = '';
  const p = profile;
  const c = p.contact;

  // Declared up front: the phone control reports its initial value during
  // construction, which runs repaint() before the rest of the form exists.
  const summary = el('p', 'summary');

  const repaint = () => { onChange(); paintSummary(); };

  /* ---------- contact card ---------- */
  const card = el('section', 'block');
  card.appendChild(el('h2', 'block__h', 'Your details'));
  if (p.cardName !== undefined) {
    const nm = row('Card name', p.cardName, (v) => { p.cardName = v; repaint(); },
      { placeholder: 'Enterprise, EMEA, personal\u2026', maxlength: CAPS.label, hint: 'Only you see this.' });
    card.appendChild(nm.wrap);
  }
  card.appendChild(el('p', 'block__hint',
    'Your name, number, email and website all go on the one code you hold up. It works with no internet, and they need no app.'));

  const name = row('Name', c.fullName, (v) => {
    c.fullName = v; repaint();
  }, { autocomplete: 'name', placeholder: 'Your name', maxlength: CAPS.name });
  card.appendChild(name.wrap);

  card.appendChild(phoneRow('Phone', c.phone, (e164) => { c.phone = e164; repaint(); }).wrap);

  card.appendChild(row('Email', c.email, (v) => { c.email = v; repaint(); },
    { type: 'email', autocomplete: 'email', placeholder: 'you@example.com' }).wrap);
  card.appendChild(row('Website', c.url, (v) => { c.url = v; repaint(); },
    { type: 'url', placeholder: 'example.com' }).wrap);

  const pair = el('div', 'pair');
  pair.appendChild(row('Organisation', c.org, (v) => { c.org = v; repaint(); },
    { placeholder: 'Optional', maxlength: CAPS.label }).wrap);
  pair.appendChild(row('Job title', c.title, (v) => { c.title = v; repaint(); },
    { placeholder: 'Optional', maxlength: CAPS.label }).wrap);
  card.appendChild(pair);

  root.appendChild(card);

  /* ---------- links ---------- */
  const links = el('section', 'block');
  links.appendChild(el('h2', 'block__h', 'Links'));
  links.appendChild(el('p', 'block__hint',
    'Each one also gets its own code, so you can share just that.'));

  const list = el('ul', 'links');
  links.appendChild(list);

  function paintLinks(focusId) {
    list.textContent = '';

    if (!p.items.length) {
      list.appendChild(el('li', 'links__empty', 'None yet. Your details above already work on their own.'));
    }

    p.items.forEach((item, idx) => {
      const t = TYPES[item.type] || { label: item.type, input: 'text' };
      const li = el('li', 'link');

      const glyph = iconSvg(item.type, { size: 20 });
      if (glyph) {
        const holder = el('span', 'link__icon');
        holder.appendChild(glyph);
        li.appendChild(holder);
      }

      const isPhone = t.input === 'phone';
      const f = isPhone
        ? phoneRow(t.label, item.handle, (e164) => { item.handle = e164; repaint(); })
        : row(t.label, item.handle, (v) => { item.handle = v; repaint(); }, {
            type: t.input === 'email' ? 'email' : 'text',
            placeholder: t.input === 'handle' ? 'yourname'
              : t.input === 'url' ? 'example.com/page' : '',
          });
      f.wrap.classList.add('link__f');
      li.appendChild(f.wrap);

      const side = el('div', 'link__side');

      const del = el('button', 'iconbtn', '✕');
      del.type = 'button';
      del.setAttribute('aria-label', `Remove ${t.label}`);
      del.onclick = () => { p.items.splice(idx, 1); repaint(); paintLinks(); };
      side.appendChild(del);

      li.appendChild(side);
      list.appendChild(li);

      if (focusId === item.id) f.input.focus();
    });
  }

  paintLinks();

  const add = el('div', 'add');
  const select = el('select', 'add__select');
  select.setAttribute('aria-label', 'Type of link to add');
  for (const type of ADDABLE) {
    const o = el('option', null, TYPES[type].label);
    o.value = type;
    select.appendChild(o);
  }
  const addBtn = el('button', 'btn', 'Add');
  addBtn.type = 'button';
  addBtn.onclick = () => {
    const type = select.value;
    const item = {
      id: rid('i'),
      type,
      handle: '',
    };
    p.items.push(item);
    repaint();
    paintLinks(item.id);
  };
  add.appendChild(select);
  add.appendChild(addBtn);
  links.appendChild(add);

  root.appendChild(links);

  /* ---------- live size, so nothing vanishes silently ---------- */
  root.appendChild(summary);

  function paintSummary() {
    const card = buildVCard(p);
    const bits = [`Contact code: ${card.chars} characters`];
    if (card.dropped.length) bits.push(`Too long — not included: ${card.dropped.join(', ')}`);
    summary.textContent = bits.join(' · ');
    summary.classList.toggle('is-warn', card.dropped.length > 0 || card.chars > VCARD_BUDGET);
  }
  paintSummary();

  const done = el('button', 'btn btn--primary btn--wide', 'Done');
  done.type = 'button';
  done.onclick = onDone;
  root.appendChild(done);

}
