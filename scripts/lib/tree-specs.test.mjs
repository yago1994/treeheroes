import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTreeSpecs, treesFromLabelPairs, isKnownReason } from './tree-specs.mjs';

// Accela emits label and value with no separator, so values run straight into
// the next label. These fixtures are real shapes taken from docs/data.
const TRAILER =
  '\n\t\t\n\t\n\t\n                                \n                                         Parcel Information\n' +
  '\t\tParcel Number:17 01110002107 *Block:--Lot:--Subdivision:--';

test('splits a multi-tree permit into one entry per tree', () => {
  const blob =
    'Structurally damaged with uncorrectable defect' +
    'Reason for Removal:Uncorrectable defect' +
    'Comments:Recent failure caused damages to adjacent property' +
    '\n\t\t\n\t\t\n\t\t\tTree number:2Species:Quercus nigraTree Size (DBH):39' +
    'Tree location:Front at streetDescription of Tree:Hazardous' +
    'Reason for Removal:Significant cavity/area of decayComments:Significant defects' +
    TRAILER;

  const trees = parseTreeSpecs(blob, { leadingField: 'tree_description' });
  assert.equal(trees.length, 2);
  assert.deepEqual(trees[0], {
    tree_number: null,
    species: null,
    tree_dbh: null,
    tree_location: null,
    tree_description: 'Structurally damaged with uncorrectable defect',
    reason_removal: 'Uncorrectable defect',
    comments: 'Recent failure caused damages to adjacent property',
  });
  assert.deepEqual(trees[1], {
    tree_number: '2',
    species: 'Quercus nigra',
    tree_dbh: '39',
    tree_location: 'Front at street',
    tree_description: 'Hazardous',
    reason_removal: 'Significant cavity/area of decay',
    comments: 'Significant defects',
  });
});

test('drops the Parcel Information panel that follows the table', () => {
  const [tree] = parseTreeSpecs('Potentially hazardousReason for Removal:Other' + TRAILER, {
    leadingField: 'tree_description',
  });
  assert.equal(tree.tree_description, 'Potentially hazardous');
  assert.equal(tree.reason_removal, 'Other');
  assert.equal(tree.comments, null);
});

test('keeps a species containing "t" whole', () => {
  // The old extractor used /Species:\s*([^T]+?)(?=Tree Size|$)/i here.
  const [tree] = parseTreeSpecs('Tree number:1Species:Water OakTree Size (DBH):30Tree location:Front yard');
  assert.equal(tree.species, 'Water Oak');
  assert.equal(tree.tree_location, 'Front yard');
});

test('treats an unrecognised removal reason as free text, not a new block', () => {
  // An applicant typed the label into the description box.
  const trees = parseTreeSpecs(
    'Reason for Removal: The subject tree has a large open cavity.Reason for Removal:Diseased' + TRAILER,
    { leadingField: 'tree_description' }
  );
  assert.equal(trees.length, 1);
  assert.equal(trees[0].reason_removal, 'Diseased');
  assert.match(trees[0].tree_description, /large open cavity/);
});

test('omits a tree block that has no fields', () => {
  assert.deepEqual(parseTreeSpecs(''), []);
  assert.deepEqual(parseTreeSpecs(TRAILER, { leadingField: 'tree_description' }), []);
});

test('groups DOM label/value pairs without inferring anything from text', () => {
  const trees = treesFromLabelPairs([
    { label: 'Tree number:', value: '1' },
    { label: 'Species:', value: 'Tulip Poplar' },
    { label: 'Tree Size (DBH):', value: '35' },
    { label: 'Tree location:', value: 'Rear yard' },
    { label: 'Reason for Removal:', value: 'Dead tree' },
    { label: 'Tree number:', value: '2' },
    { label: 'Species:', value: 'Pine' },
    { label: 'Tree Size (DBH):', value: '21' },
    { label: 'Tree location:', value: 'Front' },
    { label: 'Reason for Removal:', value: 'Dying tree' },
  ]);
  assert.equal(trees.length, 2);
  assert.equal(trees[0].species, 'Tulip Poplar');
  assert.equal(trees[0].reason_removal, 'Dead tree');
  assert.equal(trees[1].species, 'Pine');
  assert.equal(trees[1].tree_description, null);
});

test('isKnownReason matches the permit dropdown only', () => {
  assert.ok(isKnownReason('Dead tree'));
  assert.ok(isKnownReason('significant cavity/area of decay'));
  assert.ok(!isKnownReason('Removal is recommended to eliminate the hazard.'));
  assert.ok(!isKnownReason(null));
});
