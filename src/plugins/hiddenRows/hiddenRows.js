import BasePlugin from 'handsontable/plugins/_base';
import {addClass, removeClass} from 'handsontable/helpers/dom/element';
import {rangeEach} from 'handsontable/helpers/number';
import {arrayEach, arrayFilter} from 'handsontable/helpers/array';
import {registerPlugin, getPlugin} from 'handsontable/plugins';
import hideRowItem from './contextMenuItem/hideRow';
import showRowItem from './contextMenuItem/showRow';

import './hiddenRows.css';

/**
 * @plugin HiddenRows
 * @pro
 *
 * @description
 * Plugin allows to hide certain rows. The hiding is achieved by rendering the rows with height set as 0px.
 * The plugin not modifies the source data and do not participate in data transformation (the shape of data returned
 * by `getData*` methods stays intact).
 *
 * Possible plugin settings:
 *  * `copyPasteEnabled` as `Boolean` (default `true`)
 *  * `rows` as `Array`
 *  * `indicators` as `Boolean` (default `false`)
 *
 * @example
 *
 * ```js
 * const container = document.getElementById('example');
 * const hot = new Handsontable(container, {
 *   date: getData(),
 *   hiddenRows: {
 *     copyPasteEnabled: true,
 *     indicators: true,
 *     rows: [1, 2, 5]
 *   }
 * });
 *
 * // access to hiddenRows plugin instance
 * const hiddenRowsPlugin = hot.getPlugin('hiddenRows');
 *
 * // show single row
 * hiddenRowsPlugin.showRow(1);
 *
 * // show multiple rows
 * hiddenRowsPlugin.showRow(1, 2, 9);
 *
 * // or as an array
 * hiddenRowsPlugin.showRows([1, 2, 9]);
 *
 * // hide single row
 * hiddenRowsPlugin.hideRow(1);
 *
 * // hide multiple rows
 * hiddenRowsPlugin.hideRow(1, 2, 9);
 *
 * // or as an array
 * hiddenRowsPlugin.hideRows([1, 2, 9]);
 *
 * // rerender the table to see all changes
 * hot.render();
 * ```
 */
class HiddenRows extends BasePlugin {
  constructor(hotInstance) {
    super(hotInstance);
    /**
     * Cached settings from Handsontable settings.
     *
     * @private
     * @type {Object}
     */
    this.settings = {};
    /**
     * List of hidden rows indexes.
     *
     * @private
     * @type {Number[]}
     */
    this.hiddenRows = [];
    /**
     * Last selected row index.
     *
     * @private
     * @type {Number}
     * @default -1
     */
    this.lastSelectedRow = -1;
  }

  /**
   * Checks if the plugin is enabled in the handsontable settings. This method is executed in {@link Hooks#beforeInit}
   * hook and if it returns `true` than the {@link HiddenRows#enablePlugin} method is called.
   *
   * @returns {Boolean}
   */
  isEnabled() {
    return !!this.hot.getSettings().hiddenRows;
  }

  /**
   * Enables the plugin functionality for this Handsontable instance.
   */
  enablePlugin() {
    if (this.enabled) {
      return;
    }

    if (this.hot.hasRowHeaders()) {
      this.addHook('afterGetRowHeader', (row, TH) => this.onAfterGetRowHeader(row, TH));
    } else {
      this.addHook('afterRenderer', (TD, row) => this.onAfterGetRowHeader(row, TD));
    }

    this.addHook('afterContextMenuDefaultOptions', (options) => this.onAfterContextMenuDefaultOptions(options));
    this.addHook('afterGetCellMeta', (row, col, cellProperties) => this.onAfterGetCellMeta(row, col, cellProperties));
    this.addHook('modifyRowHeight', (height, row) => this.onModifyRowHeight(height, row));
    this.addHook('beforeSetRangeStartOnly', (coords) => this.onBeforeSetRangeStartOnly(coords));
    this.addHook('beforeSetRangeStart', (coords) => this.onBeforeSetRangeStart(coords));
    this.addHook('beforeSetRangeEnd', (coords) => this.onBeforeSetRangeEnd(coords));
    this.addHook('hiddenRow', (row) => this.isHidden(row));
    this.addHook('afterCreateRow', (index, amount) => this.onAfterCreateRow(index, amount));
    this.addHook('afterRemoveRow', (index, amount) => this.onAfterRemoveRow(index, amount));

    // Dirty workaround - the section below runs only if the HOT instance is already prepared.
    if (this.hot.view) {
      this.onAfterPluginsInitialized();
    }

    super.enablePlugin();
  }

  /**
   * Updates the plugin state. This method is executed when {@link Core#updateSettings} is invoked.
   */
  updatePlugin() {
    this.disablePlugin();
    this.enablePlugin();

    this.onAfterPluginsInitialized();

    super.updatePlugin();
  }

  /**
   * Disables the plugin functionality for this Handsontable instance.
   */
  disablePlugin() {
    this.settings = {};
    this.hiddenRows = [];
    this.lastSelectedRow = -1;

    super.disablePlugin();
    this.resetCellsMeta();
  }

  /**
   * Shows the rows provided in the array.
   *
   * @param {Number[]} rows Array of row index.
   */
  showRows(rows) {
    arrayEach(rows, (row) => {
      row = parseInt(row, 10);
      row = this.getLogicalRowIndex(row);

      if (this.isHidden(row, true)) {
        this.hiddenRows.splice(this.hiddenRows.indexOf(row), 1);
      }
    });
  }

  /**
   * Shows the row provided as row index (counting from 0).
   *
   * @param {...Number} row Row index.
   */
  showRow(...row) {
    this.showRows(row);
  }

  /**
   * Hides the rows provided in the array.
   *
   * @param {Number[]} rows Array of row index.
   */
  hideRows(rows) {
    arrayEach(rows, (row) => {
      row = parseInt(row, 10);
      row = this.getLogicalRowIndex(row);

      if (!this.isHidden(row, true)) {
        this.hiddenRows.push(row);
      }
    });
  }

  /**
   * Hides the row provided as row index (counting from 0).
   *
   * @param {...Number} row Row index.
   */
  hideRow(...row) {
    this.hideRows(row);
  }

  /**
   * Checks if given row is hidden.
   *
   * @param {Number} row Column index.
   * @param {Boolean} isLogicIndex flag which determines type of index.
   * @returns {Boolean}
   */
  isHidden(row, isLogicIndex = false) {
    if (!isLogicIndex) {
      row = this.getLogicalRowIndex(row);
    }

    return this.hiddenRows.indexOf(row) > -1;
  }

  /**
   * Resets all rendered cells meta.
   *
   * @private
   */
  resetCellsMeta() {
    arrayEach(this.hot.getCellsMeta(), (meta) => {
      if (meta) {
        meta.skipRowOnPaste = false;
      }
    });
  }

  /**
   * Returns the logical index of the provided row.
   *
   * @private
   * @param {Number} row
   * @returns {Number}
   *
   * @fires Hooks#modifyRow
   */
  getLogicalRowIndex(row) {
    return this.hot.runHooks('modifyRow', row);
  }

  /**
   * Sets the copy-related cell meta.
   *
   * @private
   * @param {Number} row Row index.
   * @param {Number} col Column index.
   * @param {Object} cellProperties Cell meta object properties.
   *
   * @fires Hooks#unmodifyRow
   */
  onAfterGetCellMeta(row, col, cellProperties) {
    row = this.hot.runHooks('unmodifyRow', row);

    if (this.settings.copyPasteEnabled === false && this.isHidden(row)) {
      cellProperties.skipRowOnPaste = true;

    } else {
      cellProperties.skipRowOnPaste = false;
    }

    if (this.isHidden(row - 1)) {
      let firstSectionHidden = true;
      let i = row - 1;

      cellProperties.className = cellProperties.className || '';

      if (cellProperties.className.indexOf('afterHiddenRow') === -1) {
        cellProperties.className += ' afterHiddenRow';
      }

      do {
        if (!this.isHidden(i)) {
          firstSectionHidden = false;
          break;
        }
        i--;
      } while (i >= 0);

      if (firstSectionHidden && cellProperties.className.indexOf('firstVisibleRow') === -1) {
        cellProperties.className += ' firstVisibleRow';
      }
    } else if (cellProperties.className) {
      let classArr = cellProperties.className.split(' ');

      if (classArr.length) {
        let containAfterHiddenColumn = classArr.indexOf('afterHiddenRow');

        if (containAfterHiddenColumn > -1) {
          classArr.splice(containAfterHiddenColumn, 1);
        }

        let containFirstVisible = classArr.indexOf('firstVisibleRow');

        if (containFirstVisible > -1) {
          classArr.splice(containFirstVisible, 1);
        }

        cellProperties.className = classArr.join(' ');
      }
    }
  }

  /**
   * Adds the needed classes to the headers.
   *
   * @private
   * @param {Number} row Row index.
   * @param {HTMLElement} th Table header element.
   */
  onAfterGetRowHeader(row, th) {
    let tr = th.parentNode;

    if (tr) {
      if (this.isHidden(row)) {
        addClass(tr, 'hide');
      } else {
        removeClass(tr, 'hide');
      }
    }

    let firstSectionHidden = true;
    let i = row - 1;

    do {
      if (!this.isHidden(i)) {
        firstSectionHidden = false;
        break;
      }
      i--;
    } while (i >= 0);

    if (firstSectionHidden) {
      addClass(th, 'firstVisibleRow');
    }

    if (this.settings.indicators && this.hot.hasRowHeaders()) {
      if (this.isHidden(row - 1)) {
        addClass(th, 'afterHiddenRow');
      }
      if (this.isHidden(row + 1)) {
        addClass(th, 'beforeHiddenRow');
      }
    }
  }

  /**
   * Adds the additional row height for the hidden row indicators.
   *
   * @private
   * @param {Number} height Row height.
   * @param {Number} row Row index.
   * @returns {Number}
   */
  onModifyRowHeight(height, row) {
    if (this.isHidden(row)) {
      return 0.1;
    }

    return height;
  }

  /**
   * On modify copyable range listener.
   *
   * @private
   * @param {Array} ranges Array of selected copyable text.
   * @returns {Array} Returns modyfied range.
   */
  onModifyCopyableRange(ranges) {
    let newRanges = [];

    let pushRange = (startRow, endRow, startCol, endCol) => {
      newRanges.push({startRow, endRow, startCol, endCol});
    };

    arrayEach(ranges, (range) => {
      let isHidden = true;
      let rangeStart = 0;

      rangeEach(range.startRow, range.endRow, (row) => {
        if (this.isHidden(row)) {
          if (!isHidden) {
            pushRange(rangeStart, row - 1, range.startCol, range.endCol);
          }
          isHidden = true;
        } else {
          if (isHidden) {
            rangeStart = row;
          }
          if (row === range.endRow) {
            pushRange(rangeStart, row, range.startCol, range.endCol);
          }
          isHidden = false;
        }
      });
    });

    return newRanges;
  }

  /**
   * On before set range start listener, when selection was triggered by the cell.
   *
   * @private
   * @param {Object} coords Object with `row` and `col` properties.
   */
  onBeforeSetRangeStart(coords) {
    let actualSelection = this.hot.getSelectedLast() || false;
    let lastPossibleIndex = this.hot.countRows() - 1;

    let getNextRow = (row) => {
      let direction = 0;

      if (actualSelection) {
        direction = row > actualSelection[0] ? 1 : -1;

        this.lastSelectedRow = actualSelection[0];
      }

      if (lastPossibleIndex < row || row < 0) {
        return this.lastSelectedRow;
      }

      if (this.isHidden(row)) {
        row = getNextRow(row + direction);
      }

      return row;
    };

    coords.row = getNextRow(coords.row);
  }

  /**
   * On before set range start listener, when selection was triggered by the headers.
   *
   * @private
   * @param {Object} coords Object with `row` and `col` properties.
   */
  onBeforeSetRangeStartOnly(coords) {
    if (coords.row > 0) {
      return;
    }

    coords.row = 0;

    let getNextRow = (row) => {

      if (this.isHidden(row)) {
        row = getNextRow(++row);
      }

      return row;
    };

    coords.row = getNextRow(coords.row);
  }

  /**
   * On before set range end listener.
   *
   * @private
   * @param {Object} coords Object with `row` and `col` properties.
   */
  onBeforeSetRangeEnd(coords) {
    let rowCount = this.hot.countRows();

    let getNextRow = (row) => {
      if (this.isHidden(row)) {
        if (this.lastSelectedRow > row || coords.row === rowCount - 1) {
          if (row > 0) {
            row = getNextRow(--row);

          } else {
            rangeEach(0, this.lastSelectedRow, (i) => {
              if (!this.isHidden(i)) {
                row = i;

                return false;
              }
            });
          }

        } else {
          row = getNextRow(++row);
        }
      }

      return row;
    };

    coords.row = getNextRow(coords.row);
    this.lastSelectedRow = coords.row;
  }

  /**
   * Adds Show-hide columns to context menu.
   *
   * @private
   * @param {Object} options
   */
  onAfterContextMenuDefaultOptions(options) {
    options.items.push(
      {
        name: '---------',
      },
      hideRowItem(this),
      showRowItem(this)
    );
  }

  /**
   * Recalculates index of hidden rows after add row action
   *
   * @private
   * @param {Number} index
   * @param {Number} amount
   */
  onAfterCreateRow(index, amount) {
    let tempHidden = [];

    arrayEach(this.hiddenRows, (col) => {
      if (col >= index) {
        col += amount;
      }
      tempHidden.push(col);
    });
    this.hiddenRows = tempHidden;
  }

  /**
   * Recalculates index of hidden rows after remove row action
   *
   * @private
   * @param {Number} index
   * @param {Number} amount
   */
  onAfterRemoveRow(index, amount) {
    let tempHidden = [];

    arrayEach(this.hiddenRows, (col) => {
      if (col >= index) {
        col -= amount;
      }
      tempHidden.push(col);
    });
    this.hiddenRows = tempHidden;
  }

  /**
   * `afterPluginsInitialized` hook callback.
   *
   * @private
   */
  onAfterPluginsInitialized() {
    let settings = this.hot.getSettings().hiddenRows;

    if (typeof settings === 'object') {
      this.settings = settings;

      if (settings.copyPasteEnabled === void 0) {
        settings.copyPasteEnabled = true;
      }
      if (Array.isArray(settings.rows)) {
        this.hideRows(settings.rows);
      }
      if (!settings.copyPasteEnabled) {
        this.addHook('modifyCopyableRange', (ranges) => this.onModifyCopyableRange(ranges));
      }
    }
  }

  /**
   * Destroys the plugin instance.
   */
  destroy() {
    super.destroy();
  }
}

registerPlugin('hiddenRows', HiddenRows);

export default HiddenRows;
