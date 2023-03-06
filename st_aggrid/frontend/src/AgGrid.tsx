import {Streamlit, StreamlitComponentBase, withStreamlitConnection,} from "streamlit-component-lib"

import React, {ReactNode} from "react"

import {AgGridReact} from "@ag-grid-community/react"

import {
  ColumnApi,
  DetailGridInfo,
  GetRowIdParams,
  GridApi,
  IStatusPanelComp,
  IStatusPanelParams,
  ModuleRegistry
} from "@ag-grid-community/core"

import {ClientSideRowModelModule} from "@ag-grid-community/client-side-row-model"
import {LicenseManager} from "@ag-grid-enterprise/core"
import {GridChartsModule} from "@ag-grid-enterprise/charts"
import {SparklinesModule} from "@ag-grid-enterprise/sparklines"
import {ClipboardModule} from "@ag-grid-enterprise/clipboard"
import {CsvExportModule} from "@ag-grid-community/csv-export"
import {ColumnsToolPanelModule} from "@ag-grid-enterprise/column-tool-panel"
import {ExcelExportModule} from "@ag-grid-enterprise/excel-export"
import {FiltersToolPanelModule} from "@ag-grid-enterprise/filter-tool-panel"
import {MasterDetailModule} from "@ag-grid-enterprise/master-detail"
import {MenuModule} from "@ag-grid-enterprise/menu"
import {RangeSelectionModule} from "@ag-grid-enterprise/range-selection"
import {RichSelectModule} from "@ag-grid-enterprise/rich-select"
import {RowGroupingModule} from "@ag-grid-enterprise/row-grouping"
import {SetFilterModule} from "@ag-grid-enterprise/set-filter"
import {MultiFilterModule} from "@ag-grid-enterprise/multi-filter"
import {SideBarModule} from "@ag-grid-enterprise/side-bar"
import {StatusBarModule} from "@ag-grid-enterprise/status-bar"

import {compareAsc, parseISO} from "date-fns"
import {format} from "date-fns-tz"
import deepMap from "./utils"
import {duration} from "moment"

import {debounce} from "lodash"

import "./AgGrid.scss"
import "./scrollbar.css"

interface State {
  rowData: any
  gridHeight: number
  should_update: boolean
  should_deselect_all_rows: boolean
}

type CSSDict = { [key: string]: { [key: string]: string } }

function getCSS(styles: CSSDict): string {
  var css = []
  for (let selector in styles) {
    let style = selector + " {"

    for (let prop in styles[selector]) {
      style += prop + ": " + styles[selector][prop] + ";"
    }

    style += "}"

    css.push(style)
  }

  return css.join("\n")
}

function addCustomCSS(custom_css: CSSDict): void {
  var css = getCSS(custom_css)
  var styleSheet = document.createElement("style")
  styleSheet.type = "text/css"
  styleSheet.innerText = css
  console.log(`Adding cutom css: `, css)
  document.head.appendChild(styleSheet)
}

function hex(c: any) {
  var s = '0123456789abcdef';
  var i = parseInt(c);
  if (isNaN(c) || i === 0) return '00';
  i = Math.round(Math.min(Math.max(0, i), 255));
  return s.charAt((i - (i % 16)) / 16) + s.charAt(i % 16);
}

/* Convert an RGB triplet to a hex string */
function convertToHex(rgb: any) {
  return hex(rgb[0]) + hex(rgb[1]) + hex(rgb[2]);
}

/* Remove '#' in color hex string */
function trim(s: string) {
  return s.charAt(0) === '#' ? s.substring(1, 7) : s;
}

/* Convert a hex string to an RGB triplet */
function convertToRGB(hex: string) {
  var color = [];
  color[0] = parseInt(trim(hex).substring(0, 2), 16);
  color[1] = parseInt(trim(hex).substring(2, 4), 16);
  color[2] = parseInt(trim(hex).substring(4, 6), 16);
  return color;
}

function generateColor(colorStart: string, colorEnd: string, colorCount: number, index: number) {
  // The beginning of your gradient
  var start = convertToRGB(colorStart);

  // The end of your gradient
  var end = convertToRGB(colorEnd);

  // The number of colors to compute
  var len = colorCount;

  //Alpha blending amount
  var alpha = 0.0;

  var saida = [];

  let i;
  for (i = 0; i < len; i++) {
    var c = [];
    alpha += 1.0 / len;

    c[0] = start[0] * alpha + (1 - alpha) * end[0];
    c[1] = start[1] * alpha + (1 - alpha) * end[1];
    c[2] = start[2] * alpha + (1 - alpha) * end[2];

    saida.push(convertToHex(c));
  }

  return saida[index];
}

function onlyUnique(value: any, index: any, self: any) {
  if (value !== 'nan') {
    return self.indexOf(value) === index;
  }
}


export class RefreshTimeStatusBarComponent implements IStatusPanelComp {
  params!: IStatusPanelParams;
  eGui!: HTMLDivElement;
  eUpdateTime!: HTMLSpanElement;

  init(params: IStatusPanelParams) {
    this.params = params;

    this.eGui = document.createElement('div');
    this.eGui.className = 'ag-status-name-value';

    var label = document.createElement('span');
    label.innerText = 'Last Refresh Time: ';
    this.eGui.appendChild(label);

    this.eUpdateTime = document.createElement('span');
    this.eUpdateTime.className = 'ag-status-name-value-value';

    this.eGui.appendChild(this.eUpdateTime);

  }

  getGui() {
    return this.eGui;
  }

  destroy() {
  }

  updateTime() {
    var today = new Date();
    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/toTimeString
    var time=today.toTimeString().slice(0,8)
    this.eUpdateTime.innerText = time + '';
  }
}

class AgGrid extends StreamlitComponentBase<State> {
  private frameDtypes: any
  private api!: GridApi
  private columnApi!: ColumnApi
  private columnFormaters: any
  private manualUpdateRequested: boolean = false
  private clearSelectedRowsButton: boolean = false
  private allowUnsafeJsCode: boolean = false
  private gridOptions: any
  private gradientLowValueColour = '#FF0000'
  private gradientHighValueColour = '#00FF00'
  private allValuesInTable: number[] = []
  private valuesForTableOrdered: number[] = []
  private wsUrl: string
  private rowIdCol: string
  private gridContainerRef: React.RefObject<HTMLDivElement>
  private isGridAutoHeightOn: boolean

  constructor(props: any) {
    super(props)
    ModuleRegistry.register(ClientSideRowModelModule)
    ModuleRegistry.register(CsvExportModule)

    if (props.args.custom_css) {
      addCustomCSS(props.args.custom_css)
    }

    if (props.args.enable_enterprise_modules) {
      ModuleRegistry.registerModules([
        ExcelExportModule,
        GridChartsModule,
        SparklinesModule,
        ColumnsToolPanelModule,
        FiltersToolPanelModule,
        MasterDetailModule,
        MenuModule,
        RangeSelectionModule,
        RichSelectModule,
        RowGroupingModule,
        SetFilterModule,
        MultiFilterModule,
        SideBarModule,
        StatusBarModule,
        ClipboardModule,
      ])
      if ("license_key" in props.args) {
        LicenseManager.setLicenseKey(props.args["license_key"])
      }
    }

    this.frameDtypes = this.props.args.frame_dtypes
    this.manualUpdateRequested = this.props.args.manual_update === 1
    this.clearSelectedRowsButton = this.props.args.clear_selected_rows_button
    this.allowUnsafeJsCode = this.props.args.allow_unsafe_jscode
    this.wsUrl = this.props.args.websocket_connection_string
    this.rowIdCol = this.props.args.row_id_col
    this.gridContainerRef = React.createRef();
    this.isGridAutoHeightOn = this.props.args.gridOptions?.domLayout === "autoHeight"

    this.state = {
      rowData: JSON.parse(props.args.row_data),
      gridHeight: this.props.args.height,
      should_update: false,
      should_deselect_all_rows: props.args.clear_currently_selected_rows,
    }

    this.initialiseValuesRequiredForConditionalFormatting(this.props.args.gridOptions, this.state.rowData)

    this.columnFormaters = {
      columnTypes: {
        dateColumnFilter: {
          filter: "agDateColumnFilter",
          filterParams: {
            comparator: (filterValue: any, cellValue: string) =>
              compareAsc(parseISO(cellValue), filterValue),
          },
        },
        numberColumnFilter: {
          filter: "agNumberColumnFilter",
        },
        shortDateTimeFormat: {
          valueFormatter: (params: any) =>
            this.dateFormatter(params.value, "dd/MM/yyyy HH:mm"),
        },
        'customDateFormat': {
          valueFormatter: (params: any) =>
              this.dateFormatter(params.value, "yyyy-MM-dd"),
        },
        customDateTimeFormat: {
          valueFormatter: (params: any) =>
            this.dateFormatter(
              params.value,
              params.column.colDef.custom_format_string
            ),
        },
        customNumericFormat: {
          valueFormatter: (params: any) =>
            this.numberFormatter(
              params.value,
              params.column.colDef.precision ?? 2
            ),
        },
        'customVolatilityFormat': {
          valueFormatter: (params: any) => this.volatilityFormatter(params.value, params.column.colDef.precision ?? 1),
        },
        'customCurrencyFormat': {
          valueFormatter: (params: any) =>
              this.currencyFormatter(
                  params.value,
                  params.column.colDef.custom_currency_symbol ?? '$',
                  params.column.colDef.precision ?? 0
              ),
        },
        timedeltaFormat: {
          valueFormatter: (params: any) =>
            duration(params.value).humanize(true),
        },
        'conditionalFormat': {
          cellStyle: (params: any) => this.conditionalFormattingCellStyle(params.value, this.valuesForTableOrdered)
        },
      }
    }

    let gridOptions = Object.assign(
        {},
        this.columnFormaters,
        this.props.args.gridOptions
    )

    if (this.allowUnsafeJsCode) {
      console.warn("flag allow_unsafe_jscode is on.")
      gridOptions = this.convertJavascriptCodeOnGridOptions(gridOptions)
    }
    if (this.rowIdCol !== null) {
      gridOptions.getRowId = (params: GetRowIdParams) => {
        // console.log(this.rowIdCol)
        // console.log(params.data)
        // console.log(params.data[this.rowIdCol])
        // console.log(params.data.ExpirationDate)
        return params.data[this.rowIdCol];
      }

    }

    if (this.wsUrl !== null) {

      gridOptions.statusBar = {
        statusPanels: [
          {
            statusPanel: RefreshTimeStatusBarComponent,
            key: 'refreshTimeCompKey',
          },
        ],
      }
    }
    this.gridOptions = gridOptions
  }


  private initialiseValuesRequiredForConditionalFormatting(gridOptions: any, rowData: any) {
    const columnDefs = gridOptions.columnDefs;
    // console.log(columnDefs)
    const columnDefFieldForConditionalFormatting = columnDefs
        // .filter((x:any) => x.cellStyle?.name === 'conditionalFormattingCellStyle')
        // .filter((x:any) =>  x.conditional_formatting_group === 'group1')
        .filter((x: any) => x.type.includes('conditionalFormat'))
        .map((x: any) => {
          if (x.field) {
            return x.field;
          }
        });
    // console.log(columnDefFieldForConditionalFormatting)
    rowData.forEach((x: any) => {
      columnDefFieldForConditionalFormatting.forEach((field: any) => {
        this.allValuesInTable.push(x[field]);
      })
    });
    // console.log(this.allValuesInTable)
    // const uniquValues = [...new Set(this.allValuesInTable)];
    const uniquValues = this.allValuesInTable.filter(onlyUnique)//.filter((x:any)=>x!=='nan');

    this.valuesForTableOrdered = uniquValues.sort(function (a, b) {
      return a - b;
    });
    // console.log(this.valuesForTableOrdered)
  }

  private conditionalFormattingCellStyle(number: any, valuesForTableOrdered: any) {
    // the index, or how far along the value is in the gradient
    const valueIndex = valuesForTableOrdered.indexOf(number);
    // get the colour for the cell, depending on its index
    const bgColour = generateColor(
        this.gradientHighValueColour,
        this.gradientLowValueColour,
        this.valuesForTableOrdered.length,
        valueIndex
    );

    return {backgroundColor: '#' + bgColour};
  }

  static getDerivedStateFromProps(props: any, state: any) {
    if (props.args.reload_data) {
      let new_row_data = JSON.parse(props.args.row_data)

      return {
        rowData: new_row_data,
        gridHeight: props.args.height,
        should_update: true,
        should_deselect_all_rows: props.args.clear_currently_selected_rows,
      }
    } else {
      return {
        gridHeight: props.args.height,
        should_deselect_all_rows: props.args.clear_currently_selected_rows,
      }
    }
  }

  private convertStringToFunction(v: string) {
    const JS_PLACEHOLDER = "--x_x--0_0--"

    let funcReg = new RegExp(
      `${JS_PLACEHOLDER}\\s*((function|class)\\s*.*)\\s*${JS_PLACEHOLDER}`
    )

    let match = funcReg.exec(v)

    if (match) {
      const funcStr = match[1]
      // eslint-disable-next-line
      return new Function("return " + funcStr)()
    } else {
      return v
    }
  }

  private convertJavascriptCodeOnGridOptions = (obj: object) => {
    return deepMap(obj, this.convertStringToFunction)
  }

  private attachUpdateEvents(api: GridApi) {
    let updateEvents = this.props.args.update_on[0]
    const doReturn = (e: any) => this.returnGridValue(e)

    updateEvents.forEach((element: any) => {
      if (Array.isArray(element)) {
        api.addEventListener(element[0], debounce(doReturn, element[1]))
        console.log("Attached arr", element)
      } else {
        api.addEventListener(element, doReturn)
      }
    })
  }

  private loadColumnsState() {
    const columnsState = this.props.args.columns_state

    if (columnsState != null) {
      //console.dir(columnsState)
      this.columnApi.applyColumnState({state: columnsState, applyOrder: true})
    }
  }

  public render = (): ReactNode => {
    if (this.api !== undefined) {
      if (this.state.should_deselect_all_rows) {
        this.api.deselectAll()
      }
      if (this.state.should_update) {
        this.api.setRowData(this.state.rowData)
      }
    }
    this.loadColumnsState()


    return (
        <div
            id="gridContainer"
            className={"ag-theme-" + this.props.args.theme}
            ref={this.gridContainerRef}
            style={this.defineContainerHeight()}
        >
          <this.ManualUpdateButton
              manual_update={this.manualUpdateRequested}
              onClick={(e: any) => this.returnGridValue(e)}
          />
          <AgGridReact
              onGridReady={(e) => this.onGridReady(e)}
              gridOptions={this.gridOptions}
          ></AgGridReact>
          <this.ClearRowSelectionButton
              clear_row_selection={this.clearSelectedRowsButton}
              onClick={(e: any) => this.api.deselectAll()}
          />
        </div>
    )
  }

  private wsUpdate(api: any) {
    let ws = new WebSocket(this.wsUrl);
    ws.onmessage = function (event) {
      let data = JSON.parse(event.data.replace(/\bNaN\b/g, "null"))
      // console.log(data)
      api.applyTransactionAsync({update: data})
      const updateTimeComponent = api!.getStatusPanel('refreshTimeCompKey') as any;
      updateTimeComponent.updateTime();
    }
  }

  private fitColumns() {
    const columns_auto_size_mode = this.props.args.columns_auto_size_mode

    switch (columns_auto_size_mode) {
      case 1:
      case "FIT_ALL_COLUMNS_TO_VIEW":
        this.api.sizeColumnsToFit()
        break

      case 2:
      case "FIT_CONTENTS":
        this.columnApi.autoSizeAllColumns()
        break

      default:
        break
    }
  }

  private dateFormatter(isoString: string, formaterString: string): String {
    try {
      let date = parseISO(isoString)
      return format(date, formaterString)
    } catch {
      return isoString
    } finally {
    }
  }

  private currencyFormatter(number: any, currencySymbol: string, precision: number = 0): String {
    let n = Number.parseFloat(number)
    if (!Number.isNaN(n)) {
      return currencySymbol + n.toFixed(precision).replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1,')
    } else {
      return number
    }
  }

  private numberFormatter(number: any, precision: number): String {
    let n = Number.parseFloat(number)
    if (!Number.isNaN(n)) {
      return n.toFixed(precision)
    } else {
      return number
    }
  }

  private volatilityFormatter(number: any, precision: number): String {
    let n = Number.parseFloat(number)
    if (!Number.isNaN(n)) {
      return (n * 100).toFixed(precision) + '%'
    } else {
      return number
    }
  }

  private returnGridValue(e: any) {
    let returnData: any[] = []
    let returnMode = this.props.args.data_return_mode

    switch (returnMode) {
      case 0: //ALL_DATA
        this.api.forEachLeafNode((row) => returnData.push(row.data))
        break

      case 1: //FILTERED_DATA
        this.api.forEachNodeAfterFilter((row) => {
          if (!row.group) {
            returnData.push(row.data)
          }
        })
        break

      case 2: //FILTERED_SORTED_DATA
        this.api.forEachNodeAfterFilterAndSort((row) => {
          if (!row.group) {
            returnData.push(row.data)
          }
        })
        break
    }

      let selected : any  = {}
      this.api.forEachDetailGridInfo((d:DetailGridInfo) => {
        selected[d.id] = []
        d.api?.forEachNode((n: any) => {
          if (n.isSelected()) {
            selected[d.id].push(n)
          }
        })
      })

    //console.log(selected)
    let returnValue = {
      originalDtypes: this.frameDtypes,
      rowData: returnData,
      selectedRows: this.api.getSelectedRows(),
      selectedItems: this.api
        .getSelectedNodes()
        .map((n) => ({ rowIndex: n.rowIndex, ...n.data })),
      colState: this.columnApi.getColumnState(),
    }

    Streamlit.setComponentValue(returnValue)
  }

  private ManualUpdateButton(props: any) {
    if (props.manual_update) {
      return <button onClick={props.onClick}>Update</button>
    } else {
      return <span></span>
    }
  }

  private onGridReady(event: any) {
    this.api = event.api
    this.columnApi = event.columnApi

    this.api.forEachDetailGridInfo((i: any) => {
      console.log(i)
    })

    this.attachUpdateEvents(this.api)

    this.api.forEachDetailGridInfo((i: DetailGridInfo) => {
      //console.log(i)
      if (i.api !== undefined) {
        this.attachUpdateEvents(i.api)
      }
    })

    this.api.addEventListener("firstDataRendered", (e: any) =>
        this.fitColumns()
    )

    this.api.setRowData(this.state.rowData)

    for (var idx in this.gridOptions["preSelectedRows"]) {
      this.api.selectIndex(this.gridOptions["preSelectedRows"][idx], true, true)
    }
    if (this.isGridAutoHeightOn) {
      const renderedGridHeight = this.gridContainerRef.current?.clientHeight
      Streamlit.setFrameHeight(renderedGridHeight)
    }
    if (this.wsUrl !== null) {
      // console.log(this.state.rowData)
      this.wsUpdate(this.api)
    }

  }

  private defineContainerHeight() {
    if (this.isGridAutoHeightOn) {
      return {
        width: this.props.width,
      }
    } else {
      return {
        width: this.props.width,
        height: this.state.gridHeight,
      }
    }
  }

  private ClearRowSelectionButton(props: any) {
    if (props.clear_row_selection) {
      return <button onClick={props.onClick}>Clear Row Selection</button>
    } else {
      return <span></span>
    }
  }
}

export default withStreamlitConnection(AgGrid)
