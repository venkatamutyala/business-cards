// ISO2 | dialling code | name.
//
// Used for the phone country selector. Order within a shared code matters: the
// first entry for a code is the one an existing number splits back to, so the
// larger territory is listed first (US before CA for +1).

import { isoFromTimezone } from './timezones.js';

const DATA = `US|1|United States;CA|1|Canada;RU|7|Russia;KZ|7|Kazakhstan;EG|20|Egypt;ZA|27|South Africa;
GR|30|Greece;NL|31|Netherlands;BE|32|Belgium;FR|33|France;ES|34|Spain;HU|36|Hungary;IT|39|Italy;
RO|40|Romania;CH|41|Switzerland;AT|43|Austria;GB|44|United Kingdom;DK|45|Denmark;SE|46|Sweden;
NO|47|Norway;PL|48|Poland;DE|49|Germany;PE|51|Peru;MX|52|Mexico;CU|53|Cuba;AR|54|Argentina;
BR|55|Brazil;CL|56|Chile;CO|57|Colombia;VE|58|Venezuela;MY|60|Malaysia;AU|61|Australia;
ID|62|Indonesia;PH|63|Philippines;NZ|64|New Zealand;SG|65|Singapore;TH|66|Thailand;JP|81|Japan;
KR|82|South Korea;VN|84|Vietnam;CN|86|China;TR|90|Turkey;IN|91|India;PK|92|Pakistan;
AF|93|Afghanistan;LK|94|Sri Lanka;MM|95|Myanmar;IR|98|Iran;SS|211|South Sudan;MA|212|Morocco;
DZ|213|Algeria;TN|216|Tunisia;LY|218|Libya;GM|220|Gambia;SN|221|Senegal;MR|222|Mauritania;
ML|223|Mali;GN|224|Guinea;CI|225|Ivory Coast;BF|226|Burkina Faso;NE|227|Niger;TG|228|Togo;
BJ|229|Benin;MU|230|Mauritius;LR|231|Liberia;SL|232|Sierra Leone;GH|233|Ghana;NG|234|Nigeria;
TD|235|Chad;CF|236|Central African Republic;CM|237|Cameroon;CV|238|Cape Verde;
ST|239|Sao Tome and Principe;GQ|240|Equatorial Guinea;GA|241|Gabon;CG|242|Congo;
CD|243|DR Congo;AO|244|Angola;GW|245|Guinea-Bissau;IO|246|Diego Garcia;SC|248|Seychelles;
SD|249|Sudan;RW|250|Rwanda;ET|251|Ethiopia;SO|252|Somalia;DJ|253|Djibouti;KE|254|Kenya;
TZ|255|Tanzania;UG|256|Uganda;BI|257|Burundi;MZ|258|Mozambique;ZM|260|Zambia;MG|261|Madagascar;
RE|262|Reunion;ZW|263|Zimbabwe;NA|264|Namibia;MW|265|Malawi;LS|266|Lesotho;BW|267|Botswana;
SZ|268|Eswatini;KM|269|Comoros;SH|290|Saint Helena;ER|291|Eritrea;AW|297|Aruba;
FO|298|Faroe Islands;GL|299|Greenland;GI|350|Gibraltar;PT|351|Portugal;LU|352|Luxembourg;
IE|353|Ireland;IS|354|Iceland;AL|355|Albania;MT|356|Malta;CY|357|Cyprus;FI|358|Finland;
BG|359|Bulgaria;LT|370|Lithuania;LV|371|Latvia;EE|372|Estonia;MD|373|Moldova;AM|374|Armenia;
BY|375|Belarus;AD|376|Andorra;MC|377|Monaco;SM|378|San Marino;VA|379|Vatican City;
UA|380|Ukraine;RS|381|Serbia;ME|382|Montenegro;XK|383|Kosovo;HR|385|Croatia;SI|386|Slovenia;
BA|387|Bosnia and Herzegovina;MK|389|North Macedonia;CZ|420|Czechia;SK|421|Slovakia;
LI|423|Liechtenstein;FK|500|Falkland Islands;BZ|501|Belize;GT|502|Guatemala;SV|503|El Salvador;
HN|504|Honduras;NI|505|Nicaragua;CR|506|Costa Rica;PA|507|Panama;PM|508|Saint Pierre;
HT|509|Haiti;GP|590|Guadeloupe;BO|591|Bolivia;GY|592|Guyana;EC|593|Ecuador;GF|594|French Guiana;
PY|595|Paraguay;MQ|596|Martinique;SR|597|Suriname;UY|598|Uruguay;CW|599|Curacao;
TL|670|Timor-Leste;NF|672|Norfolk Island;BN|673|Brunei;NR|674|Nauru;PG|675|Papua New Guinea;
TO|676|Tonga;SB|677|Solomon Islands;VU|678|Vanuatu;FJ|679|Fiji;PW|680|Palau;WF|681|Wallis and Futuna;
CK|682|Cook Islands;NU|683|Niue;WS|685|Samoa;KI|686|Kiribati;NC|687|New Caledonia;TV|688|Tuvalu;
PF|689|French Polynesia;TK|690|Tokelau;FM|691|Micronesia;MH|692|Marshall Islands;
KP|850|North Korea;HK|852|Hong Kong;MO|853|Macau;KH|855|Cambodia;LA|856|Laos;BD|880|Bangladesh;
TW|886|Taiwan;MV|960|Maldives;LB|961|Lebanon;JO|962|Jordan;SY|963|Syria;IQ|964|Iraq;
KW|965|Kuwait;SA|966|Saudi Arabia;YE|967|Yemen;OM|968|Oman;PS|970|Palestine;AE|971|United Arab Emirates;
IL|972|Israel;BH|973|Bahrain;QA|974|Qatar;BT|975|Bhutan;MN|976|Mongolia;NP|977|Nepal;
TJ|992|Tajikistan;TM|993|Turkmenistan;AZ|994|Azerbaijan;GE|995|Georgia;KG|996|Kyrgyzstan;
UZ|998|Uzbekistan;AG|1268|Antigua and Barbuda;BS|1242|Bahamas;BB|1246|Barbados;
BM|1441|Bermuda;VG|1284|British Virgin Islands;KY|1345|Cayman Islands;DM|1767|Dominica;
DO|1809|Dominican Republic;GD|1473|Grenada;JM|1876|Jamaica;MS|1664|Montserrat;
PR|1787|Puerto Rico;KN|1869|Saint Kitts and Nevis;LC|1758|Saint Lucia;
VC|1784|Saint Vincent;SX|1721|Sint Maarten;TT|1868|Trinidad and Tobago;
TC|1649|Turks and Caicos;VI|1340|US Virgin Islands;
AS|1684|American Samoa;GU|1671|Guam;MP|1670|Northern Mariana Islands;
EH|212|Western Sahara;PN|64|Pitcairn Islands;GS|500|South Georgia;
AI|1264|Anguilla;AX|358|Aland Islands;BL|590|Saint Barthelemy;MF|590|Saint Martin;
GG|44|Guernsey;JE|44|Jersey;IM|44|Isle of Man;YT|262|Mayotte;
BQ|599|Caribbean Netherlands;SJ|47|Svalbard;CX|61|Christmas Island;CC|61|Cocos Islands;
TF|262|French Southern Territories;UM|1|US Minor Outlying Islands`;

export const COUNTRIES = DATA
  .replace(/\s*\n\s*/g, '')
  .split(';')
  .filter(Boolean)
  .map((row) => {
    const [iso, dial, name] = row.split('|');
    return { iso, dial, name };
  });

// Regional indicator pair, so no image assets and no external requests.
export function flag(iso) {
  if (!/^[A-Z]{2}$/.test(iso)) return '';
  return String.fromCodePoint(
    0x1f1e6 + iso.charCodeAt(0) - 65,
    0x1f1e6 + iso.charCodeAt(1) - 65
  );
}

export const byIso = (iso) => COUNTRIES.find((c) => c.iso === iso) || null;

// Longest dial code wins, so +1268 (Antigua) beats +1 (US).
export function splitE164(value) {
  const v = String(value ?? '').replace(/[^\d+]/g, '');
  if (!v.startsWith('+')) return { iso: null, national: v.replace(/\D/g, '') };
  const digits = v.slice(1);
  let best = null;
  for (const c of COUNTRIES) {
    if (digits.startsWith(c.dial) && (!best || c.dial.length > best.dial.length)) best = c;
  }
  if (!best) return { iso: null, national: digits };
  return { iso: best.iso, national: digits.slice(best.dial.length) };
}

// Most countries use a leading 0 as a national trunk prefix which is DROPPED in
// international format: 020 7123 4567 -> +44 20 7123 4567. Italy is the well
// known exception, where the leading 0 is part of the number itself.
const TRUNK_ZERO_KEPT = new Set(['IT']);

export function stripTrunk(iso, national) {
  const n = String(national ?? '').replace(/\D/g, '');
  if (TRUNK_ZERO_KEPT.has(iso)) return n;
  return n.replace(/^0+/, '');
}

export function toE164(iso, national) {
  const c = byIso(iso);
  if (!c) {
    const raw = String(national ?? '').replace(/\D/g, '');
    return raw ? `+${raw}` : '';
  }
  const n = stripTrunk(iso, national);
  if (!n) return '';
  return `+${c.dial}${n}`;
}

import { registerKey } from './store.js';
const LAST_CC = registerKey('q4m.cc');

// Where the device thinks it is, in order of how much the signal is worth:
//
// 1. Whatever country was picked last on this device. If the guess was wrong
//    once, it should not be wrong again.
// 2. The device TIMEZONE. This reflects where the phone actually is, and is the
//    strongest automatic signal available to a web page.
// 3. The locale region, expanded via Intl.Locale so a bare "en" still resolves.
// 4. A raw region subtag from any of the accept-languages.
//
// No geolocation prompt: asking for location permission to guess a dialling
// code would be wildly out of proportion.
export function guessIso() {
  try {
    const remembered = localStorage.getItem(LAST_CC);
    if (remembered && byIso(remembered)) return remembered;
  } catch { /* storage may be unavailable */ }

  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const iso = isoFromTimezone(zone);
    if (iso && byIso(iso)) return iso;
  } catch { /* older engines */ }

  const tags = [navigator.language, ...(navigator.languages || [])].filter(Boolean);
  for (const tag of tags) {
    try {
      const region = new Intl.Locale(tag).maximize().region;
      if (region && byIso(region)) return region;
    } catch { /* Intl.Locale is not everywhere */ }
  }
  for (const tag of tags) {
    const region = String(tag).split('-')[1];
    if (region && byIso(region.toUpperCase())) return region.toUpperCase();
  }

  return 'US';
}

// Remembered so a wrong guess only has to be corrected once. Kept out of the
// profile record so it can never leak into a backup link or the contact card.
export function rememberIso(iso) {
  if (!byIso(iso)) return;
  try { localStorage.setItem(LAST_CC, iso); } catch { /* ignore */ }
}
