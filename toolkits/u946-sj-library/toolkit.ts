import { defineToolkit } from '@student-api';

// Name the toolkit and label the two counts in Properties.
export default defineToolkit({
  name: 'u946-sj-library',
  custom: {
    nodes: {
      bookshelves: { kind: 'number', min: 0, label: 'Number of bookshelves' },
      desks: { kind: 'number', min: 0, label: 'Number of desks' },
    },
  },
});
