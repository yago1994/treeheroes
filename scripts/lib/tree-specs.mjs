/**
 * Parser for the "TREE SPECS" section of an Accela permit detail page.
 *
 * Accela renders one block per tree, always in this field order:
 *
 *   Tree number / Species / Tree Size (DBH) / Tree location /
 *   Description of Tree / Reason for Removal / Comments
 *
 * `Description of Tree` and `Comments` are optional. The page emits label and
 * value with no separator between them, so values run straight into the next
 * label ("...Reason for Removal:Dead treeComments:..."). Splitting has to be
 * anchored on the label vocabulary, not on whitespace.
 */

/** Labels in the order Accela emits them, mapped to our record field names. */
const FIELDS = [
  { label: 'Tree number', key: 'tree_number' },
  { label: 'Species', key: 'species' },
  { label: 'Tree Size (DBH)', key: 'tree_dbh' },
  { label: 'Tree location', key: 'tree_location' },
  { label: 'Description of Tree', key: 'tree_description' },
  { label: 'Reason for Removal', key: 'reason_removal' },
  { label: 'Comments', key: 'comments' },
];

export const TREE_FIELD_KEYS = FIELDS.map((f) => f.key);

/** The nine values Accela's "Reason for Removal" dropdown can hold. */
export const REMOVAL_REASONS = [
  'Dead tree',
  'Dying tree',
  'Diseased',
  'Uncorrectable defect',
  'Significant cavity/area of decay',
  'Invasive/undesirable tree',
  'Within 5 ft of occupied dwelling',
  'Unpermitted destruction',
  'Other',
];

const LABEL_RE = new RegExp(
  `(${FIELDS.map((f) => f.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\s*:`,
  'gi'
);

/**
 * Everything from the "Parcel Information" panel onward is a sibling section
 * that bleeds into the last tree's value when the page is read as plain text.
 */
const TRAILER_RE = /\s*(?:Parcel Information|Parcel Number\s*:|Block\s*:\s*--)[\s\S]*$/i;

function clean(value) {
  if (value == null) return null;
  const text = String(value)
    .replace(TRAILER_RE, '')
    // Accela pads its table layout with long runs of tabs/newlines/spaces.
    .replace(/[\s ]+/g, ' ')
    .trim();
  return text ? text : null;
}

function emptyTree() {
  return Object.fromEntries(TREE_FIELD_KEYS.map((k) => [k, null]));
}

function hasContent(tree) {
  return TREE_FIELD_KEYS.some((k) => tree[k] != null);
}

/**
 * Parse a TREE SPECS text blob into one entry per tree.
 *
 * `leadingField` names the field the text starts in the middle of, for blobs
 * that were captured from part-way through the first tree's block (our stored
 * `tree_description` values are exactly that). Pass null when the text starts
 * at a label.
 */
export function parseTreeSpecs(text, { leadingField = null } = {}) {
  if (!text) return [];

  const matches = [...String(text).matchAll(LABEL_RE)];
  const trees = [];
  let current = emptyTree();

  const assign = (key, raw) => {
    const value = clean(raw);
    if (value == null) return;
    // A repeated field means Accela started a new block without a tree number.
    if (current[key] != null) {
      trees.push(current);
      current = emptyTree();
    }
    current[key] = value;
  };

  if (leadingField) {
    const head = matches.length ? String(text).slice(0, matches[0].index) : String(text);
    assign(leadingField, head);
  }


  let carry = null; // field to append stray text to, see the known-reason check
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const label = m[1].toLowerCase();
    const field = FIELDS.find((f) => f.label.toLowerCase() === label);
    if (!field) continue;

    const start = m.index + m[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    const raw = String(text).slice(start, end);

    // "Reason for Removal" has a closed vocabulary. A value outside it means an
    // applicant typed the label into a free-text box, so the whole thing —
    // label included — belongs to the field we were already filling.
    if (field.key === 'reason_removal' && !isKnownReason(clean(raw))) {
      const target = carry || 'tree_description';
      current[target] = clean([current[target], m[0], raw].filter(Boolean).join(' '));
      continue;
    }

    // "Tree number" always opens a block, so flush whatever we were building.
    if (field.key === 'tree_number' && hasContent(current)) {
      trees.push(current);
      current = emptyTree();
    }
    assign(field.key, raw);
    carry = field.key;
  }

  if (hasContent(current)) trees.push(current);
  return trees;
}

/** True when the reason came out as one of Accela's dropdown values. */
export function isKnownReason(reason) {
  return reason != null && REMOVAL_REASONS.some((r) => r.toLowerCase() === reason.toLowerCase());
}

/**
 * Build the per-tree list from ordered {label, value} pairs scraped straight
 * out of the DOM. Preferred over {@link parseTreeSpecs}: the values are already
 * separated, so nothing has to be inferred from concatenated text.
 */
export function treesFromLabelPairs(pairs) {
  const trees = [];
  let current = emptyTree();

  for (const { label, value } of pairs || []) {
    const normalized = String(label || '').replace(/\s*:\s*$/, '').trim().toLowerCase();
    const field = FIELDS.find((f) => f.label.toLowerCase() === normalized);
    if (!field) continue;

    if ((field.key === 'tree_number' || current[field.key] != null) && hasContent(current)) {
      trees.push(current);
      current = emptyTree();
    }
    current[field.key] = clean(value);
  }

  if (hasContent(current)) trees.push(current);
  return trees;
}

export { clean as cleanTreeValue };
