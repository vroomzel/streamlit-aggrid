import {Streamlit, StreamlitComponentBase, withStreamlitConnection} from "streamlit-component-lib";

import {ReactNode} from "react"

import {AgGridReact} from '@ag-grid-community/react';
import {ColumnApi, GridApi, ModuleRegistry} from '@ag-grid-community/core'
import {AllCommunityModules} from '@ag-grid-community/all-modules'
import {AllModules} from '@ag-grid-enterprise/all-modules'
import {LicenseManager} from "@ag-grid-enterprise/core";

import {compareAsc, parseISO} from 'date-fns'
import {format} from 'date-fns-tz'
import deepMap from "./utils"
import {duration} from "moment";

import '@ag-grid-community/core/dist/styles/ag-theme-blue.css';
import '@ag-grid-community/core/dist/styles/ag-theme-fresh.css';
import '@ag-grid-community/core/dist/styles/ag-theme-material.css';

import './AgGrid.scss'
import './scrollbar.css'

interface State {
  rowData: any
  gridHeight: number
  should_update: boolean
}

type CSSDict = {[key: string]: {[key: string]: string}}

function getCSS(styles: CSSDict): string {
  var css = [];
  for (let selector in styles) {
    let style = selector + " {";
    
    for (let prop in styles[selector]) {
      style += prop + ": " + styles[selector][prop] + ";";
    }
    
    style += "}";
    
    css.push(style);
  }
  
  return css.join("\n");
}

function addCustomCSS(custom_css: CSSDict): void {
  var css = getCSS(custom_css)
  var styleSheet = document.createElement("style")
  styleSheet.type = "text/css"
  styleSheet.innerText = css
  console.log(`Adding cutom css: `, css)
  document.head.appendChild(styleSheet)
}

function hex(c: string) {
  var s = '0123456789abcdef';
  var i = parseInt(c);
  if (i === 0 || isNaN(i)) return '00';
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


class AgGrid extends StreamlitComponentBase<State> {
  private frameDtypes: any
  private api!: GridApi;
  private columnApi!: ColumnApi
  private columnFormaters: any
  private manualUpdateRequested: boolean = false
  private allowUnsafeJsCode: boolean = false
  private fitColumnsOnGridLoad: boolean = false
  private gridOptions: any
  private gradientLowValueColour = '#FF0000'
  private gradientHighValueColour = '#00FF00'
  private allValuesInTable: number[] = []
  private valuesForTableOrdered: number[] = []

  constructor(props: any) {
    super(props)

    if (props.args.custom_css) {
      addCustomCSS(props.args.custom_css);
    }

    if (props.args.enable_enterprise_modules) {
      ModuleRegistry.registerModules(AllModules);
      if ('license_key' in props.args) {
        LicenseManager.setLicenseKey(props.args['license_key']);
      }
    } else {
      ModuleRegistry.registerModules(AllCommunityModules);
    }

    this.frameDtypes = this.props.args.frame_dtypes
    this.manualUpdateRequested = (this.props.args.update_mode === 1)
    this.allowUnsafeJsCode = this.props.args.allow_unsafe_jscode
    this.fitColumnsOnGridLoad = this.props.args.fit_columns_on_grid_load

    this.state = {
      rowData: JSON.parse(props.args.row_data),
      gridHeight: this.props.args.height,
      should_update: false
    }

    this.initialiseValuesRequiredForConditionalFormatting(this.props.args.gridOptions, this.state.rowData)

    this.columnFormaters = {
      columnTypes: {
        'dateColumnFilter': {
          filter: 'agDateColumnFilter',
          filterParams: {
            comparator: (filterValue: any, cellValue: string) => compareAsc(parseISO(cellValue), filterValue)
          }
        },
        'numberColumnFilter': {
          filter: 'agNumberColumnFilter'
        },
        'shortDateTimeFormat': {
          valueFormatter: (params: any) => this.dateFormatter(params.value, "dd/MM/yyyy HH:mm"),
        },
        'customDateTimeFormat': {
          valueFormatter: (params: any) => this.dateFormatter(params.value, params.column.colDef.custom_format_string),
        },
        'customNumericFormat': {
          valueFormatter: (params: any) => this.numberFormatter(params.value, params.column.colDef.precision ?? 2),
        },
        'customVolatilityFormat': {
          valueFormatter: (params: any) => this.volatilityFormatter(params.value, params.column.colDef.precision ?? 1),
        },
        'customCurrencyFormat': {
          valueFormatter: (params: any) => this.currencyFormatter(params.value, params.column.colDef.custom_currency_symbol),
        },
        'timedeltaFormat': {
          valueFormatter: (params: any) => duration(params.value).humanize(true)
        },
        'conditionalFormat': {
          cellStyle: (params: any) => this.conditionalFormattingCellStyle(params.value, this.valuesForTableOrdered)
        },
      }
    }

    let gridOptions = Object.assign({}, this.columnFormaters, this.props.args.gridOptions)

    if (this.allowUnsafeJsCode) {
      console.warn("flag allow_unsafe_jscode is on.")
      gridOptions = this.convertJavascriptCodeOnGridOptions(gridOptions)
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
        should_update: true
      }
    } else {
      return {
        gridHeight: props.args.height
      }
    }
  }

  private convertStringToFunction(v: string) {
    const JS_PLACEHOLDER = "--x_x--0_0--"

    let funcReg = new RegExp(
      `${JS_PLACEHOLDER}\\s*(function\\s*.*)\\s*${JS_PLACEHOLDER}`
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

  private setUpdateMode() {
    if (this.manualUpdateRequested) {
      return //If manual update is set, no listeners will be added
    }

    let updateMode = this.props.args.update_mode

    if ((updateMode & 2) === 2) {
      this.api.addEventListener('cellValueChanged', (e: any) => this.returnGridValue(e))
    }

    if ((updateMode & 4) === 4) {
      this.api.addEventListener('selectionChanged', (e: any) => this.returnGridValue(e))
    }

    if ((updateMode & 8) === 8) {
      this.api.addEventListener('filterChanged', (e: any) => this.returnGridValue(e))
    }

    if ((updateMode & 16) === 16) {
      this.api.addEventListener('sortChanged', (e: any) => this.returnGridValue(e))
    }
  }

  private onGridReady(event: any) {
    this.api = event.api
    this.columnApi = event.columnApi

    this.setUpdateMode()
    this.api.addEventListener('firstDataRendered', (e: any) => this.fitColumns())

    this.api.setRowData(this.state.rowData)

    for (var idx in this.gridOptions['preSelectedRows']) {
      this.api.selectIndex(this.gridOptions['preSelectedRows'][idx], true, true)
    }


  }

  private fitColumns() {
    if (this.fitColumnsOnGridLoad) {
      this.api.sizeColumnsToFit()
    }
    else {
      this.columnApi.autoSizeAllColumns()
    }
  }

  private dateFormatter(isoString: string, formaterString: string): String {
    try {
      let date = parseISO(isoString)
      return format(date, formaterString)
    } catch {
      return isoString
    }
    finally { }
  }

  private currencyFormatter(number: any, currencySymbol: string): String {
    let n = Number.parseFloat(number)
    if (!Number.isNaN(n)) {
      return currencySymbol + n.toFixed(0).replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1,')
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
        break;

      case 1: //FILTERED_DATA
        this.api.forEachNodeAfterFilter((row) => { if (!row.group) { returnData.push(row.data) } })
        break;

      case 2: //FILTERED_SORTED_DATA
        this.api.forEachNodeAfterFilterAndSort((row) => { if (!row.group) { returnData.push(row.data) } })
        break;
    }

    let returnValue = {
      originalDtypes: this.frameDtypes,
      rowData: returnData,
      selectedRows: this.api.getSelectedRows()
    }

    Streamlit.setComponentValue(returnValue)
  }

  private ManualUpdateButton(props: any) {
    if (props.manual_update) {
      return (<button onClick={props.onClick}>Update</button>)
    }
    else {
      return (<span></span>)
    }
  }

  private defineContainerHeight() {
    if ('domLayout' in this.gridOptions) {
      if (this.gridOptions['domLayout'] === 'autoHeight') {
        return ({
          width: this.props.width
        })
      }
    }
    return ({
      width: this.props.width,
      height: this.state.gridHeight
    })
  }

  public render = (): ReactNode => {

    if (this.api !== undefined) {
      if (this.state.should_update) {
        this.api.setRowData(this.state.rowData)
      }
    }

    return (
      <div className={"ag-theme-"+ this.props.args.theme} style={this.defineContainerHeight()} >
        <this.ManualUpdateButton manual_update={this.manualUpdateRequested} onClick={(e: any) => this.returnGridValue(e)} />
        <AgGridReact
          onGridReady={(e) => this.onGridReady(e)}
          gridOptions={this.gridOptions}
        >
        </AgGridReact>
      </div >
    )
  }
}

export default withStreamlitConnection(AgGrid)
