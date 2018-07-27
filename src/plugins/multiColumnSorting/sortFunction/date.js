import moment from 'moment';
import {isEmpty} from 'handsontable/helpers/mixed';
import {DO_NOT_SWAP, FIRST_BEFORE_SECOND, FIRST_AFTER_SECOND} from '../sortEngine';

/**
 * Date sorting compare function factory. Method get as parameters `sortOrder` and `columnMeta` and return compare function.
 *
 * @param {Array} sortOrder Sort order.
 * @param {Array} columnMeta Column meta objects.
 * @returns {Function} The compare function.
 */
export default function dateSort(sortOrder, columnMeta) {
  return function(value, nextValue) {
    const {sortEmptyCells} = columnMeta.multiColumnSorting;

    if (value === nextValue) {
      return DO_NOT_SWAP;
    }

    if (isEmpty(value)) {
      if (isEmpty(nextValue)) {
        return DO_NOT_SWAP;
      }

      // Just fist value is empty and `sortEmptyCells` option was set
      if (sortEmptyCells) {
        return sortOrder === 'asc' ? FIRST_BEFORE_SECOND : FIRST_AFTER_SECOND;
      }

      return FIRST_AFTER_SECOND;
    }

    if (isEmpty(nextValue)) {
      // Just second value is empty and `sortEmptyCells` option was set
      if (sortEmptyCells) {
        return sortOrder === 'asc' ? FIRST_AFTER_SECOND : FIRST_BEFORE_SECOND;
      }

      return FIRST_BEFORE_SECOND;
    }

    const dateFormat = columnMeta.dateFormat;
    const firstDate = moment(value, dateFormat);
    const nextDate = moment(nextValue, dateFormat);

    if (!firstDate.isValid()) {
      return FIRST_AFTER_SECOND;
    }

    if (!nextDate.isValid()) {
      return FIRST_BEFORE_SECOND;
    }

    if (nextDate.isAfter(firstDate)) {
      return sortOrder === 'asc' ? FIRST_BEFORE_SECOND : FIRST_AFTER_SECOND;
    }

    if (nextDate.isBefore(firstDate)) {
      return sortOrder === 'asc' ? FIRST_AFTER_SECOND : FIRST_BEFORE_SECOND;
    }

    return DO_NOT_SWAP;
  };
}
