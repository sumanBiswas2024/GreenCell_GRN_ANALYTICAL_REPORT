sap.ui.define([
	"sap/ui/core/mvc/Controller",
	"sap/ui/model/json/JSONModel",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/m/MessageToast",
	"sap/m/Text"
], function(Controller, JSONModel, Filter, FilterOperator, MessageToast, Text) {
	"use strict";

	return Controller.extend("Z_GRN_Report_GC.controller.View1", {
		onInit: function() {
			this.getView().setModel(this._createRowsModel(), "plantData");
			this.getView().setModel(this._createRowsModel(), "plantChoices");
			this.getView().setModel(this._createRowsModel(), "poData");
			this.getView().setModel(this._createRowsModel(), "grnData");
			this.getView().setModel(new JSONModel({
				rows: []
			}), "statusChart");
			this.getView().setModel(new JSONModel({
				rows: []
			}), "topPlantChart");
			this.getView().setModel(new JSONModel({
				totalDocuments: "0",
				completed: "0",
				pending: "0",
				rejected: "0",
				cancelled: "0"
			}), "grnSummary");
			this.getView().setModel(new JSONModel({
				plantCount: "0",
				poCount: "0",
				documentCount: "0",
				completed: "0",
				pending: "0",
				rejected: "0",
				cancelled: "0",
				plantRows: "0"
			}), "summary");
			this.getView().setModel(new JSONModel({
				poCount: "0",
				documentCount: "0",
				completed: "0",
				pending: "0",
				rejected: "0",
				cancelled: "0"
			}), "poSummary");
			this._activePlant = "";
			this._activePlantName = "";
			this._activePo = "";
			this._appliedPoFilter = "";
			this._poSelectionSource = "none";
			this._grnSourceRows = [];
			this._grnRangeRows = [];
			this._grnRangeLoaded = false;
			this._poSourceRows = [];
			this._grnDateFrom = null;
			this._grnDateTo = null;
			this._requestIds = {};
			this._requestActive = {};
			this._requestSignatures = {};
			this._pendingPoSelection = null;
			this._syncingPoSelection = false;
			this._poCache = Object.create(null);
			this._grnCache = Object.create(null);
			this._mainBusyRequests = {};
			this._mainBusyCount = 0;
			this._cachedDisplayIds = {};
			this._cachedBusyDelays = {};
			this.byId("reportPage").setBusyIndicatorDelay(0);
			this._notices = {};
			this._allPlantRows = [];
			this._allPlantsLoaded = false;
			this._allPlantsLoading = false;
			this._allPlantsRequestId = 0;
			this.onGo();
		},

		onGo: function() {
			var sPlant = this.byId("plantInput").getValue().trim();
			var sPo = this.byId("poInput").getValue().trim();
			var oDateRange = this._readDateRange();
			this._activePlant = sPlant;
			this._activePlantName = "";
			this._activePo = "";
			this._grnRangeRows = [];
			this._grnRangeLoaded = false;
			this._notices = {};
			this._renderNotices();
			if (oDateRange.error) {
				this._setNotice("validation", oDateRange.error, "Warning");
				return;
			}
			this._appliedPoFilter = sPo;
			this._poSelectionSource = sPo ? "input" : "none";
			this._grnDateFrom = oDateRange.from;
			this._grnDateTo = oDateRange.to;
			this._setDetailPanelState(sPlant, sPo || sPlant);
			this._resetPoSummary();
			this._resetSummary();

			this.byId("selectedPlant").setText(sPlant ? "Plant: " + sPlant : "All plants");
			this.byId("selectedGrnPlant").setText(sPlant ? this._plantToolbarText(sPlant, this._activePlantName) : "Select a plant");
			this.byId("selectedPo").setText(sPo ? "PO: " + sPo : sPlant ? "All POs" : "Select a PO");
			this.byId("grnStatusFilter").setSelectedKey("ALL");
			if (sPlant) {
				if (this._allPlantsLoaded) {
					this._cancelTableRead("plantData", "plantTable");
					var aPlantRows = this._allPlantRows.filter(function(oRow) {
						return String(oRow.werks || "") === sPlant;
					});
					this._setTableNoData(this.byId("plantTable"), "No plants found for the selected filter.");
					this._setRows("plantData", aPlantRows);
					this._onPlantData(aPlantRows);
				} else {
					this._read("plantData", "plantTable", "/es_plant_wiseset", [this._eq("werks", sPlant)],
						"No plants found for the selected filter.", this._onPlantData.bind(this));
				}
				this.byId("poInput").setPlaceholder("Enter or select a PO");
				this._loadPos(sPlant);
				this._syncPoSelection(sPlant, sPo);
				if (sPo) {
					this._activePo = sPo;
				}
				this.byId("grnFooter").setText(sPo ? "Loading GRN documents for PO " + sPo + " at plant " + sPlant + "." :
					"Loading GRN documents for plant " + sPlant + ".");
				this._loadGrns(sPlant, sPo);
			} else {
				this._requestIds.plantData = (this._requestIds.plantData || 0) + 1;
				delete this._requestActive.plantData;
				this.byId("poInput").setPlaceholder("Select a plant first");
				this._loadAllPlants(false);
				this._clearTable("poData", "poTable", "Choose a plant to load its purchase orders.");
				this._clearTable("grnData", "grnTable", "Choose a plant to load GRN documents.");
				this.byId("grnFooter").setText("Select a plant to view GRN documents.");
				if (sPo) {
					this._setNotice("validation", "Select a plant before loading GRN details for a PO.", "Warning");
				} else if (this._grnDateFrom || this._grnDateTo) {
					this._setNotice("date-filter", "Choose a plant to apply the GRN date range to document details.", "Information");
				}
			}
		},

		onReset: function() {
			this._clearTableSelections();
			this.byId("plantInput").setValue("");
			this.byId("poInput").setValue("");
			this.byId("grnDateFrom").setValue("");
			this.byId("grnDateTo").setValue("");
			this.onGo();
		},

		onRefresh: function() {
			this._clearTableSelections();
			this.byId("plantInput").setValue("");
			this.byId("poInput").setValue("");
			this.byId("grnDateFrom").setValue("");
			this.byId("grnDateTo").setValue("");
			this._activePlant = "";
			this._activePlantName = "";
			this._activePo = "";
			this._appliedPoFilter = "";
			this._poSelectionSource = "none";
			this._grnDateFrom = null;
			this._grnDateTo = null;
			this._notices = {};
			this._renderNotices();
			this._resetSummary();
			this._resetPoSummary();
			this.byId("selectedPlant").setText("All plants");
			this.byId("selectedGrnPlant").setText("Select a plant");
			this.byId("selectedPo").setText("Select a PO");
			this.byId("grnStatusFilter").setSelectedKey("ALL");
			this.byId("poInput").setPlaceholder("Select a plant first");
			this._setDetailPanelState("", "");
			this._clearTable("plantData", "plantTable", "Loading all plants…");
			this._clearTable("poData", "poTable", "Choose a plant to load its purchase orders.");
			this._clearTable("grnData", "grnTable", "Choose a plant to load GRN documents.");
			this.byId("grnFooter").setText("Select a plant to view GRN documents.");
			this._allPlantsLoaded = false;
			this._allPlantRows = [];
			this._poCache = Object.create(null);
			this._grnCache = Object.create(null);
			this._loadAllPlants(true);
		},

		onPlantSuggestionSelected: function(oEvent) {
			var oItem = oEvent.getParameter("selectedItem");
			if (oItem) {
				this.byId("plantInput").setValue(oItem.getKey());
				this.byId("poInput").setValue("");
			}
		},

		onPoSuggestionSelected: function(oEvent) {
			var oItem = oEvent.getParameter("selectedItem");
			if (oItem) {
				this._poSelectionSource = "input";
				this.byId("poInput").setValue(oItem.getKey());
				this._syncPoSelection(this._activePlant, oItem.getKey());
			}
		},

		onPoInputLiveChange: function(oEvent) {
			var sPo = String(oEvent.getParameter("value") || "").trim();
			var bClearedAppliedPo = !sPo && !!this._appliedPoFilter;
			this._poSelectionSource = sPo ? "input" : "none";
			this._syncPoSelection(this._activePlant, sPo);
			if (bClearedAppliedPo) {
				this.onGo();
			}
		},

		onDateFilterChange: function(oEvent) {
			var oDatePicker = oEvent.getSource();
			var sClearId = oDatePicker === this.byId("grnDateFrom") ? "grnDateFromClear" : "grnDateToClear";
			this.byId(sClearId).setVisible(!!oDatePicker.getValue().trim());
		},

		onClearDateFrom: function() {
			this._clearDatePicker("grnDateFrom", "grnDateFromClear");
		},

		onClearDateTo: function() {
			this._clearDatePicker("grnDateTo", "grnDateToClear");
		},

		_clearDatePicker: function(sPickerId, sButtonId) {
			var oDatePicker = this.byId(sPickerId);
			oDatePicker.setDateValue(null);
			oDatePicker.setValue("");
			this.byId(sButtonId).setVisible(false);
		},

		onPlantSelect: function(oEvent) {
			var oTable = this.byId("plantTable");
			var iRow = oEvent.getParameter("rowIndex");
			if (iRow < 0 || !oTable.isIndexSelected(iRow)) {
				return;
			}
			var oContext = oEvent.getParameter("rowContext") || oTable.getContextByIndex(iRow);
			var oRow = oContext && oContext.getObject();
			if (!oRow) {
				return;
			}
			this._notices = {};
			this._renderNotices();
			this._activePlant = oRow.werks;
			this._activePlantName = oRow.plant_name || "";
			this._updateCharts([oRow]);
			this._setPoSummary(oRow);
			this._activePo = "";
			this._appliedPoFilter = "";
			this._poSelectionSource = "none";
			this._grnRangeRows = [];
			this._grnRangeLoaded = false;
			this._setDetailPanelState(oRow.werks, oRow.werks);
			var oDateRange = this._readDateRange();
			this.byId("plantInput").setValue(oRow.werks);
			this.byId("poInput").setValue("");
			this.byId("poInput").setPlaceholder("Enter or select a PO");
			this.byId("selectedPlant").setText("Plant: " + oRow.werks);
			this.byId("selectedGrnPlant").setText(this._plantToolbarText(oRow.werks, oRow.plant_name));
			this.byId("selectedPo").setText("All POs");
			this._loadPos(oRow.werks);
			this._syncPoSelection(oRow.werks, "");
			if (oDateRange.error) {
				this._clearTable("grnData", "grnTable", oDateRange.error);
				this._setNotice("validation", oDateRange.error, "Warning");
			} else {
				this._grnDateFrom = oDateRange.from;
				this._grnDateTo = oDateRange.to;
				this.byId("grnFooter").setText("Loading GRN documents for plant " + oRow.werks + ".");
				this._loadGrns(oRow.werks, "");
			}
			this._scrollTo("poPanel");
		},

		onPoSelect: function(oEvent) {
			if (this._syncingPoSelection) {
				return;
			}
			var oTable = this.byId("poTable");
			var iRow = oEvent.getParameter("rowIndex");
			if (iRow < 0 || !oTable.isIndexSelected(iRow)) {
				return;
			}
			var oContext = oEvent.getParameter("rowContext") || oTable.getContextByIndex(iRow);
			var oRow = oContext && oContext.getObject();
			if (!oRow) {
				return;
			}
			var oDateRange = this._readDateRange();
			this._notices = {};
			this._renderNotices();
			if (oDateRange.error) {
				this._setNotice("validation", oDateRange.error, "Warning");
				return;
			}
			this._grnDateFrom = oDateRange.from;
			this._grnDateTo = oDateRange.to;
			this._activePo = oRow.ebeln;
			this._appliedPoFilter = "";
			this._poSelectionSource = "table";
			this.byId("poPanel").setExpanded(true);
			this.byId("grnPanel").setExpanded(true);
			this.byId("poInput").setValue("");
			this.byId("selectedPo").setText("PO: " + oRow.ebeln);
			this._pendingPoSelection = null;
			this._loadGrns(this._activePlant, oRow.ebeln);
			this._scrollTo("grnPanel");
		},

		_loadPos: function(sPlant) {
			if (Object.prototype.hasOwnProperty.call(this._poCache, sPlant)) {
				this._cancelTableRead("poData", "poTable");
				var aCachedPoRows = this._poCache[sPlant];
				this._showCachedData("poTable", function() {
					if (this._activePlant !== sPlant) {
						return;
					}
					this._setTableNoData(this.byId("poTable"), "No purchase orders found for plant " + sPlant + ".");
					this._poSourceRows = aCachedPoRows;
					this._setRows("poData", this._poSourceRows);
					this._applyPoDateFilter();
					this._setNotice("poData-error", "", "Error");
				}.bind(this));
				return;
			}
			this._read("poData", "poTable", "/es_powiseset", [this._eq("werks", sPlant)],
				"No purchase orders found for plant " + sPlant + ".",
				function(aRows) {
					this._cacheRows(this._poCache, sPlant, aRows, 10);
					if (this._activePlant === sPlant) {
						this._poSourceRows = aRows;
						this._applyPoDateFilter();
					}
				}.bind(this));
		},

		_applyPoDateFilter: function() {
			var aPoRows = this._poSourceRows || [];
			if (!this._grnDateFrom && !this._grnDateTo) {
				var aAllPoRows = this._filterPoRowsByInput(aPoRows);
				this._setTableNoData(this.byId("poTable"), this._appliedPoFilter ?
					"No purchase order found for " + this._appliedPoFilter + "." : "No purchase orders found for the selected plant.");
				this._setRows("poData", aAllPoRows);
				if (this._appliedPoFilter) {
					this._setPoSummaryFromRows(aAllPoRows);
				}
				return;
			}
			if (!this._grnRangeLoaded) {
				var aPendingPoRows = this._filterPoRowsByInput(aPoRows);
				this._setTableNoData(this.byId("poTable"), this._appliedPoFilter ?
					"No matching PO is available for the selected date range." :
					"Loading purchase orders with GRN documents in the selected date range.");
				this._setRows("poData", aPendingPoRows);
				this._setPoSummaryFromRows(aPendingPoRows);
				this._syncPoSelection(this._activePlant, this._getPoSelectionValue());
				return;
			}
			var mPoDocuments = Object.create(null);
			(this._grnRangeRows || []).forEach(function(oGrn) {
				var sPo = String(oGrn.ebeln || "");
				if (!sPo) {
					return;
				}
				if (!mPoDocuments[sPo]) {
					mPoDocuments[sPo] = Object.create(null);
				}
				var sDocument = String(oGrn.mblnr || "");
				if (!sDocument || mPoDocuments[sPo][sDocument]) {
					return;
				}
				var sStatus = String(oGrn.status || "").trim().toLowerCase();
				mPoDocuments[sPo][sDocument] = {
					movement: String(oGrn.bwart || ""),
					status: sStatus
				};
			});
			var aDateFilteredPoRows = aPoRows.reduce(function(aResult, oPo) {
				var mDocuments = mPoDocuments[String(oPo.ebeln || "")];
				if (!mDocuments) {
					return aResult;
				}
				var aDocuments = Object.keys(mDocuments).map(function(sDocument) {
					return mDocuments[sDocument];
				});
				var oCounts = {
					mblnr: aDocuments.length,
					mblnr_103: 0,
					mblnr_105: 0,
					completed: 0,
					pending: 0,
					rejected: 0,
					cancelled: 0
				};
				aDocuments.forEach(function(oDocument) {
					if (oDocument.movement === "103") {
						oCounts.mblnr_103++;
					}
					if (oDocument.movement === "105") {
						oCounts.mblnr_105++;
					}
					if (oCounts[oDocument.status] !== undefined) {
						oCounts[oDocument.status]++;
					}
				});
				aResult.push(Object.assign({}, oPo, oCounts));
				return aResult;
			}, []);
			var aFilteredPoRows = this._filterPoRowsByInput(aDateFilteredPoRows);
			this._setTableNoData(this.byId("poTable"), this._appliedPoFilter ?
				"No GRN documents for PO " + this._appliedPoFilter + " match the selected date range." :
				"No purchase orders have GRN documents in the selected date range.");
			this._setRows("poData", aFilteredPoRows);
			this._setPoSummaryFromRows(aFilteredPoRows);
			this._syncPoSelection(this._activePlant, this._getPoSelectionValue());
		},

		_filterPoRowsByInput: function(aRows) {
			if (!this._appliedPoFilter) {
				return aRows || [];
			}
			return (aRows || []).filter(function(oRow) {
				return String(oRow.ebeln || "") === this._appliedPoFilter;
			}.bind(this));
		},

		_setPoSummaryFromRows: function(aRows) {
			var oTotals = {
				poCount: (aRows || []).length,
				documentCount: 0,
				completed: 0,
				pending: 0,
				rejected: 0,
				cancelled: 0
			};
			(aRows || []).forEach(function(oRow) {
				oTotals.documentCount += this._num(oRow.mblnr);
				oTotals.completed += this._num(oRow.completed);
				oTotals.pending += this._num(oRow.pending);
				oTotals.rejected += this._num(oRow.rejected);
				oTotals.cancelled += this._num(oRow.cancelled);
			}.bind(this));
			var oSummary = this.getView().getModel("poSummary");
			Object.keys(oTotals).forEach(function(sKey) {
				oSummary.setProperty("/" + sKey, this._formatCount(oTotals[sKey]));
			}.bind(this));
		},

		_syncPoSelection: function(sPlant, sPo) {
			var oTable = this.byId("poTable");
			this._syncingPoSelection = true;
			if (!sPo) {
				this._pendingPoSelection = null;
				oTable.clearSelection();
				this._syncingPoSelection = false;
				return;
			}
			var aRows = this.getView().getModel("poData").getProperty("/rows") || [];
			var iIndex = aRows.findIndex(function(oRow) {
				return String(oRow.ebeln || "") === sPo;
			});
			if (iIndex >= 0) {
				this._pendingPoSelection = null;
				oTable.setSelectedIndex(iIndex);
			} else {
				oTable.clearSelection();
				this._pendingPoSelection = this._requestActive.poData ? {
					plant: sPlant,
					po: sPo
				} : null;
			}
			this._syncingPoSelection = false;
		},

		_getPoSelectionValue: function() {
			return this._poSelectionSource === "table" ? this._activePo : this.byId("poInput").getValue().trim();
		},

		_applyPendingPoSelection: function() {
			var oPending = this._pendingPoSelection;
			if (oPending && oPending.plant === this._activePlant && oPending.po === this.byId("poInput").getValue().trim()) {
				this._syncPoSelection(oPending.plant, oPending.po);
			} else {
				this._pendingPoSelection = null;
			}
		},

		_loadGrns: function(sPlant, sPo) {
			if (!sPlant) {
				this._setNotice("validation", "Choose a plant to load GRN details.", "Warning");
				return;
			}
			sPo = sPo || "";
			this._grnRangeRows = [];
			this._grnRangeLoaded = false;
			this._applyPoDateFilter();
			this._grnSourceRows = [];
			this._setGrnStatusCounts([]);
			this.byId("grnStatusFilter").setSelectedKey("ALL");
			var sFrom = this._formatODataDate(this._grnDateFrom);
			var sTo = this._formatODataDate(this._grnDateTo);
			var bHasDateRange = !!(sFrom || sTo);
			var sQueryPo = bHasDateRange ? "" : sPo;
			var sCacheKey = [sPlant, sQueryPo || "*", sFrom, sTo].join("\u001f");
			if (Object.prototype.hasOwnProperty.call(this._grnCache, sCacheKey)) {
				this._cancelTableRead("grnData", "grnTable");
				var aCachedGrnRows = this._grnCache[sCacheKey];
				this._showCachedData("grnTable", function() {
					if (this._activePlant === sPlant) {
						this._showGrnRows(aCachedGrnRows, sPlant, sPo, bHasDateRange);
					}
				}.bind(this));
				return;
			}
			var aFilters = [this._eq("werks", sPlant)];
			if (sQueryPo) {
				aFilters.push(this._eq("ebeln", sQueryPo));
			}
			if (sFrom) {
				aFilters.push(new Filter("budat", FilterOperator.GE, sFrom));
			}
			if (sTo) {
				aFilters.push(new Filter("budat", FilterOperator.LE, sTo));
			}
			var sEmptyText = sPo ? "No GRN documents found for PO " + sPo + " at plant " + sPlant + "." :
				"No GRN documents found for plant " + sPlant + " in the selected date range.";
			this._read("grnData", "grnTable", "/es_grnset", aFilters, sEmptyText,
				function(aRows) {
					var aDateFilteredRows = this._filterGrnRowsByDate(aRows, this._grnDateFrom, this._grnDateTo);
					this._cacheRows(this._grnCache, sCacheKey, aDateFilteredRows, 5);
					this._showGrnRows(aDateFilteredRows, sPlant, bHasDateRange ? this._activePo : sPo, bHasDateRange);
				}.bind(this));
		},

		_filterGrnRowsByDate: function(aRows, oFrom, oTo) {
			if (!oFrom && !oTo) {
				return aRows;
			}
			var iFrom = oFrom ? this._dateKey(oFrom) : null;
			var iTo = oTo ? this._dateKey(oTo) : null;
			return (aRows || []).filter(function(oRow) {
				var iGrnDate = this._grnDateValueKey(oRow.budat);
				return iGrnDate !== null && (iFrom === null || iGrnDate >= iFrom) && (iTo === null || iGrnDate <= iTo);
			}.bind(this));
		},

		_grnDateValueKey: function(vDate) {
			if (vDate instanceof Date && !isNaN(vDate.getTime())) {
				return this._dateKey(vDate);
			}
			var sDate = String(vDate == null ? "" : vDate).trim();
			var aMatch = /^(\d{4})(\d{2})(\d{2})$/.exec(sDate) || /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:$|T)/.exec(sDate);
			if (aMatch) {
				return Number(aMatch[1]) * 10000 + Number(aMatch[2]) * 100 + Number(aMatch[3]);
			}
			aMatch = /^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/.exec(sDate);
			if (aMatch) {
				return Number(aMatch[3]) * 10000 + Number(aMatch[2]) * 100 + Number(aMatch[1]);
			}
			aMatch = /^\/Date\((\d+)\)\/$/.exec(sDate);
			if (aMatch) {
				var oParsedDate = new Date(Number(aMatch[1]));
				return isNaN(oParsedDate.getTime()) ? null : this._dateKey(oParsedDate);
			}
			return null;
		},

		_showGrnRows: function(aRows, sPlant, sPo, bHasDateRange) {
			this._grnRangeRows = bHasDateRange ? aRows : [];
			this._grnRangeLoaded = !!bHasDateRange;
			this._applyPoDateFilter();
			this._grnSourceRows = sPo ? aRows.filter(function(oRow) {
				return String(oRow.ebeln || "") === String(sPo);
			}) : aRows;
			this._setGrnStatusCounts(this._grnSourceRows);
			this.byId("selectedGrnPlant").setText(this._plantToolbarText(sPlant, this._activePlantName));
			this.byId("selectedPo").setText(sPo ? "PO: " + sPo : "All POs");
			this._applyGrnStatusFilter();
			this._setNotice("date-format", "", "Warning");
		},

		onGrnStatusChange: function() {
			this._applyGrnStatusFilter();
		},

		_applyGrnStatusFilter: function() {
			var aRows = this._grnSourceRows || [];
			var sStatus = this.byId("grnStatusFilter").getSelectedKey();
			var aVisibleRows = sStatus === "ALL" ? aRows : aRows.filter(function(oRow) {
				return String(oRow.status || "").trim().toUpperCase() === sStatus;
			});
			this._setRows("grnData", aVisibleRows);
			var sFilterScope = this._activePo ? "selected plant, PO, and date range" : "selected plant and date range";
			this._setTableNoData(this.byId("grnTable"), sStatus === "ALL" ?
				"No GRN documents match the " + sFilterScope + "." : "No " + sStatus.toLowerCase() + " GRN documents match the " + sFilterScope +
				".");
			var sStatusLabel = sStatus === "ALL" ? "all statuses" : sStatus.toLowerCase();
			this.byId("grnFooter").setText("Showing " + aVisibleRows.length + " of " + aRows.length + " material documents (" + sStatusLabel +
				").");
			this._setNotice("grn-empty", aVisibleRows.length ? "" : "No GRN documents match the " + sFilterScope + " and status.",
				"Information");
		},

		_setGrnStatusCounts: function(aRows) {
			var aDocuments = aRows || [];
			var mCounts = {
				totalDocuments: aDocuments.length,
				completed: 0,
				pending: 0,
				rejected: 0,
				cancelled: 0
			};
			aDocuments.forEach(function(oRow) {
				var sStatus = String(oRow.status || "").trim().toLowerCase();
				if (sStatus === "completed") {
					mCounts.completed++;
				} else if (sStatus === "pending") {
					mCounts.pending++;
				} else if (sStatus === "rejected") {
					mCounts.rejected++;
				} else if (sStatus === "cancelled" || sStatus === "canceled") {
					mCounts.cancelled++;
				}
			});
			var oSummary = this.getView().getModel("grnSummary");
			Object.keys(mCounts).forEach(function(sStatus) {
				oSummary.setProperty("/" + sStatus, this._formatCount(mCounts[sStatus]));
			}.bind(this));
		},

		formatGrnStatusState: function(sStatus) {
			var sNormalizedStatus = String(sStatus || "").trim().toLowerCase();
			if (sNormalizedStatus === "completed") {
				return "Success";
			}
			if (sNormalizedStatus === "pending") {
				return "Warning";
			}
			if (sNormalizedStatus === "rejected") {
				return "Error";
			}
			return "None";
		},

		_formatODataDate: function(oDate) {
			if (!oDate) {
				return "";
			}
			var sMonth = String(oDate.getMonth() + 1).padStart(2, "0");
			var sDay = String(oDate.getDate()).padStart(2, "0");
			return String(oDate.getFullYear()) + sMonth + sDay;
		},

		formatDate: function(vDate) {
			if (vDate == null || vDate === "") {
				return "";
			}
			if (vDate instanceof Date && !isNaN(vDate.getTime())) {
				return this._padDatePart(vDate.getDate()) + "/" + this._padDatePart(vDate.getMonth() + 1) + "/" + vDate.getFullYear();
			}
			var sDate = String(vDate).trim();
			var aMatch = /^(\d{4})(\d{2})(\d{2})$/.exec(sDate);
			if (aMatch) {
				return aMatch[3] + "/" + aMatch[2] + "/" + aMatch[1];
			}
			aMatch = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:$|T)/.exec(sDate);
			if (aMatch) {
				return this._padDatePart(aMatch[3]) + "/" + this._padDatePart(aMatch[2]) + "/" + aMatch[1];
			}
			aMatch = /^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/.exec(sDate);
			if (aMatch) {
				return this._padDatePart(aMatch[1]) + "/" + this._padDatePart(aMatch[2]) + "/" + aMatch[3];
			}
			aMatch = /^\/Date\((\d+)\)\/$/.exec(sDate);
			if (aMatch) {
				var oParsedDate = new Date(parseInt(aMatch[1], 10));
				if (!isNaN(oParsedDate.getTime())) {
					return this._padDatePart(oParsedDate.getDate()) + "/" + this._padDatePart(oParsedDate.getMonth() + 1) + "/" + oParsedDate.getFullYear();
				}
			}
			return sDate;
		},

		_padDatePart: function(vPart) {
			return String(vPart).padStart(2, "0");
		},

		_plantToolbarText: function(sPlant, sPlantName) {
			return "Plant: " + sPlant;
		},

		_readDateRange: function() {
			var oFromPicker = this.byId("grnDateFrom");
			var oToPicker = this.byId("grnDateTo");
			var dFrom = oFromPicker.getDateValue();
			var dTo = oToPicker.getDateValue();
			if (oFromPicker.getValue().trim() && !dFrom) {
				return {
					error: "Enter a valid GRN Date From value."
				};
			}
			if (oToPicker.getValue().trim() && !dTo) {
				return {
					error: "Enter a valid GRN Date To value."
				};
			}
			if (dFrom && dTo && this._dateKey(dFrom) > this._dateKey(dTo)) {
				return {
					error: "GRN Date From must be on or before GRN Date To."
				};
			}
			return {
				from: dFrom,
				to: dTo
			};
		},

		_dateKey: function(oDate) {
			return oDate.getFullYear() * 10000 + (oDate.getMonth() + 1) * 100 + oDate.getDate();
		},

		_loadAllPlants: function(bForce) {
			if (this._allPlantsLoaded && !bForce) {
				this._requestIds.plantData = (this._requestIds.plantData || 0) + 1;
				delete this._requestActive.plantData;
				this.byId("plantTable").setBusy(false);
				this._setTableNoData(this.byId("plantTable"), "No plant records found.");
				this._setRows("plantData", this._allPlantRows);
				this._onPlantData(this._allPlantRows);
				return;
			}
			if (this._allPlantsLoading && !bForce) {
				return;
			}
			var oModel = this.getOwnerComponent().getModel();
			if (!oModel) {
				this.byId("plantTable").setBusy(false);
				this._setNotice("plant-all-error", "The report service model is unavailable.", "Error");
				return;
			}
			var iRequestId = ++this._allPlantsRequestId;
			this._allPlantsLoading = true;
			this._beginMainBusy("plantAll");
			this.byId("plantTable").setBusy(true);
			this._setTableNoData(this.byId("plantTable"), "No plant records found.");
			if (!this._allPlantsLoaded) {
				this._setRows("plantData", []);
			}
			try {
				oModel.read("/es_plant_wiseset", {
					urlParameters: {
						"$select": "werks,plant_name,ebeln,belnr,completed,pending,rejected,cancelled"
					},
					success: function(oData) {
						if (iRequestId !== this._allPlantsRequestId) {
							return;
						}
						this._endMainBusy("plantAll");
						this._allPlantsLoading = false;
						this._allPlantsLoaded = true;
						this._allPlantRows = oData && Array.isArray(oData.results) ? oData.results : [];
						this.getView().getModel("plantChoices").setProperty("/rows", this._allPlantRows);
						this._setNotice("plant-all-error", "", "Error");
						if (!this._requestActive.plantData) {
							this.byId("plantTable").setBusy(false);
							var aVisiblePlants = this._activePlant ? this._allPlantRows.filter(function(oRow) {
								return String(oRow.werks || "") === this._activePlant;
							}.bind(this)) : this._allPlantRows;
							this._setTableNoData(this.byId("plantTable"), this._activePlant ? "No plant data found for " + this._activePlant + "." :
								"No plant records found.");
							this._setRows("plantData", aVisiblePlants);
							this._onPlantData(aVisiblePlants);
						}
					}.bind(this),
					error: function(oError) {
						if (iRequestId !== this._allPlantsRequestId) {
							return;
						}
						this._endMainBusy("plantAll");
						this._allPlantsLoading = false;
						if (!this._requestActive.plantData) {
							this.byId("plantTable").setBusy(false);
						}
						this._setNotice("plant-all-error", this._errorText(oError), "Error");
					}.bind(this)
				});
			} catch (oError) {
				if (iRequestId === this._allPlantsRequestId) {
					this._endMainBusy("plantAll");
					this._allPlantsLoading = false;
					this.byId("plantTable").setBusy(false);
					this._setNotice("plant-all-error", this._errorText(oError), "Error");
				}
			}
		},

		_onPlantData: function(aRows) {
			var oSummary = this.getView().getModel("summary");
			var oTotals = {
				poCount: 0,
				documentCount: 0,
				completed: 0,
				pending: 0,
				rejected: 0,
				cancelled: 0
			};
			aRows.forEach(function(oRow) {
				oTotals.poCount += this._num(oRow.ebeln);
				oTotals.documentCount += this._num(oRow.belnr);
				oTotals.completed += this._num(oRow.completed);
				oTotals.pending += this._num(oRow.pending);
				oTotals.rejected += this._num(oRow.rejected);
				oTotals.cancelled += this._num(oRow.cancelled);
			}.bind(this));
			oSummary.setProperty("/plantCount", String(aRows.length));
			oSummary.setProperty("/plantRows", String(aRows.length));
			Object.keys(oTotals).forEach(function(sKey) {
				oSummary.setProperty("/" + sKey, String(oTotals[sKey]));
			});
			if (!this._allPlantsLoaded) {
				this.getView().getModel("plantChoices").setProperty("/rows", aRows);
			}
			this._setNotice("plant-empty", aRows.length ? "" : "No plant data is available for this request.", "Information");
			if (this._activePlant) {
				var oSelectedPlant = aRows.find(function(oRow) {
					return String(oRow.werks || "") === this._activePlant;
				}.bind(this));
				this._activePlantName = oSelectedPlant && oSelectedPlant.plant_name || "";
				this.byId("selectedGrnPlant").setText(this._plantToolbarText(this._activePlant, this._activePlantName));
				if (this._grnRangeLoaded && (this._grnDateFrom || this._grnDateTo)) {
					this._setPoSummaryFromRows(this.getView().getModel("poData").getProperty("/rows") || []);
				} else {
					this._setPoSummary(oSelectedPlant);
				}
			}
			this._updateCharts(aRows);
		},

		_updateCharts: function(aRows) {
			var sScope = this._activePlant ? "Plant " + this._activePlant : "All Plants";
			this.byId("statusChartTitle").setText("Document Status (" + sScope + ")");
			this.byId("topPlantChartTitle").setText("Top 5 Plants by Total Documents (" + sScope + ")");
			var aStatus = [{
				label: "Completed",
				key: "completed",
				color: "#45ad7d"
			}, {
				label: "Pending",
				key: "pending",
				color: "#f2b33f"
			}, {
				label: "Rejected",
				key: "rejected",
				color: "#e65a65"
			}, {
				label: "Cancelled",
				key: "cancelled",
				color: "#91a0af"
			}];
			aStatus.forEach(function(oStatus) {
				oStatus.value = aRows.reduce(function(iSum, oRow) {
					return iSum + this._num(oRow[oStatus.key]);
				}.bind(this), 0);
			}.bind(this));
			var iStatusTotal = aStatus.reduce(function(iSum, oStatus) {
				return iSum + oStatus.value;
			}, 0);
			var iRunningPercent = 0;
			var aDonutLabels = [];
			var sGradient = aStatus.map(function(oStatus, iIndex) {
				var iStart = iRunningPercent;
				var iEnd = iIndex === aStatus.length - 1 ? 100 : (iStatusTotal ? iStart + oStatus.value / iStatusTotal * 100 : iStart);
				var iSlicePercent = iStatusTotal ? Math.round(oStatus.value / iStatusTotal * 100) : 0;
				if (iSlicePercent > 0) {
					var iMidAngle = (((iStart + iEnd) / 2) * 3.6 - 90) * Math.PI / 180;
					var iLeft = 50 + Math.cos(iMidAngle) * 42;
					var iTop = 50 + Math.sin(iMidAngle) * 42;
					aDonutLabels.push("<span class='statusDonutPct' style='left:" + iLeft.toFixed(1) + "%;top:" + iTop.toFixed(1) + "%'>" +
						iSlicePercent + "%</span>");
				}
				iRunningPercent = iEnd;
				return oStatus.color + " " + iStart.toFixed(2) + "% " + iEnd.toFixed(2) + "%";
			}).join(", ");
			var oStatusModel = this.getView().getModel("statusChart");
			oStatusModel.setProperty("/total", this._formatCount(iStatusTotal));
			oStatusModel.setProperty("/donutHtml", "<div class='statusDonut' style='background:conic-gradient(" + sGradient +
				")'>" + aDonutLabels.join("") + "<div class='statusDonutCenter'><strong>" + this._formatCount(iStatusTotal) +
				"</strong><span>Documents</span></div></div>");
			oStatusModel.setProperty("/rows", aStatus.map(function(oStatus) {
				var iPercent = iStatusTotal ? Math.round(oStatus.value / iStatusTotal * 100) : 0;
				return {
					status: oStatus.label,
					countText: this._formatCount(oStatus.value),
					percentText: iPercent + "%",
					state: oStatus.key === "completed" ? "Success" : oStatus.key === "pending" ? "Warning" : oStatus.key === "rejected" ? "Error" : "None"
				};
			}.bind(this)));

			var aTop = aRows.slice().sort(function(a, b) {
				return this._num(b.belnr) - this._num(a.belnr);
			}.bind(this)).slice(0, 5);
			var iMaxDocuments = aTop.length ? this._num(aTop[0].belnr) : 0;
			this.getView().getModel("topPlantChart").setProperty("/rows", aTop.map(function(oRow) {
				var iDocuments = this._num(oRow.belnr);
				var iPercent = iMaxDocuments ? iDocuments / iMaxDocuments * 100 : 0;
				return {
					plant: oRow.werks || "",
					documentsText: this._formatCount(iDocuments),
					barHtml: "<div class='topPlantTrack'><span style='width:" + iPercent.toFixed(1) + "%'></span></div>"
				};
			}.bind(this)));
		},

		_showCachedData: function(sTableId, fnDisplay) {
			this._cancelCachedDisplay(sTableId);
			var oTable = this.byId(sTableId);
			var iDisplayId = (this._cachedDisplayIds[sTableId] || 0) + 1;
			this._cachedDisplayIds[sTableId] = iDisplayId;
			this._cachedBusyDelays[sTableId] = oTable.getBusyIndicatorDelay();
			oTable.setBusyIndicatorDelay(0);
			oTable.setBusy(true);
			this._beginMainBusy("cache:" + sTableId);
			setTimeout(function() {
				if (this._cachedDisplayIds[sTableId] !== iDisplayId) {
					return;
				}
				try {
					fnDisplay();
				} finally {
					oTable.setBusy(false);
					oTable.setBusyIndicatorDelay(this._cachedBusyDelays[sTableId]);
					delete this._cachedBusyDelays[sTableId];
					this._endMainBusy("cache:" + sTableId);
				}
			}.bind(this), 120);
		},

		_cancelCachedDisplay: function(sTableId) {
			this._cachedDisplayIds[sTableId] = (this._cachedDisplayIds[sTableId] || 0) + 1;
			var oTable = this.byId(sTableId);
			if (oTable && this._cachedBusyDelays[sTableId] !== undefined) {
				oTable.setBusy(false);
				oTable.setBusyIndicatorDelay(this._cachedBusyDelays[sTableId]);
				delete this._cachedBusyDelays[sTableId];
			}
			this._endMainBusy("cache:" + sTableId);
		},

		_read: function(sModelName, sTableId, sPath, aFilters, sEmptyText, fnSuccess) {
			var oModel = this.getOwnerComponent().getModel();
			var oTable = this.byId(sTableId);
			var mSelectFields = {
				plantData: "werks,plant_name,ebeln,belnr,completed,pending,rejected,cancelled",
				poData: "ebeln,lifnr,lifnr_name,bedat,mblnr,mblnr_103,mblnr_105,completed,pending,rejected,cancelled,lgort",
				grnData: "mblnr,ebeln,bwart,lfbnr,xblnr,matnr,maktx,meins,menge,acqty,menge_i,rjqty,status,budat,budat_mkpf,cputm,lgort,usnam,bktxt,vend_age"
			};
			var sSignature = sPath + "|" + (aFilters || []).map(function(oFilter) {
				return [oFilter.sPath, oFilter.sOperator, oFilter.oValue1, oFilter.oValue2].join(":");
			}).join("|") + "|" + (mSelectFields[sModelName] || "");
			if (this._requestActive[sModelName] && this._requestSignatures[sModelName] === sSignature) {
				return;
			}
			this._cancelCachedDisplay(sTableId);
			var iRequestId = (this._requestIds[sModelName] || 0) + 1;
			this._requestIds[sModelName] = iRequestId;
			this._requestActive[sModelName] = iRequestId;
			this._requestSignatures[sModelName] = sSignature;
			this._endMainBusy("read:" + sModelName);
			this._beginMainBusy("read:" + sModelName);
			oTable.setBusy(true);
			this._setRows(sModelName, []);
			if (!oModel) {
				oTable.setBusy(false);
				this._endMainBusy("read:" + sModelName);
				this._setNotice(sModelName + "-error", "The report service model is unavailable.", "Error");
				this._clearTable(sModelName, sTableId, "Service unavailable.");
				return;
			}
			var mOptions = {
				success: function(oData) {
					if (this._requestIds[sModelName] !== iRequestId) {
						return;
					}
					delete this._requestActive[sModelName];
					delete this._requestSignatures[sModelName];
					this._endMainBusy("read:" + sModelName);
					oTable.setBusy(false);
					this._setNotice(sModelName + "-error", "", "Error");
					var aRows = oData && Array.isArray(oData.results) ? oData.results : [];
					this._setTableNoData(oTable, sEmptyText);
					this._setRows(sModelName, aRows);
					fnSuccess(aRows);
					if (sModelName === "poData") {
						this._applyPendingPoSelection();
					}
				}.bind(this),
				error: function(oError) {
					if (this._requestIds[sModelName] !== iRequestId) {
						return;
					}
					delete this._requestActive[sModelName];
					delete this._requestSignatures[sModelName];
					this._endMainBusy("read:" + sModelName);
					oTable.setBusy(false);
					this._setRows(sModelName, []);
					this._setTableNoData(oTable, "Data could not be loaded. Check the message above and try again.");
					this._setNotice(sModelName + "-error", this._errorText(oError), "Error");
				}.bind(this)
			};
			if (mSelectFields[sModelName]) {
				mOptions.urlParameters = {
					"$select": mSelectFields[sModelName]
				};
			}
			if (aFilters && aFilters.length) {
				mOptions.filters = aFilters;
			}
			try {
				oModel.read(sPath, mOptions);
			} catch (oError) {
				if (this._requestIds[sModelName] === iRequestId) {
					delete this._requestActive[sModelName];
					delete this._requestSignatures[sModelName];
					this._endMainBusy("read:" + sModelName);
					oTable.setBusy(false);
					this._setRows(sModelName, []);
					this._setNotice(sModelName + "-error", this._errorText(oError), "Error");
				}
			}
		},

		_setTableNoData: function(oTable, sText) {
			if (oTable.setNoDataText) {
				oTable.setNoDataText(sText);
			} else {
				oTable.setNoData(new Text({
					text: sText
				}));
			}
		},

		_eq: function(sPath, sValue) {
			return new Filter(sPath, FilterOperator.EQ, sValue);
		},

		_createRowsModel: function() {
			var oModel = new JSONModel({
				rows: []
			});
			// Keep large plant and PO result sets available to their virtualized table and suggestion bindings.
			oModel.setSizeLimit(100000);
			return oModel;
		},

		_resetSummary: function() {
			var oSummary = this.getView().getModel("summary");
			["plantCount", "poCount", "documentCount", "completed", "pending", "rejected", "cancelled", "plantRows"].forEach(function(sKey) {
				oSummary.setProperty("/" + sKey, "0");
			});
			this._updateCharts([]);
		},

		_setPoSummary: function(oPlant) {
			var oModel = this.getView().getModel("poSummary");
			["poCount", "documentCount", "completed", "pending", "rejected", "cancelled"].forEach(function(sKey) {
				var sSource = sKey === "poCount" ? "ebeln" : sKey === "documentCount" ? "belnr" : sKey;
				oModel.setProperty("/" + sKey, oPlant ? this._formatCount(oPlant[sSource]) : "0");
			}.bind(this));
		},

		_resetPoSummary: function() {
			this._setPoSummary(null);
		},

		_clearTable: function(sModelName, sTableId, sText) {
			this._cancelCachedDisplay(sTableId);
			this._requestIds[sModelName] = (this._requestIds[sModelName] || 0) + 1;
			delete this._requestActive[sModelName];
			delete this._requestSignatures[sModelName];
			this._endMainBusy("read:" + sModelName);
			if (sModelName === "grnData") {
				this._grnSourceRows = [];
				this._setGrnStatusCounts([]);
				this.byId("grnStatusFilter").setSelectedKey("ALL");
			}
			this.byId(sTableId).setBusy(false);
			this._setTableNoData(this.byId(sTableId), sText);
			this._setRows(sModelName, []);
		},

		_cancelTableRead: function(sModelName, sTableId) {
			this._cancelCachedDisplay(sTableId);
			this._requestIds[sModelName] = (this._requestIds[sModelName] || 0) + 1;
			delete this._requestActive[sModelName];
			delete this._requestSignatures[sModelName];
			this._endMainBusy("read:" + sModelName);
			this.byId(sTableId).setBusy(false);
		},

		_clearTableSelections: function() {
			this.byId("plantTable").clearSelection();
			this.byId("poTable").clearSelection();
		},

		_cacheRows: function(oCache, sKey, aRows, iLimit) {
			if (Object.prototype.hasOwnProperty.call(oCache, sKey)) {
				delete oCache[sKey];
			}
			oCache[sKey] = aRows;
			var aKeys = Object.keys(oCache);
			while (aKeys.length > iLimit) {
				delete oCache[aKeys.shift()];
			}
		},

		_setDetailPanelState: function(sPlant, sPo) {
			this.byId("poPanel").setExpanded(!!sPlant);
			this.byId("grnPanel").setExpanded(!!sPlant && !!sPo);
		},

		_beginMainBusy: function(sKey) {
			if (this._mainBusyRequests[sKey]) {
				return;
			}
			this._mainBusyRequests[sKey] = true;
			this._mainBusyCount++;
			this.byId("reportPage").setBusy(true);
		},

		_endMainBusy: function(sKey) {
			if (!this._mainBusyRequests[sKey]) {
				return;
			}
			delete this._mainBusyRequests[sKey];
			this._mainBusyCount = Math.max(0, this._mainBusyCount - 1);
			if (this._mainBusyCount === 0) {
				this.byId("reportPage").setBusy(false);
			}
		},

		_setRows: function(sName, aRows) {
			this.getView().getModel(sName).setProperty("/rows", aRows);
		},

		_setNotice: function(sKey, sText, sType) {
			if (sText) {
				this._notices[sKey] = {
					text: sText,
					type: sType
				};
			} else {
				delete this._notices[sKey];
			}
			this._renderNotices();
		},

		_renderNotices: function() {
			var aNotices = Object.keys(this._notices || {}).map(function(sKey) {
				return this._notices[sKey];
			}.bind(this));
			var oStrip = this.byId("messageStrip");
			if (!oStrip) {
				return;
			}
			oStrip.setVisible(aNotices.length > 0);
			if (aNotices.length) {
				oStrip.setText(aNotices.map(function(oNotice) {
					return oNotice.text;
				}).join(" "));
				oStrip.setType(aNotices.some(function(oNotice) {
						return oNotice.type === "Error";
					}) ? "Error" :
					aNotices.some(function(oNotice) {
						return oNotice.type === "Warning";
					}) ? "Warning" : "Information");
			}
		},

		_num: function(vValue) {
			var sValue = String(vValue == null ? "" : vValue).replace(/,/g, "").trim();
			var iValue = parseFloat(sValue);
			return isNaN(iValue) ? 0 : iValue;
		},

		_formatCount: function(iValue) {
			return Math.round(this._num(iValue)).toLocaleString();
		},

		_scrollTo: function(sId) {
			var oTarget = this.byId(sId);
			setTimeout(function() {
				if (oTarget && oTarget.getDomRef()) {
					this.byId("reportPage").scrollToElement(oTarget.getDomRef(), 250);
				}
			}.bind(this), 0);
		},

		_errorText: function(oError) {
			try {
				var oBody = JSON.parse(oError.responseText || "{}");
				return (oBody.error && oBody.error.message && oBody.error.message.value) || "Unable to load report data. Please try again.";
			} catch (e) {
				return (oError && oError.message) || "Unable to load report data. Check the service connection and try again.";
			}
		},

		onExport: function() {
			var aRows = this.getView().getModel("grnData").getProperty("/rows") || [];
			if (!aRows.length) {
				MessageToast.show("There are no GRN rows to export.");
				return;
			}
			var aColumns = [{
				key: "mblnr",
				label: "Material Document"
			}, {
				key: "bwart",
				label: "Movement"
			}, {
				key: "lfbnr",
				label: "Reference Doc."
			}, {
				key: "xblnr",
				label: "Invoice"
			}, {
				key: "matnr",
				label: "Material"
			}, {
				key: "maktx",
				label: "Description"
			}, {
				key: "meins",
				label: "UoM"
			}, {
				key: "menge",
				label: "PO Qty"
			}, {
				key: "acqty",
				label: "GRN Qty"
			}, {
				key: "menge_i",
				label: "Invoice Qty"
			}, {
				key: "rjqty",
				label: "Rejection Qty"
			}, {
				key: "status",
				label: "Status"
			}, {
				key: "budat",
				label: "GRN Date"
			}, {
				key: "budat_mkpf",
				label: "Post Date"
			}, {
				key: "cputm",
				label: "Time"
			}, {
				key: "lgort",
				label: "Storage"
			}, {
				key: "usnam",
				label: "GRN User"
			}, {
				key: "bktxt",
				label: "Remarks"
			}, {
				key: "vend_age",
				label: "Ageing (Days)"
			}];
			var fnCsvCell = function(vValue) {
				return '"' + String(vValue == null ? "" : vValue).replace(/"/g, '""') + '"';
			};
			var sCsv = [aColumns.map(function(oColumn) {
				return fnCsvCell(oColumn.label);
			}).join(",")].concat(aRows.map(function(oRow) {
				return aColumns.map(function(oColumn) {
					return fnCsvCell(oRow[oColumn.key]);
				}).join(",");
			})).join("\r\n");
			var oBlob = new Blob(["\ufeff" + sCsv], {
				type: "text/csv;charset=utf-8;"
			});
			var oLink = document.createElement("a");
			oLink.href = URL.createObjectURL(oBlob);
			oLink.download = "GRN_Details_" + (this._activePlant || "all-plants") + "_" + (this._activePo || "all") + ".csv";
			oLink.click();
			setTimeout(function() {
				URL.revokeObjectURL(oLink.href);
			}, 0);
		}
	});
});
