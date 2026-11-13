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
				plantCount: "0",
				poCount: "0",
				documentCount: "0",
				completed: "0",
				pending: "0",
				rejected: "0",
				cancelled: "0",
				plantRows: "0"
			}), "summary");
			this._activePlant = "";
			this._activePo = "";
			this._grnDateFrom = null;
			this._grnDateTo = null;
			this._requestIds = {};
			this._requestActive = {};
			this._mainBusyRequests = {};
			this._mainBusyCount = 0;
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
			this._activePo = "";
			this._notices = {};
			this._renderNotices();
			if (oDateRange.error) {
				this._setNotice("validation", oDateRange.error, "Warning");
				return;
			}
			this._grnDateFrom = oDateRange.from;
			this._grnDateTo = oDateRange.to;
			this._resetSummary();

			this.byId("selectedPlant").setText(sPlant ? "Plant: " + sPlant : "All plants");
			this.byId("selectedPo").setText("Select a PO");
			if (sPlant) {
				this._read("plantData", "plantTable", "/es_plant_wiseset", [this._eq("werks", sPlant)],
					"No plants found for the selected filter.", this._onPlantData.bind(this));
				this.byId("poInput").setPlaceholder("Enter or select a PO");
				this._loadPos(sPlant);
				if (sPo) {
					this._activePo = sPo;
					this.byId("selectedPo").setText("PO: " + sPo);
					this._loadGrns(sPlant, sPo);
				} else {
					this._clearTable("grnData", "grnTable", "Enter or select a PO to view GRN details.");
					this.byId("grnFooter").setText("Select a PO to view its GRN documents.");
				}
			} else {
				this._requestIds.plantData = (this._requestIds.plantData || 0) + 1;
				delete this._requestActive.plantData;
				this.byId("poInput").setPlaceholder("Select a plant first");
				this._loadAllPlants(false);
				this._clearTable("poData", "poTable", "Choose a plant to load its purchase orders.");
				this._clearTable("grnData", "grnTable", "Choose a plant and PO to load GRN documents.");
				this.byId("grnFooter").setText("Select a plant and PO to view GRN documents.");
				if (sPo) {
					this._setNotice("validation", "Select a plant before loading GRN details for a PO.", "Warning");
				} else if (this._grnDateFrom || this._grnDateTo) {
					this._setNotice("date-filter", "Choose a plant and PO to apply the GRN date range to document details.", "Information");
				}
			}
		},

		onReset: function() {
			this.byId("plantInput").setValue("");
			this.byId("poInput").setValue("");
			this.byId("grnDateFrom").setValue("");
			this.byId("grnDateTo").setValue("");
			this.onGo();
		},

		onRefresh: function() {
			this.byId("plantInput").setValue("");
			this.byId("poInput").setValue("");
			this.byId("grnDateFrom").setValue("");
			this.byId("grnDateTo").setValue("");
			this._activePlant = "";
			this._activePo = "";
			this._grnDateFrom = null;
			this._grnDateTo = null;
			this._notices = {};
			this._renderNotices();
			this._resetSummary();
			this.byId("selectedPlant").setText("All plants");
			this.byId("selectedPo").setText("Select a PO");
			this.byId("poInput").setPlaceholder("Select a plant first");
			this._clearTable("plantData", "plantTable", "Loading all plants…");
			this._clearTable("poData", "poTable", "Choose a plant to load its purchase orders.");
			this._clearTable("grnData", "grnTable", "Choose a plant and PO to load GRN documents.");
			this.byId("grnFooter").setText("Select a plant and PO to view GRN documents.");
			this._allPlantsLoaded = false;
			this._allPlantRows = [];
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
				this.byId("poInput").setValue(oItem.getKey());
			}
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
			this._updateCharts([oRow]);
			this._activePo = "";
			this.byId("plantInput").setValue(oRow.werks);
			this.byId("poInput").setValue("");
			this.byId("poInput").setPlaceholder("Enter or select a PO");
			this.byId("selectedPlant").setText("Plant: " + oRow.werks);
			this.byId("selectedPo").setText("Select a PO");
			this._loadPos(oRow.werks);
			this._clearTable("grnData", "grnTable", "Choose a PO to load GRN documents.");
			this.byId("grnFooter").setText("Select a PO to view its GRN documents.");
			this._scrollTo("poPanel");
		},

		onPoSelect: function(oEvent) {
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
			this.byId("poInput").setValue(oRow.ebeln);
			this.byId("selectedPo").setText("PO: " + oRow.ebeln);
			this._loadGrns(this._activePlant, oRow.ebeln);
			this._scrollTo("grnPanel");
		},

		_loadPos: function(sPlant) {
			this._read("poData", "poTable", "/es_powiseset", [this._eq("werks", sPlant)],
				"No purchase orders found for plant " + sPlant + ".",
				function() {});
		},

		_loadGrns: function(sPlant, sPo) {
			if (!sPlant || !sPo) {
				this._setNotice("validation", "Choose both a plant and a PO to load GRN details.", "Warning");
				return;
			}
			this._read("grnData", "grnTable", "/es_grnset", [this._eq("werks", sPlant), this._eq("ebeln", sPo)],
				"No GRN documents found for PO " + sPo + " at plant " + sPlant + ".",
				function(aRows) {
					var oFiltered = this._applyGrnDateRange(aRows);
					this._setRows("grnData", oFiltered.rows);
					this._setTableNoData(this.byId("grnTable"), "No GRN documents match the selected date range.");
					this.byId("grnFooter").setText("Showing " + oFiltered.rows.length + " material document" + (oFiltered.rows.length === 1 ? "" :
							"s") +
						" for PO " + sPo + " at plant " + sPlant + ".");
					this._setNotice("grn-empty", oFiltered.rows.length ? "" : "No GRN documents match the selected plant, PO, and date range.",
						"Information");
					this._setNotice("date-format", oFiltered.unparsed ? oFiltered.unparsed +
						" GRN row(s) had an unrecognized date and were excluded from the date range." : "", "Warning");
				}.bind(this));
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

		_applyGrnDateRange: function(aRows) {
			if (!this._grnDateFrom && !this._grnDateTo) {
				return {
					rows: aRows,
					unparsed: 0
				};
			}
			var iFrom = this._grnDateFrom ? this._dateKey(this._grnDateFrom) : null;
			var iTo = this._grnDateTo ? this._dateKey(this._grnDateTo) : null;
			var iUnparsed = 0;
			var aFiltered = aRows.filter(function(oRow) {
				var iDate = this._serviceDateKey(oRow.budat);
				if (iDate === null) {
					iUnparsed++;
					return false;
				}
				return (iFrom === null || iDate >= iFrom) && (iTo === null || iDate <= iTo);
			}.bind(this));
			return {
				rows: aFiltered,
				unparsed: iUnparsed
			};
		},

		_dateKey: function(oDate) {
			return oDate.getFullYear() * 10000 + (oDate.getMonth() + 1) * 100 + oDate.getDate();
		},

		_serviceDateKey: function(vDate) {
			if (vDate instanceof Date && !isNaN(vDate.getTime())) {
				return this._dateKey(vDate);
			}
			var sDate = String(vDate == null ? "" : vDate).trim();
			var aMatch = /\/Date\((\d+)\)\//.exec(sDate);
			if (aMatch) {
				var oParsed = new Date(parseInt(aMatch[1], 10));
				return isNaN(oParsed.getTime()) ? null : this._dateKey(oParsed);
			}
			aMatch = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(sDate);
			if (aMatch) {
				return this._validatedDateKey(+aMatch[1], +aMatch[2], +aMatch[3]);
			}
			aMatch = /^(\d{4})(\d{2})(\d{2})$/.exec(sDate);
			if (aMatch) {
				return this._validatedDateKey(+aMatch[1], +aMatch[2], +aMatch[3]);
			}
			aMatch = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(sDate);
			if (aMatch) {
				return this._validatedDateKey(+aMatch[3], +aMatch[2], +aMatch[1]);
			}
			return null;
		},

		_validatedDateKey: function(iYear, iMonth, iDay) {
			var oDate = new Date(iYear, iMonth - 1, iDay);
			if (oDate.getFullYear() !== iYear || oDate.getMonth() !== iMonth - 1 || oDate.getDate() !== iDay) {
				return null;
			}
			return this._dateKey(oDate);
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
				")'>" + aDonutLabels.join("") + "<div class='statusDonutCenter'><strong>" + this._formatCount(iStatusTotal) + "</strong><span>Documents</span></div></div>");
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

		_read: function(sModelName, sTableId, sPath, aFilters, sEmptyText, fnSuccess) {
			var oModel = this.getOwnerComponent().getModel();
			var oTable = this.byId(sTableId);
			var iRequestId = (this._requestIds[sModelName] || 0) + 1;
			this._requestIds[sModelName] = iRequestId;
			this._requestActive[sModelName] = iRequestId;
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
					this._endMainBusy("read:" + sModelName);
					oTable.setBusy(false);
					this._setNotice(sModelName + "-error", "", "Error");
					var aRows = oData && Array.isArray(oData.results) ? oData.results : [];
					this._setTableNoData(oTable, sEmptyText);
					this._setRows(sModelName, aRows);
					fnSuccess(aRows);
				}.bind(this),
				error: function(oError) {
					if (this._requestIds[sModelName] !== iRequestId) {
						return;
					}
					delete this._requestActive[sModelName];
					this._endMainBusy("read:" + sModelName);
					oTable.setBusy(false);
					this._setRows(sModelName, []);
					this._setTableNoData(oTable, "Data could not be loaded. Check the message above and try again.");
					this._setNotice(sModelName + "-error", this._errorText(oError), "Error");
				}.bind(this)
			};
			if (aFilters && aFilters.length) {
				mOptions.filters = aFilters;
			}
			try {
				oModel.read(sPath, mOptions);
			} catch (oError) {
				if (this._requestIds[sModelName] === iRequestId) {
					delete this._requestActive[sModelName];
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

		_clearTable: function(sModelName, sTableId, sText) {
			this._requestIds[sModelName] = (this._requestIds[sModelName] || 0) + 1;
			delete this._requestActive[sModelName];
			this._endMainBusy("read:" + sModelName);
			this.byId(sTableId).setBusy(false);
			this._setTableNoData(this.byId(sTableId), sText);
			this._setRows(sModelName, []);
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
			var aColumns = ["mblnr", "bwart", "lfbnr", "xblnr", "matnr", "maktx", "meins", "menge", "acqty", "menge_i", "rjqty", "status",
				"budat", "budat_mkpf", "cputm", "lgort", "usnam", "bktxt", "vend_age"
			];
			var sCsv = [aColumns.join(",")].concat(aRows.map(function(oRow) {
				return aColumns.map(function(sKey) {
					return '"' + String(oRow[sKey] == null ? "" : oRow[sKey]).replace(/"/g, '""') + '"';
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
